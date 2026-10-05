-- export-screen.lua: dump the PPU state of the current screen (pattern tables, the active
-- nametable, palette RAM, OAM).
--
-- Source of tools/data/ball-practice.g3px (see tools/recording.py).
-- Written for Mesen 2.2.1 (MesenCE). API checked against Core/Debugger/LuaApi.cpp.
-- Needs "Allow access to I/O and OS functions".
--
-- Two ways to use it:
--  1. Interactive (default): play to the screen you want (the ball-practice screen is only
--     reachable through the menus), then open and run this script in the Script Window
--     (Debug -> Script Window). It captures STABLE_FOR frames later and stops.
--  2. Headless, waiting for a game-mode byte ($0058), with MANUAL = false:
--       Mesen.exe --testrunner rom/<rom>.nes tools/mesen/export-screen.lua
--     Only for screens the game reaches on its own (e.g. the attract-mode demo).
--
-- Settings (globals a wrapper can set before dofile()-ing this script):
--   MANUAL      false = headless mode (default true)
--   WAIT_MODE   game mode ($0058) to capture (default 1, headless mode only)
--   MIN_FRAME   ignore mode matches before this frame (default 0)
--   STABLE_FOR  frames to wait / the mode must hold before capturing (default 30)
--   STOP_AFTER  safety limit in frames (default 1800 = 30s)
--   OUT_NAME    output file stem (default "ball-practice")
--
-- Assumes a static (non-scrolling) screen: reads the nametable at the base address from
-- the PPU's temp VRAM address register (set by the last $2000/$2005/$2006 writes), not the
-- live scanline-advanced one, and ignores fine scroll.
--
-- Output: tools/.cache/<OUT_NAME>.g3px in this repository if the ROM is loaded from rom/,
-- else Mesen's per-script data folder. All integers little-endian.
--   header   "G3PX" (4 bytes), version u8 = 1
--   u32      frames since the script started when captured
--   u16      background pattern table base ($0000 or $1000)
--   u16      sprite pattern table base ($0000 or $1000)
--   u8       large sprites (8x16) flag
--   u16      nametable base used ($2000/$2400/$2800/$2C00)
--   32       palette RAM (paletteRam0..31: entry 0 of each 4-byte group is the shared
--            backdrop colour)
--   8192     pattern tables $0000-$1FFF (both, as currently CHR-banked)
--   1024     nametable + attribute table, 1 KB at the base above
--   256      OAM (sprite RAM): 64 sprites x (y, tile, attr, x)

local MANUAL = MANUAL ~= false
local WAIT_MODE = WAIT_MODE or 1
local MIN_FRAME = MIN_FRAME or 0
local STABLE_FOR = STABLE_FOR or 30
local STOP_AFTER = STOP_AFTER or 1800
local OUT_NAME = OUT_NAME or "ball-practice"

local function ram(addr)
  return emu.read(addr, emu.memType.nesInternalRam)
end

local function readBlock(addr, size, memType)
  local bytes = {}
  for i = 0, size - 1 do
    bytes[i + 1] = emu.read(addr + i, memType)
  end
  local parts = {}
  for i = 1, size, 256 do
    parts[#parts + 1] = string.char(table.unpack(bytes, i, math.min(i + 255, size)))
  end
  return table.concat(parts)
end

local function outputPath()
  local repo = (emu.getRomInfo().path or ""):gsub("\\", "/"):match("^(.*)/rom/[^/]*$")
  if repo then
    local dir = repo .. "/tools/.cache"
    os.execute('mkdir "' .. dir:gsub("/", "\\") .. '" 2>nul')
    return dir .. "/" .. OUT_NAME .. ".g3px"
  end
  return emu.getScriptDataFolder() .. "/" .. OUT_NAME .. ".g3px"
end

if not io then
  error("enable 'Allow access to I/O and OS functions' in the script settings")
end

local stable = 0
local frame = 0

local function capture()
  -- emu.getState() returns a flat table keyed by dotted path strings, e.g.
  -- st["ppu.control.backgroundPatternAddr"], not nested subtables.
  local st = emu.getState()
  local bgPatternAddr = st["ppu.control.backgroundPatternAddr"]
  local spritePatternAddr = st["ppu.control.spritePatternAddr"]
  local largeSprites = st["ppu.control.largeSprites"]
  local tmpVideoRamAddr = math.floor(st["ppu.tmpVideoRamAddr"])
  local nametableSelect = (tmpVideoRamAddr >> 10) & 0x3
  local nametableBase = 0x2000 + nametableSelect * 0x400

  local palette = {}
  for i = 0, 31 do
    palette[i + 1] = st["ppu.paletteRam" .. i]
  end

  local path = outputPath()
  local file = assert(io.open(path, "wb"))
  file:write(
    "G3PX",
    string.pack("<I1", 1),
    string.pack("<I4", frame),
    string.pack("<I2I2I1", bgPatternAddr, spritePatternAddr, largeSprites and 1 or 0),
    string.pack("<I2", nametableBase),
    string.char(table.unpack(palette)),
    readBlock(0x0000, 0x2000, emu.memType.nesPpuMemory),
    readBlock(nametableBase, 0x400, emu.memType.nesPpuMemory),
    readBlock(0x00, 0x100, emu.memType.nesSpriteRam)
  )
  file:close()
  emu.log("export-screen: captured at frame " .. frame .. " -> " .. path)
  emu.stop(0)
end

if MANUAL then
  emu.addEventCallback(function()
    frame = frame + 1
    emu.drawString(2, 2, "capturing in " .. (STABLE_FOR - frame), 0xFFE040)
    if frame >= STABLE_FOR then
      capture()
    end
  end, emu.eventType.endFrame)
else
  emu.addEventCallback(function()
    frame = frame + 1
    if ram(0x58) == WAIT_MODE and frame >= MIN_FRAME then
      stable = stable + 1
    else
      stable = 0
    end
    emu.drawString(2, 2, "wait " .. WAIT_MODE .. " (" .. stable .. "/" .. STABLE_FOR .. ")", 0xFFE040)
    if stable >= STABLE_FOR then
      capture()
    elseif frame >= STOP_AFTER then
      emu.log("export-screen: mode " .. WAIT_MODE .. " not reached within " .. STOP_AFTER .. " frames")
      emu.stop(1)
    end
  end, emu.eventType.endFrame)
end

-- frame-dump.lua: record player input, the NES internal RAM and OAM every frame.
--
-- Source of tools/data/ball-practice.fdump.gz (see tools/recording.py).
-- Written for Mesen 2.2.1 (MesenCE). API checked against Core/Debugger/LuaApi.cpp.
--
-- Requires: Script Window settings -> "Allow access to I/O and OS functions".
-- Recording runs from the moment the script starts until it is stopped.
--
-- Output: tools/.cache/<rom name>-<timestamp>.fdump in this repository if the ROM
-- is loaded from rom/, otherwise in Mesen's per-script data folder.
--
-- File format (all integers little-endian):
--   header:  "G3FD" (4 bytes), version u8 = 1, record size u16
--   records: one per frame, in order
--     u32   frame number since the script started (0-based)
--     u8    player 1 buttons: bit 0 A, 1 B, 2 Select, 3 Start,
--           4 Up, 5 Down, 6 Left, 7 Right
--     u8    player 2 buttons, same layout
--     u8    input polls during the frame (0 can hint at a lag frame)
--     2048  internal RAM $0000-$07FF
--     256   OAM (sprite RAM)

local FORMAT_VERSION = 1
local RAM_SIZE = 0x800
local OAM_SIZE = 0x100
local RECORD_SIZE = 4 + 1 + 1 + 1 + RAM_SIZE + OAM_SIZE
local BUTTONS = { "a", "b", "select", "start", "up", "down", "left", "right" }

local function outputDir()
  -- Prefer <repo>/tools/.cache when the ROM is loaded from <repo>/rom/. (The script's
  -- own path is not known when it is opened in the Script Window.)
  local romPath = (emu.getRomInfo().path or ""):gsub("\\", "/")
  local repo = romPath:match("^(.*)/rom/[^/]*$")
  if repo then
    local dir = repo .. "/tools/.cache"
    os.execute('mkdir "' .. dir:gsub("/", "\\") .. '" 2>nul')
    return dir
  end
  return emu.getScriptDataFolder()
end

local function inputMask(port)
  local input = emu.getInput(port)
  local mask = 0
  for bit, name in ipairs(BUTTONS) do
    if input[name] then
      mask = mask | (1 << (bit - 1))
    end
  end
  return mask
end

local function readBlock(memType, size)
  local bytes = {}
  for addr = 0, size - 1 do
    bytes[addr + 1] = emu.read(addr, memType)
  end
  -- string.char takes a limited number of arguments, so convert in chunks.
  local parts = {}
  for i = 1, size, 256 do
    parts[#parts + 1] = string.char(table.unpack(bytes, i, math.min(i + 255, size)))
  end
  return table.concat(parts)
end

if not io then
  emu.displayMessage("frame-dump", "Enable 'Allow access to I/O and OS functions' in the script settings")
  error("io library not available")
end

local romName = (emu.getRomInfo().name or "rom"):gsub("%.[^.]*$", ""):gsub("[^%w%-_]", "_")
local path = outputDir() .. "/" .. romName .. "-" .. os.date("%Y%m%d-%H%M%S") .. ".fdump"
local file = assert(io.open(path, "wb"))
file:write("G3FD", string.pack("<I1I2", FORMAT_VERSION, RECORD_SIZE))

local frame = 0
local polls = 0

emu.addEventCallback(function()
  polls = polls + 1
end, emu.eventType.inputPolled)

emu.addEventCallback(function()
  file:write(
    string.pack("<I4I1I1I1", frame, inputMask(0), inputMask(1), math.min(polls, 255)),
    readBlock(emu.memType.nesInternalRam, RAM_SIZE),
    readBlock(emu.memType.nesSpriteRam, OAM_SIZE)
  )
  frame = frame + 1
  polls = 0
  if frame % 60 == 0 then
    file:flush()
  end
  emu.drawString(2, 2, "REC " .. frame, 0xFF4040)
end, emu.eventType.endFrame)

emu.addEventCallback(function()
  file:close()
  emu.log("frame-dump: " .. frame .. " frames written to " .. path)
end, emu.eventType.scriptEnded)

emu.log("frame-dump: recording to " .. path)

-- apu-log.lua: log the sound chip register writes ($4000-$4017) of every frame, plus the DPCM
-- sample bytes the game plays and the player/ball position, while feeding scripted input.
--
-- Run headless by tools/capture_audio.py, which prepends the settings below:
--   OUT    output file
--   LAST   frame to stop at
--   INPUT  { [frame] = { a = true, ... } }: player 1 buttons per frame (from the movie and the plan)
--
-- Written for Mesen 2.2.1 (MesenCE), run as: Mesen.exe --testrunner <rom> <script>
-- (the --testrunner mode allows I/O without the Script Window setting).
--
-- Output, one line each:
--   <frame> <addr> <value>         a register write, hex, in the order the game made them
--   S <frame> <px> <pz> <bx> <bz>  end of frame: player and ball x/z pixels
--   D <addr> <bytes>               a DPCM sample's bytes (hex), once per sample address and length

local NL = string.char(10)
local frame = 0
local log = assert(io.open(OUT, "w"))
local dmcAddr, dmcLen = 0, 0
local dumped = {}

local function ram(a) return emu.read(a, emu.memType.nesInternalRam) end

emu.addMemoryCallback(function(addr, value)
  if addr == 0x4014 or addr == 0x4016 then return end -- sprite DMA and pad strobe
  log:write(string.format("%d %04X %02X", frame, addr, value), NL)
  if addr == 0x4012 then dmcAddr = 0xC000 + value * 64 end
  if addr == 0x4013 then dmcLen = value * 16 + 1 end
  if addr == 0x4015 and (value & 0x10) ~= 0 and dmcLen > 0 then
    local key = dmcAddr .. ":" .. dmcLen
    if not dumped[key] then
      dumped[key] = true
      local bytes = {}
      for i = 0, dmcLen - 1 do bytes[#bytes + 1] = string.format("%02X", emu.read(dmcAddr + i, emu.memType.nesDebug)) end
      log:write(string.format("D %04X ", dmcAddr), table.concat(bytes), NL)
    end
  end
end, emu.callbackType.write, 0x4000, 0x4017)

emu.addEventCallback(function()
  local buttons = INPUT[frame]
  if buttons then emu.setInput(buttons, 0) end
end, emu.eventType.inputPolled)

emu.addEventCallback(function()
  frame = frame + 1
  log:write(string.format("S %d %d %d %d %d", frame, ram(0x314), ram(0x386), ram(0x320), ram(0x392)), NL)
  if frame >= LAST then
    log:close()
    emu.stop(0)
  end
end, emu.eventType.endFrame)

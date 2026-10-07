-- sim-dump.lua: feed scripted input and record the NES internal RAM and OAM every frame, in the
-- frame-dump.lua format (see tools/recording.py), for tools/simulate.py.
--
-- Run headless by tools/simulate.py, which prepends the settings below:
--   OUT    output file
--   FIRST  first frame to record (the frames before it are only played)
--   LAST   frame to stop at
--   INPUT  { [frame] = { a = true, ... } }: player 1 buttons per frame
--
-- Written for Mesen 2.2.1 (MesenCE), run as: Mesen.exe --testrunner <rom> <script>

local RAM_SIZE = 0x800
local OAM_SIZE = 0x100
local RECORD_SIZE = 4 + 1 + 1 + 1 + RAM_SIZE + OAM_SIZE
local BUTTONS = { "a", "b", "select", "start", "up", "down", "left", "right" }

local file = assert(io.open(OUT, "wb"))
file:write("G3FD", string.pack("<I1I2", 1, RECORD_SIZE))
local frame = 0
local polls = 0

local function mask(buttons)
  local m = 0
  for bit, name in ipairs(BUTTONS) do
    if buttons and buttons[name] then m = m | (1 << (bit - 1)) end
  end
  return m
end

local function readBlock(memType, size)
  local parts = {}
  for i = 0, size - 1, 256 do
    local bytes = {}
    for a = i, math.min(i + 255, size - 1) do bytes[#bytes + 1] = emu.read(a, memType) end
    parts[#parts + 1] = string.char(table.unpack(bytes))
  end
  return table.concat(parts)
end

emu.addEventCallback(function()
  polls = polls + 1
  local buttons = INPUT[frame]
  if buttons then emu.setInput(buttons, 0) end
end, emu.eventType.inputPolled)

emu.addEventCallback(function()
  if frame >= FIRST then
    file:write(
      string.pack("<I4I1I1I1", frame, mask(INPUT[frame]), 0, math.min(polls, 255)),
      readBlock(emu.memType.nesInternalRam, RAM_SIZE),
      readBlock(emu.memType.nesSpriteRam, OAM_SIZE)
    )
  end
  frame = frame + 1
  polls = 0
  if frame >= LAST then
    file:close()
    emu.stop(0)
  end
end, emu.eventType.endFrame)

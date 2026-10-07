"""Capture the ball-practice music and sound effects from the original and write js/audio/sound-data.js.

Runs Mesen 2 headless (--testrunner) with tools/mesen/apu-log.lua: the input of the movie in
docs/reference/movies/nsl-jp.mmo (power-on, START: the ball-practice screen from frame 848), then a
scripted action per run. The logs of the sound chip register writes give:

  music  the run without input: an intro once, then a loop of LOOP_FRAMES frames (the song repeats
         every 72.2 s, notes now and then a frame off between passes; the loop starts where the
         register state and the following writes match one period later, so the seam is clean)
  sfx    the writes that differ from a run without the action, on the channels the effect takes
         (the game's sound engine takes a channel from the music for the length of an effect)

Needs your own ROM dump at rom/nsl-jp.nes and Mesen 2.2.1 (set MESEN or have `mesen` on PATH).
Logs go to tools/.cache/audio/ (git-ignored). Python 3.10+, stdlib only.

  py tools/capture_audio.py
"""
import base64
import os
import shutil
import subprocess
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROM = ROOT / "rom" / "nsl-jp.nes"
MOVIE = ROOT / "docs" / "reference" / "movies" / "nsl-jp.mmo"
SCRIPT = ROOT / "tools" / "mesen" / "apu-log.lua"
CACHE = ROOT / "tools" / ".cache" / "audio"
OUT = ROOT / "js" / "audio" / "sound-data.js"

MUSIC_START = 849        # first frame of the ball-practice song
LOOP_FRAMES = 4337       # the song's period, 72.2 s
SEAM_FRAMES = 120        # writes that must match one period later after the loop start
MUSIC_RUN = MUSIC_START + 3 * LOOP_FRAMES

PASS = [(1000, 1003, {"a": True})]
# name: (frames to run, plan of (from, to, buttons))
RUNS = {
    "idle": (1500, []),
    "pass": (1500, PASS),                                     # A with the ball: kick, then the ball bounces
    "shot": (1500, [(1000, 1003, {"b": True})]),              # B with the ball
    "pass-jump": (1500, PASS + [(1300, 1304, {"a": True, "b": True})]),
    "pass-run": (1500, PASS + [(1300, 1303, {"right": True}), (1306, 1340, {"right": True})]),
}
# effect: (run, run it is compared with, first frame, last frame); found by diffing the runs
SFX = {
    "kick": ("pass", "idle", 1015, 1032),
    "shot": ("shot", "idle", 1021, 1104),       # the kick and the ball's whoosh until it lands
    "bounce": ("pass", "idle", 1117, 1125),
    "jump": ("pass-jump", "pass", 1300, 1309),
    "land": ("pass-jump", "pass", 1348, 1354),
    "pickup": ("pass-run", "pass", 1375, 1396),  # running into the ball and taking it
}

CHANNELS = {"p1": range(0x00, 0x04), "p2": range(0x04, 0x08), "tri": range(0x08, 0x0C),
            "noise": range(0x0C, 0x10), "dmc": range(0x10, 0x14)}
BUTTONS = "UDLRSsBA"  # Mesen movie order for an NES pad
BUTTON_NAMES = {"U": "up", "D": "down", "L": "left", "R": "right", "S": "start", "s": "select", "B": "b", "A": "a"}


def channel(reg):
    return next((c for c, r in CHANNELS.items() if reg in r), "ctl")


def movie_input():
    lines = zipfile.ZipFile(MOVIE).read("Input.txt").decode().splitlines()
    out = {}
    for f, line in enumerate(lines):
        pad = line.split("|")[2]
        pressed = {BUTTON_NAMES[b]: True for b, c in zip(BUTTONS, pad) if c != "."}
        if pressed:
            out[f] = pressed
    return out


def lua_table(inputs):
    rows = []
    for f, buttons in sorted(inputs.items()):
        rows.append(f"[{f}] = {{ " + ", ".join(f"{k} = true" for k in buttons) + " }")
    return "{ " + ", ".join(rows) + " }"


def mesen():
    path = os.environ.get("MESEN") or shutil.which("mesen")
    if not path:
        raise SystemExit("Mesen not found: set MESEN to Mesen.exe")
    return path


def capture(name, last, plan):
    inputs = movie_input()
    for a, b, buttons in plan:
        for f in range(a, b):
            inputs[f] = buttons
    log = CACHE / f"{name}.txt"
    script = CACHE / f"{name}.lua"
    script.write_text(f'OUT = [[{log.as_posix()}]]\nLAST = {last}\nINPUT = {lua_table(inputs)}\n'
                      + SCRIPT.read_text(encoding="utf-8"), encoding="utf-8")
    result = subprocess.run([mesen(), "--testrunner", str(ROM), str(script)], capture_output=True)
    if result.returncode != 0 or not log.exists():
        raise SystemExit(f"{name}: Mesen exited with {result.returncode}")
    return parse(log)


def parse(path):
    writes, samples = defaultdict(list), {}
    for line in path.read_text().splitlines():
        p = line.split()
        if p[0] == "D":
            samples[int(p[1], 16)] = bytes.fromhex(p[2])
        elif p[0] != "S":
            writes[int(p[0])].append((int(p[1], 16) - 0x4000, int(p[2], 16)))
    return writes, samples


def loop_start(writes):
    """First frame where the register state and the next SEAM_FRAMES frames of writes are the same
    one period later."""
    reg, state = [0] * 0x18, []
    for f in range(MUSIC_RUN):
        for r, v in writes[f]:
            reg[r] = v
        state.append(tuple(reg))
    for start in range(MUSIC_START + 1, MUSIC_RUN - LOOP_FRAMES - SEAM_FRAMES):
        if state[start - 1] == state[start - 1 + LOOP_FRAMES] and all(
                writes[start + k] == writes[start + LOOP_FRAMES + k] for k in range(SEAM_FRAMES)):
            return start
    raise SystemExit(f"no clean loop start for a period of {LOOP_FRAMES} frames")


def minus(a, b):
    """Writes in a that b lacks, in a's order (b's writes are taken out one for one)."""
    rest = list(b)
    out = []
    for w in a:
        if w in rest:
            rest.remove(w)
        else:
            out.append(w)
    return out


def effect(runs, run, base, first, last):
    w, b = runs[run][0], runs[base][0]
    chans = set()
    for f in range(first, last + 1):
        for c in CHANNELS:
            if [x for x in w[f] if channel(x[0]) == c] != [x for x in b[f] if channel(x[0]) == c]:
                chans.add(c)
    frames = []
    for f in range(first, last + 1):
        mine = [x for x in w[f] if channel(x[0]) in chans or x[0] == 0x15]
        frames.append(minus(mine, [x for x in b[f] if channel(x[0]) in chans or x[0] == 0x15]))
    while frames and not frames[0]:
        frames.pop(0)
    while frames and not frames[-1]:
        frames.pop()
    return sorted(chans), frames


def pack(frames):
    out = bytearray()
    for writes in frames:
        out.append(len(writes))
        for reg, value in writes:
            out += bytes((reg, value))
    return base64.b64encode(bytes(out)).decode()


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    music, samples = capture("music", MUSIC_RUN, [])
    start = loop_start(music)
    runs = {name: capture(name, last, plan) for name, (last, plan) in RUNS.items()}
    for _, s in runs.values():
        samples.update(s)

    intro = [music[f] for f in range(MUSIC_START, start)]
    loop = [music[f] for f in range(start, start + LOOP_FRAMES)]
    sfx = {}
    for name, spec in SFX.items():
        chans, frames = effect(runs, *spec)
        sfx[name] = (chans, frames)
        print(f"{name}: {len(frames)} frames on {', '.join(chans)}")

    lines = [
        "// Generated by tools/capture_audio.py from the original's sound chip writes; do not edit.",
        "// Frames: per frame a count, then (register - 0x4000, value) pairs; base64.",
        "export const SOUND_DATA = {",
        f"  intro: '{pack(intro)}',",
        f"  loop: '{pack(loop)}',",
        "  sfx: {",
    ]
    for name, (chans, frames) in sfx.items():
        lines.append(f"    {name}: {{ channels: {chans!r}, frames: '{pack(frames)}' }},".replace('"', "'"))
    lines.append("  },")
    lines.append("  // DPCM samples by CPU address.")
    lines.append("  samples: {")
    for addr, data in sorted(samples.items()):
        lines.append(f"    0x{addr:04X}: '{base64.b64encode(data).decode()}',")
    lines += ["  },", "};", ""]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"wrote {OUT}: intro {len(intro)} + loop {len(loop)} frames, {len(sfx)} effects, {len(samples)} samples")


if __name__ == "__main__":
    main()

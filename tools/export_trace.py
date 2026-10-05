"""Export the ball-practice recording as JSON for tools/check_replay.mjs.

Writes tools/.cache/trace.json (git-ignored): one record per logic tick (every 3rd frame, the
frames where the game's iteration counter $0300 advances) with player 1 input, player and ball
state, plus one record per frame with the displayed player pose.

  py tools/export_trace.py
"""
import argparse
import json
from pathlib import Path

from recording import BALL, DEFAULT_DUMP, HANG, ITERATION, PLAYER, ROOT, Recording

END_FRAME = 5530  # START was pressed after this; the screen changes


def inputs(p1):
    return {"left": bool(p1 & 0x40), "right": bool(p1 & 0x80), "a": bool(p1 & 0x01), "b": bool(p1 & 0x02)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dump", type=Path, default=DEFAULT_DUMP)
    ap.add_argument("--out", type=Path, default=ROOT / "tools" / ".cache" / "trace.json")
    args = ap.parse_args()

    rec = Recording(args.dump)
    d = rec.dump
    ticks = [{
        "f": f, **inputs(d.p1(f)), "it": d.ram(f, ITERATION),
        "px": rec.x(f, PLAYER), "pz": rec.z(f, PLAYER), "pvx": rec.vx(f, PLAYER), "pvz": rec.vz(f, PLAYER),
        "bx": rec.x(f, BALL), "bz": rec.z(f, BALL), "bvx": rec.vx(f, BALL), "bvz": rec.vz(f, BALL),
        "hang": d.ram(f, HANG + BALL),
    } for f in range(1, END_FRAME) if d.ram(f, ITERATION) != d.ram(f - 1, ITERATION)]
    frames = [{
        "f": f, **inputs(d.p1(f)), "x": rec.x(f, PLAYER),
        "pose": rec.timeline[f][0] if rec.timeline[f] else None,
        "facing": rec.timeline[f][1] if rec.timeline[f] else None,
    } for f in range(END_FRAME)]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"ticks": ticks, "frames": frames}), encoding="utf-8")
    print(f"wrote {args.out}: {len(ticks)} ticks, {len(frames)} frames")


if __name__ == "__main__":
    main()

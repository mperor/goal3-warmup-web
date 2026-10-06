"""Export the recordings in tools/data/ as JSON for tools/check_replay.mjs.

Writes tools/.cache/<recording>.json (git-ignored): one record per logic tick (every 3rd frame,
the frames where the game's iteration counter $0300 advances) with player 1 input, player and
ball state, plus one record per frame with the displayed player pose (ids shared across
recordings, see recording.share_pose_ids).

  py tools/export_trace.py
"""
import argparse
import json
from pathlib import Path

from recording import BALL, HANG, ITERATION, PLAYER, ROOT, recordings

# The reference recording: START was pressed after this frame and the screen changes.
END_FRAME = {"ball-practice": 5530}


def inputs(p1):
    return {"left": bool(p1 & 0x40), "right": bool(p1 & 0x80), "up": bool(p1 & 0x10), "down": bool(p1 & 0x20),
            "a": bool(p1 & 0x01), "b": bool(p1 & 0x02)}


def export(rec, out):
    d = rec.dump
    end = END_FRAME.get(rec.name, len(d))
    tick_frames = [f for f in range(1, end) if d.ram(f, ITERATION) != d.ram(f - 1, ITERATION)]
    # The pad is read every frame: a tap of A or B between two ticks still counts on the next one.
    held = {}
    for prev, f in zip([0] + tick_frames, tick_frames):
        held[f] = d.p1(f)
        for g in range(prev + 1, f):
            held[f] |= d.p1(g) & 0x03
    ticks = [{
        "f": f, **inputs(held[f]), "it": d.ram(f, ITERATION),
        "px": rec.x(f, PLAYER), "pz": rec.z(f, PLAYER), "pvx": rec.vx(f, PLAYER), "pvz": rec.vz(f, PLAYER),
        "bx": rec.x(f, BALL), "bz": rec.z(f, BALL), "bvx": rec.vx(f, BALL), "bvz": rec.vz(f, BALL),
        "hang": d.ram(f, HANG + BALL),
    } for f in tick_frames]
    frames = [{
        "f": f, **inputs(d.p1(f)), "x": rec.x(f, PLAYER),
        "pose": rec.timeline[f][0] if rec.timeline[f] else None,
        "facing": rec.timeline[f][1] if rec.timeline[f] else None,
    } for f in range(end)]

    out.write_text(json.dumps({"ticks": ticks, "frames": frames}), encoding="utf-8")
    print(f"wrote {out}: {len(ticks)} ticks, {len(frames)} frames")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out-dir", type=Path, default=ROOT / "tools" / ".cache")
    args = ap.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    for rec in recordings():
        export(rec, args.out_dir / f"{rec.name}.json")


if __name__ == "__main__":
    main()

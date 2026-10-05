"""Generate js/art/sprites.js: player poses, ball frames and shadow from the original game.

Inputs come from the sibling research repo ../goal3 (local files there, not in its git):
  - a frame dump of the ball-practice screen (tools/mesen/frame-dump.lua) for the poses,
    their offsets and the ball frames;
  - a PPU capture of the same screen (tools/mesen/export-screen.lua) for the CHR tiles and palettes.
It reuses goal3's readers (tools/analysis/fdump.py, ppu_export.py). Python 3.10+, stdlib only.

  py tools/gen_sprites.py --goal3 ../goal3 --dump traces/nsl-jp-20261005-205508.fdump
"""
import argparse
import sys
from collections import Counter
from pathlib import Path

PLAYER_PALETTE = 1
BALL_PALETTE = 0
SHADOW_TILE = 0xA1
SPRITE_LAG = 4  # sprites show the RAM state from 4 frames earlier on this screen
POSES = range(21)  # 21 and 22 only appear in the transition after START
# Object table (goal3 docs/research/ram-map.md): X/Z position, 8.8 fixed point; player = 0, ball = 12.
X_FRAC, X_PIX, X_HIGH = 0x0301, 0x0314, 0x0327
Z_FRAC, Z_PIX, Z_HIGH = 0x0373, 0x0386, 0x0399
PLAYER, BALL = 0, 12
# goal3's decoder uses a generic NTSC palette; map it to the colours of docs/reference/nsl-jp.gif.
GIF_COLOURS = {"#000000": "#000000", "#eceeec": "#fffeff", "#ec6a64": "#fe8170"}


def main():
    root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--goal3", type=Path, default=root.parent / "goal3")
    ap.add_argument("--dump", default="traces/nsl-jp-20261005-205508.fdump", help="relative to --goal3")
    ap.add_argument("--screen", default="assets/ripped/pregame-screen.g3px", help="relative to --goal3")
    ap.add_argument("--out", type=Path, default=root / "js" / "art" / "sprites.js")
    args = ap.parse_args()

    sys.path.insert(0, str(args.goal3 / "tools" / "analysis"))
    from fdump import Dump
    from ppu_export import Screen

    dump = Dump(str(args.goal3 / args.dump))
    screen = Screen((args.goal3 / args.screen).read_bytes())

    def pos(f, i, frac, pix, high):
        return dump.ram(f, pix + i) + dump.ram(f, frac + i) / 256 + (dump.ram(f, high + i) - (256 if dump.ram(f, high + i) & 0x80 else 0)) * 256

    def x(f, i):
        return pos(f, i, X_FRAC, X_PIX, X_HIGH)

    def z(f, i):
        return pos(f, i, Z_FRAC, Z_PIX, Z_HIGH)

    # --- poses: player sprites without the shadow, mirrored so both facings share one signature
    pose_ids, timeline = {}, []
    for f in range(len(dump)):
        parts = [(sx, sy, t, a) for sx, sy, t, a in dump.sprites(f) if a & 3 == PLAYER_PALETTE and t != SHADOW_TILE]
        if not parts:
            timeline.append(None)
            continue
        x0, y0 = min(p[0] for p in parts), min(p[1] for p in parts)
        w = max(p[0] for p in parts) + 8 - x0
        flipped = sum(1 for p in parts if p[3] & 0x40) * 2 > len(parts)
        sig = []
        for sx, sy, t, a in parts:
            dx, hf = sx - x0, bool(a & 0x40)
            if flipped:
                dx, hf = w - 8 - dx, not hf
            sig.append((dx, sy - y0, t, hf, bool(a & 0x80)))
        sig = tuple(sorted(sig))
        # flipped sprites face right on screen; the stored (unflipped) form faces left
        timeline.append((pose_ids.setdefault(sig, len(pose_ids)), "right" if flipped else "left", x0, y0))
    sig_by_id = {pid: sig for sig, pid in pose_ids.items()}

    offsets = {}
    for f in range(SPRITE_LAG, len(dump)):
        if timeline[f] and timeline[f][0] in POSES:
            pid, facing, sx, sy = timeline[f]
            offsets.setdefault((pid, facing), Counter())[(sx - int(x(f - SPRITE_LAG, PLAYER)), sy + int(z(f - SPRITE_LAG, PLAYER)))] += 1

    def width(pid):
        return max(p[0] for p in sig_by_id[pid]) + 8

    # Poses seen in both facings all satisfy dxLeft + dxRight + width = c; use it for the others.
    known = Counter()
    for pid in POSES:
        if (pid, "left") in offsets and (pid, "right") in offsets:
            known[offsets[(pid, "left")].most_common(1)[0][0][0] + offsets[(pid, "right")].most_common(1)[0][0][0] + width(pid)] += 1
    if len(known) != 1:
        raise SystemExit(f"mirror offsets are not consistent: {dict(known)}")
    c = next(iter(known))

    used_tiles = {SHADOW_TILE}
    pose_js = []
    for pid in POSES:
        sig = sig_by_id[pid]
        w, h = width(pid), max(p[1] for p in sig) + 8
        used_tiles.update(p[2] for p in sig)
        off = {f: list(offsets[(pid, f)].most_common(1)[0][0]) for f in ("left", "right") if (pid, f) in offsets}
        for facing, other in (("left", "right"), ("right", "left")):
            if facing not in off:
                off[facing] = [c - w - off[other][0], off[other][1]]
        parts = ", ".join(f"[{dx}, {dy}, 0x{t:02x}, {int(hf)}, {int(vf)}]" for dx, dy, t, hf, vf in sig)
        pose_js.append(f"  {{ width: {w}, height: {h}, left: [{off['left'][0]}, {off['left'][1]}], right: [{off['right'][0]}, {off['right'][1]}],\n    parts: [{parts}] }},")

    # --- ball rotation frames (4 sprites each), most common first
    ball_frames = Counter()
    for f in range(len(dump)):
        b = [(sx, sy, t, a) for sx, sy, t, a in dump.sprites(f) if a & 3 == BALL_PALETTE]
        if len(b) == 4:
            x0, y0 = min(p[0] for p in b), min(p[1] for p in b)
            ball_frames[tuple(sorted((sx - x0, sy - y0, t, bool(a & 0x40), bool(a & 0x80)) for sx, sy, t, a in b))] += 1
    ball_js = []
    for sig, n in ball_frames.most_common():
        used_tiles.update(p[2] for p in sig)
        ball_js.append("  [" + ", ".join(f"[{dx}, {dy}, 0x{t:02x}, {int(hf)}, {int(vf)}]" for dx, dy, t, hf, vf in sig) + f"],  // {n} frames")

    tile_js = []
    for t in sorted(used_tiles):
        rows = screen.tile_pixels(t, screen.sprite_pattern)
        tile_js.append(f"  0x{t:02x}: [" + ", ".join("'" + "".join(str(v) for v in row) + "'" for row in rows) + "],")

    def palette(p):
        return "[null, " + ", ".join(f"'{GIF_COLOURS['#%02x%02x%02x' % screen.sprite_color(p, i)]}'" for i in (1, 2, 3)) + "]"

    nl = "\n"
    js = f"""// Player, ball and shadow sprites from the original ROM (CHR + palettes captured in Mesen),
// with poses and offsets measured from a frame dump of the ball-practice screen.
// Generated by tools/gen_sprites.py; do not edit by hand.
// Coordinates are NES pixels. A part is [dx, dy, tile, flipH, flipV]; tiles are rows of 2-bit
// palette indices (0 = transparent). Poses are stored facing left; `left`/`right` give the
// sprite's top-left as [x offset from int(X), OAM y + int(Z)] for each facing.

export const PALETTES = {{
  player: {palette(PLAYER_PALETTE)},
  ball: {palette(BALL_PALETTE)},
}};

export const TILES = {{
{nl.join(tile_js)}
}};

export const PLAYER_POSES = [
{nl.join(pose_js)}
];

// Rotation frames, most common first; drawn at [int(X) - 8, 149 - int(Z)] (OAM y).
export const BALL_FRAMES = [
{nl.join(ball_js)}
];

// One tile under an airborne object at [int(X) - 4, OAM y]: 156 for the player, 157 for the ball.
export const SHADOW = {{ tile: 0x{SHADOW_TILE:02x}, playerY: 156, ballY: 157 }};

export const START = {{
  playerX: {x(0, PLAYER)},
  ballX: {x(0, BALL)},
}};
"""
    args.out.write_text(js, encoding="utf-8", newline="\n")
    print(f"wrote {args.out}: {len(used_tiles)} tiles, {len(pose_js)} poses, {len(ball_js)} ball frames")


if __name__ == "__main__":
    main()

"""Read a ball-practice frame dump from the sibling research repo ../goal3.

Wraps goal3's tools/analysis/fdump.py with what this project needs: player/ball state from
the object tables in RAM (goal3 docs/research/ram-map.md) and player poses from OAM.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_GOAL3 = ROOT.parent / "goal3"
DEFAULT_DUMP = "traces/nsl-jp-20261005-205508.fdump"

PLAYER, BALL = 0, 12
PLAYER_PALETTE = 1
BALL_PALETTE = 0
SHADOW_TILE = 0xA1
SPRITE_LAG = 4  # sprites show the RAM state from 4 frames earlier on this screen

# Object tables: parallel arrays indexed by object, 8.8 fixed point.
X_FRAC, X_PIX, X_HIGH = 0x0301, 0x0314, 0x0327
Z_FRAC, Z_PIX, Z_HIGH = 0x0373, 0x0386, 0x0399
VX_FRAC, VX_PIX = 0x03E8, 0x03F6
VZ_FRAC, VZ_PIX = 0x0420, 0x042E
HANG = 0x04BD
ITERATION = 0x0300


def use_goal3_tools(goal3):
    path = str(Path(goal3) / "tools" / "analysis")
    if path not in sys.path:
        sys.path.insert(0, path)


class Recording:
    def __init__(self, goal3=DEFAULT_GOAL3, dump=DEFAULT_DUMP):
        use_goal3_tools(goal3)
        from fdump import Dump

        self.dump = Dump(str(Path(goal3) / dump))
        self.timeline, self.pose_ids = self._poses()

    def __len__(self):
        return len(self.dump)

    def _pos(self, f, i, frac, pix, high):
        d = self.dump
        hi = d.ram(f, high + i)
        return d.ram(f, pix + i) + d.ram(f, frac + i) / 256 + (hi - 256 if hi & 0x80 else hi) * 256

    def _vel(self, f, i, frac, pix):
        raw = self.dump.ram(f, pix + i) * 256 + self.dump.ram(f, frac + i)
        return (raw - 65536 if raw & 0x8000 else raw) / 256

    def x(self, f, i):
        return self._pos(f, i, X_FRAC, X_PIX, X_HIGH)

    def z(self, f, i):
        return self._pos(f, i, Z_FRAC, Z_PIX, Z_HIGH)

    def vx(self, f, i):
        return self._vel(f, i, VX_FRAC, VX_PIX)

    def vz(self, f, i):
        return self._vel(f, i, VZ_FRAC, VZ_PIX)

    def _poses(self):
        """Per frame: (pose id, facing, sprite x, sprite y) or None. Ids follow first appearance."""
        ids, timeline = {}, []
        for f in range(len(self.dump)):
            parts = [(sx, sy, t, a) for sx, sy, t, a in self.dump.sprites(f)
                     if a & 3 == PLAYER_PALETTE and t != SHADOW_TILE]
            if not parts:
                timeline.append(None)
                continue
            x0, y0 = min(p[0] for p in parts), min(p[1] for p in parts)
            w = max(p[0] for p in parts) + 8 - x0
            flipped = sum(1 for p in parts if p[3] & 0x40) * 2 > len(parts)
            sig = []
            for sx, sy, t, a in parts:
                dx, hf = sx - x0, bool(a & 0x40)
                if flipped:  # mirror so both facings share one signature
                    dx, hf = w - 8 - dx, not hf
                sig.append((dx, sy - y0, t, hf, bool(a & 0x80)))
            sig = tuple(sorted(sig))
            # flipped sprites face right on screen; the stored (unflipped) form faces left
            timeline.append((ids.setdefault(sig, len(ids)), "right" if flipped else "left", x0, y0))
        return timeline, ids

"""Readers for the ball-practice recordings in tools/data/ (Python 3.10+, stdlib only).

The recordings are local working files and are not committed (tools/data/ is git-ignored).

  ball-practice.fdump.gz  every frame of a play session: input, internal RAM, OAM
                          (written by tools/mesen/frame-dump.lua, then gzipped); the reference
                          recording that pose ids and the sprite offsets come from
  shots-passes.fdump.gz   another session: passes, shots and volleys from the ground
  shot-close.fdump.gz     shots with the ball close by
  run-shot.fdump.gz       shots on the run
  on-ball.fdump.gz        moving with the ball
  no-ball.fdump.gz        another session without touching the ball: Up/Down, kicks in the
                          air and on the ground, dives
  jump-ball.fdump.gz      jumps with the ball, then B in the air: alone, forward and back
  specials.fdump.gz       dives at the ball, pushing off on the ground after a dive, the ball
                          met in the air after the wall, jumping onto a rolling ball
  ball-practice.g3px      one PPU snapshot of the screen: CHR tiles, palettes, OAM
                          (written by tools/mesen/export-screen.lua)

To re-record: put your own ROM dump in rom/ (git-ignored), open it in Mesen 2, go to the
ball-practice screen and run the Lua scripts from the Script Window; they write to tools/.cache/.
Gzip the .fdump and move both files into tools/data/.

Player/ball state is read from the game's object tables in RAM: parallel arrays indexed by
object (player 0, ball 12), positions and velocities in 8.8 fixed point.
"""
import gzip
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "tools" / "data"
DEFAULT_DUMP = DATA / "ball-practice.fdump.gz"
DEFAULT_SCREEN = DATA / "ball-practice.g3px"

PLAYER, BALL = 0, 12
PLAYER_PALETTE = 1
BALL_PALETTE = 0
SHADOW_TILE = 0xA1
SPRITE_LAG = 4  # sprites show the RAM state from 4 frames earlier on this screen

X_FRAC, X_PIX, X_HIGH = 0x0301, 0x0314, 0x0327
Z_FRAC, Z_PIX, Z_HIGH = 0x0373, 0x0386, 0x0399
VX_FRAC, VX_PIX = 0x03E8, 0x03F6
VZ_FRAC, VZ_PIX = 0x0420, 0x042E
HANG = 0x04BD
ITERATION = 0x0300  # incremented once per main-loop iteration (logic tick)
# Player 1's pad as the game logic sees it, refreshed on tick frames only, bits in the order the
# pad is read (bit 7 A ... bit 0 Right). A press between two ticks never gets here.
PAD = 0x0004

RAM_SIZE = 0x800
OAM_SIZE = 0x100


def read_bytes(path):
    path = Path(path)
    data = path.read_bytes()
    return gzip.decompress(data) if path.suffix == ".gz" else data


class FrameDump:
    """A .fdump file: header "G3FD", version 1, record size u16; then one record per frame:
    u32 frame, u8 player 1 buttons (A, B, Select, Start, Up, Down, Left, Right = bits 0-7),
    u8 player 2 buttons, u8 input polls, 2 KB RAM, 256 B OAM."""

    def __init__(self, path):
        data = read_bytes(path)
        if data[:4] != b"G3FD" or data[4] != 1:
            raise SystemExit(f"{path}: not a version 1 frame dump")
        size = struct.unpack_from("<H", data, 5)[0]
        self.records = [data[i:i + size] for i in range(7, len(data) - size + 1, size)]

    def __len__(self):
        return len(self.records)

    def pad(self, f):
        """Player 1's pad as the game logic sees it ($0004), in the bit layout of p1()."""
        return int(f"{self.ram(f, PAD):08b}"[::-1], 2)

    def p1(self, f):
        return self.records[f][4]

    def ram(self, f, addr):
        return self.records[f][7 + addr]

    def sprites(self, f):
        """Visible sprites as (x, y, tile, attributes)."""
        o = self.records[f][7 + RAM_SIZE:7 + RAM_SIZE + OAM_SIZE]
        return [(o[i + 3], o[i], o[i + 1], o[i + 2]) for i in range(0, OAM_SIZE, 4) if o[i] < 0xEF]


class Screen:
    """A .g3px file: header "G3PX", version 1, u32 frame, u16 background and sprite pattern
    table bases, u8 8x16-sprites flag, u16 nametable base; then 32 B palette RAM, 8 KB pattern
    tables, 1 KB nametable, 256 B OAM."""

    HEADER = "<4sBIHHBH"

    def __init__(self, path):
        data = read_bytes(path)
        magic, version, _, _, self.sprite_pattern, _, _ = struct.unpack_from(self.HEADER, data, 0)
        if magic != b"G3PX" or version != 1:
            raise SystemExit(f"{path}: not a version 1 screen capture")
        off = struct.calcsize(self.HEADER)
        self.palette = data[off:off + 32]
        self.chr = data[off + 32:off + 32 + 0x2000]

    def sprite_tile(self, tile):
        """8x8 rows of 2-bit colour indices (0 = transparent)."""
        base = self.sprite_pattern + tile * 16
        lo, hi = self.chr[base:base + 8], self.chr[base + 8:base + 16]
        return [[(lo[y] >> (7 - x) & 1) | (hi[y] >> (7 - x) & 1) << 1 for x in range(8)] for y in range(8)]

    def sprite_colour_index(self, palette, colour):
        """NES palette entry (0x00-0x3F) of a sprite palette colour."""
        return self.palette[16 + palette * 4 + colour] & 0x3F


class Recording:
    def __init__(self, dump=DEFAULT_DUMP):
        self.name = Path(dump).name.split(".")[0]
        self.dump = FrameDump(dump)
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


GAMEPLAY_POSES = 21  # the reference recording's later poses only appear in the transition after START


# Recordings in the order they were made: poses first seen in a later one get later ids, so
# adding a recording never renumbers the poses in js/art/sprites.js. Unlisted dumps go last.
RECORDING_ORDER = ["ball-practice", "shots-passes", "no-ball", "shot-close", "run-shot", "on-ball", "jump-ball", "specials", "feint", "juggle"]


def recordings():
    """Every frame dump in tools/data/, in RECORDING_ORDER, with shared pose ids."""
    def order(path):
        name = path.name.split(".")[0]
        return (RECORDING_ORDER.index(name) if name in RECORDING_ORDER else len(RECORDING_ORDER), name)
    recs = [Recording(p) for p in sorted(DATA.glob("*.fdump.gz"), key=order)]
    share_pose_ids(recs)
    return recs


def share_pose_ids(recs):
    """Renumber poses so an id means the same pose in every recording: the reference
    recording's gameplay poses keep their ids, poses first seen in the other recordings follow
    (in recording order), the START transition poses come last."""
    ids = {sig: pid for sig, pid in recs[0].pose_ids.items() if pid < GAMEPLAY_POSES}
    for rec in recs[1:] + recs[:1]:
        for sig in sorted(rec.pose_ids, key=rec.pose_ids.get):
            ids.setdefault(sig, len(ids))
    for rec in recs:
        new_id = {pid: ids[sig] for sig, pid in rec.pose_ids.items()}
        rec.timeline = [(new_id[e[0]], *e[1:]) if e else None for e in rec.timeline]
        rec.pose_ids = {sig: ids[sig] for sig in rec.pose_ids}
    return ids

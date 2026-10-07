"""Play input plans on the original in Mesen 2 (headless) and export them for tools/compare_sim.mjs.

Each plan starts from power-on with the input of the movie in docs/reference/movies/nsl-jp.mmo
(START: the ball-practice screen), then presses the plan's buttons, in frames counted from the
first frame of that screen. tools/mesen/sim-dump.lua records every frame from there in the
frame-dump format (tools/recording.py); the dump is exported like tools/export_trace.py does, as
tools/.cache/sim/<plan>.json (git-ignored).

Plans are written by hand (one situation each) or random: a seeded mix of walking, runs, taps of
A and B and Up/Down, to find what nobody thought of trying.

Needs your own ROM dump at rom/nsl-jp.nes and Mesen 2.2.1 (set MESEN or have `mesen` on PATH).
Python 3.10+, stdlib only.

  py tools/simulate.py                 every plan
  py tools/simulate.py up-down-ball    only these
  py tools/simulate.py --random 20     plus 20 random plans (random-0 ... random-19)
"""
import argparse
import random
import subprocess
from concurrent.futures import ThreadPoolExecutor

from capture_audio import ROM, lua_table, mesen, movie_input
from export_trace import export
from recording import ROOT, Recording, recordings, share_pose_ids

SCRIPT = ROOT / "tools" / "mesen" / "sim-dump.lua"
CACHE = ROOT / "tools" / ".cache" / "sim"
SCREEN = 849  # the first frame of the ball-practice screen (input is taken from here on)
BUTTONS = {"L": "left", "R": "right", "U": "up", "D": "down", "A": "a", "B": "b"}


def tap(at, buttons, frames=4):
    return [(at, at + frames, buttons)]


def double_tap(at, buttons, gap=4):
    return tap(at, buttons) + tap(at + 4 + gap, buttons)


# name: (frames to record from SCREEN, plan of (from, to, buttons) in frames from SCREEN)
# The player starts at x 120 facing right, the ball lies at x 140: walking right takes it.
TAKE_BALL = [(30, 60, "R")]
PLANS = {
    "idle": (300, []),
    # With the ball: Up and Down held, tapped and double-tapped, alone and with a direction.
    "up-down-ball": (900, TAKE_BALL + [
        (120, 240, "U"), (300, 420, "D"),
        *double_tap(480, "U"), (500, 600, "U"),
        *double_tap(660, "D"), (680, 780, "D"),
    ]),
    "up-down-ball-run": (900, TAKE_BALL + [
        *double_tap(120, "R"), (130, 200, "R"), (160, 220, "RU"),
        *double_tap(300, "L"), (310, 420, "L"), (340, 400, "LD"),
        *double_tap(500, "U"), (520, 560, "U"), *tap(600, "U"), *tap(612, "U"),
    ]),
    "up-down-ball-kick": (900, TAKE_BALL + [
        (120, 200, "U"), *tap(150, "A", 2),
        (400, 480, "D"), *tap(430, "B", 2),
        (650, 700, "U"), *tap(660, "AB", 2),
    ]),
    # With the ball, Up or Down held and A, B or A+B: standing, and walking (with Right held too).
    **{f"ball-{v.lower()}-{k.lower()}": (240, [(20, 200, v), *tap(60, k, 2)])
       for v in ("U", "D") for k in ("A", "B", "AB")},
    **{f"ball-walk-{v.lower()}-{k.lower()}": (240, [(20, 200, "R" + v), *tap(60, k, 2)])
       for v in ("U", "D") for k in ("A", "B", "AB")},
    # The same facing left (turned round with the ball first) and walking left.
    **{f"ball-left-{v.lower()}-{k.lower()}": (240, [(5, 8, "L"), (20, 200, v), *tap(60, k, 2)])
       for v in ("U", "D", "") for k in ("A", "B", "AB")},
    **{f"ball-walk-left-{v.lower()}-{k.lower()}": (240, [(20, 200, "L" + v), *tap(60, k, 2)])
       for v in ("U", "D") for k in ("A", "B", "AB")},
    # Up + A from different places (walked to with the ball first): the pass is aimed at a point.
    **{f"lob-{d.lower()}{n}": (300, [(10, 10 + n, d), (100, 280, "U"), *tap(130, "A", 2)])
       for d, ns in (("R", (6, 20, 40, 60, 75)), ("L", (6, 20, 40, 60, 80))) for n in ns},
    # A boost with Up or Down held, with the ball (a feint: into the depth and back out with a dash)
    # and without: started by double taps of Up/Down, or of the direction while Up/Down is held.
    "feint-u": (300, [*double_tap(30, "U"), (40, 60, "U"), *tap(64, "U"), (64, 200, "U")]),
    "feint-d": (300, [*double_tap(30, "D"), (40, 60, "D"), *tap(64, "D"), (64, 200, "D")]),
    "feint-u-left": (300, [(5, 8, "L"), *double_tap(30, "U"), (40, 60, "U"), *tap(64, "U"), (64, 200, "U")]),
    "feint-u-tap": (300, [*double_tap(30, "U"), *tap(48, "U")]),
    "feint-r-u": (300, [*double_tap(30, "R"), (40, 60, "R"), (60, 200, "U"), *tap(64, "R"), *tap(72, "R")]),
    "feint-long": (420, [(5, 80, "L"), (90, 93, "R"), *double_tap(110, "U"), *tap(128, "U")]),
    "run-long": (420, [(5, 80, "L"), (90, 93, "R"), *double_tap(110, "R")]),
    "feint-u-noball": (300, [*tap(10, "A", 2), (60, 70, "L"), *double_tap(100, "U"), (110, 130, "U"),
                             *tap(134, "U"), (134, 250, "U")]),
    # A run with the ball, then Up or Down: pressed and held, tapped, with the run's direction too.
    "ball-run-up-held": (400, [*double_tap(30, "R"), (40, 100, "R"), (100, 300, "U")]),
    "ball-run-up-tap": (400, [*double_tap(30, "R"), (40, 100, "R"), *tap(100, "U")]),
    "ball-run-down-held": (400, [*double_tap(30, "R"), (40, 100, "R"), (100, 300, "D")]),
    "ball-run-forward-up": (400, [*double_tap(30, "R"), (40, 100, "R"), (100, 300, "RU")]),
    "ball-run-left-up-held": (400, [*double_tap(30, "L"), (40, 100, "L"), (100, 300, "U")]),
    "ball-run-boost-up": (400, [*double_tap(30, "R"), (40, 80, "R"), *tap(90, "R"), (100, 300, "U")]),
    # Walking, then Up or Down instead of the direction: how the walk stops.
    "walk-then-up": (300, [(30, 60, "R"), (60, 120, "U"), (150, 180, "L"), (180, 240, "LD"), (240, 280, "D")]),
    "run-then-up": (300, [*double_tap(30, "R"), (40, 70, "R"), (70, 150, "U"), (150, 160, "")]),
    # A pass (the ball flies off), a jump (A+B), then B or A a few frames later: how soon an
    # action in the air may start.
    **{f"jump-{b.lower()}-{n}": (180, [*tap(10, "A", 2), *tap(90, "AB", 2), *tap(90 + n, b, 2)])
       for b in ("B", "A", "AB") for n in (3, 4, 5, 6, 7, 8, 9, 10, 12, 15)},
    # On the ground, a press of A or B that starts and ends between two ticks (ticks fall on frames
    # 1, 4, 7, ...): is it seen? With the ball (pass, shot) and without (kicks at the air).
    "between-a-ball": (120, [*tap(11, "A", 2)]),
    "between-b-ball": (120, [*tap(11, "B", 2)]),
    "between-a": (240, [*tap(10, "A", 2), *tap(101, "A", 2)]),
    "between-b": (240, [*tap(10, "A", 2), *tap(101, "B", 2)]),
    "between-a-1": (240, [*tap(10, "A", 2), *tap(102, "A", 1)]),
    # The same without the ball: a pass first (the ball flies off to the right wall).
    "run-up-held": (500, [*tap(10, "A", 2), (60, 70, "L"), *double_tap(130, "L"), (140, 200, "L"),
                          (200, 400, "U")]),
}


def random_plan(seed, frames=1800):
    """Segments of held directions with taps of the buttons in between, as a player might."""
    rng = random.Random(seed)
    plan, f = [], 20
    while f < frames - 60:
        kind = rng.choices(["walk", "run", "vertical", "tap", "jump", "idle"], [4, 2, 2, 4, 2, 2])[0]
        d = rng.choice("LR")
        if kind == "walk":
            n = rng.randint(4, 60)
            plan.append((f, f + n, d + rng.choice(["", "", "U", "D"])))
        elif kind == "run":
            n = rng.randint(10, 90)
            plan += double_tap(f, d, rng.randint(1, 6))
            plan.append((f + 12, f + 12 + n, d))
            n += 12
        elif kind == "vertical":
            n = rng.randint(4, 60)
            plan.append((f, f + n, rng.choice("UD")))
        elif kind == "tap":
            n = rng.randint(2, 8)
            plan.append((f, f + n, rng.choice(["A", "B", "A", "B", "AB"]) + rng.choice(["", "", d])))
        elif kind == "jump":
            n = rng.randint(30, 50)
            plan += tap(f, "AB", 3)
            later = rng.randint(4, 30)
            plan += tap(f + later, rng.choice(["A", "B", "B", "B" + d]), 3)
        else:
            n = rng.randint(5, 60)
        f += n + rng.randint(0, 10)
    return frames, plan


def run(name, frames, plan):
    inputs = movie_input()
    for a, b, buttons in plan:
        for f in range(a, b):
            held = inputs.setdefault(SCREEN + f, {})
            held.update({BUTTONS[c]: True for c in buttons})
    out = CACHE / f"{name}.fdump"
    script = CACHE / f"{name}.lua"
    script.write_text(f"OUT = [[{out.as_posix()}]]\nFIRST = {SCREEN}\nLAST = {SCREEN + frames}\n"
                      f"INPUT = {lua_table(inputs)}\n" + SCRIPT.read_text(encoding="utf-8"), encoding="utf-8")
    result = subprocess.run([mesen(), "--testrunner", str(ROM), str(script)], capture_output=True)
    if result.returncode != 0 or not out.exists():
        raise SystemExit(f"{name}: Mesen exited with {result.returncode}")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("plans", nargs="*", help="plan names (default: all)")
    ap.add_argument("--random", type=int, default=0, help="add this many random plans")
    args = ap.parse_args()

    plans = {n: p for n, p in PLANS.items() if not args.plans or n in args.plans}
    plans.update({f"random-{i}": random_plan(i) for i in range(args.random)})
    CACHE.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(4) as pool:
        dumps = dict(zip(plans, pool.map(lambda kv: run(kv[0], *kv[1]), plans.items())))

    # Pose ids shared with the recordings, so they mean the same as in js/art/sprites.js.
    sims = [Recording(path) for path in dumps.values()]
    share_pose_ids(recordings() + sims)
    for rec in sims:
        export(rec, CACHE / f"{rec.name}.json")


if __name__ == "__main__":
    main()

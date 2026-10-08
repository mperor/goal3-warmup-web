// Input plans for the golden traces (tests/golden.test.mjs): one situation each, after the plans
// of tools/simulate.py. Frames from the first frame of the screen; the player starts at x 121
// facing right with the ball at his feet. Together they go through every mode and sound and every
// action but the ground volley (a high ball coming in from the side, which check_replay covers).
import { doubleTap, tap } from './harness.mjs';

export const PLANS = {
  idle: [300, []],
  'walk-both-ways': [400, [[20, 80, 'R'], [120, 200, 'L'], [240, 260, 'R']]],
  'run-skid-turn': [400, [[10, 20, 'L'], ...doubleTap(60, 'L'), [72, 95, 'L'], [95, 125, 'R'], ...doubleTap(200, 'R'), [212, 260, 'R']]],
  'run-boost-wall': [420, [...doubleTap(20, 'R'), [32, 76, 'R'], ...doubleTap(80, 'R'), [92, 200, 'R']]],
  'up-down-ball': [700, [[120, 240, 'U'], [300, 420, 'D'], ...doubleTap(480, 'U'), [500, 600, 'U']]],
  feint: [300, [...doubleTap(30, 'U'), [40, 60, 'U'], ...tap(64, 'U', 4), [64, 200, 'U']]],
  'pass-and-take': [500, [...tap(30, 'A'), [200, 330, 'R']]],
  'shot-up-and-down': [600, [[20, 200, 'U'], ...tap(60, 'B'), [260, 400, 'L'], [300, 500, 'D'], ...tap(420, 'B')]],
  'lob-up': [300, [[10, 30, 'L'], [100, 280, 'U'], ...tap(130, 'A')]],
  // The README GIF's moves: lift, keep it up twice, an overhead kick off the wall, a run and a volley.
  juggle: [800, [
    [40, 70, 'R'], ...tap(120, 'AB'), ...tap(208, 'A'), ...tap(327, 'A'), ...tap(389, 'AB'), ...tap(398, 'B'),
    [490, 530, 'R'], ...doubleTap(600, 'L'), [608, 660, 'L'], ...tap(660, 'AB'), ...tap(672, 'RB'),
  ]],
  'jump-with-ball-a': [300, [[20, 60, 'U'], ...tap(30, 'AB'), ...tap(42, 'A')]],
  'jump-with-ball-b': [300, [[20, 60, 'U'], ...tap(30, 'AB'), ...tap(42, 'B')]],
  'run-left-bicycle': [320, [[5, 45, 'R'], ...doubleTap(80, 'L'), [90, 150, 'L'], ...tap(150, 'AB'), ...tap(162, 'LB')]],
  'air-kicks-without-ball': [700, [...tap(10, 'A'), ...tap(90, 'AB'), ...tap(102, 'A'), ...tap(240, 'AB'), ...tap(252, 'LB'), ...tap(390, 'AB'), ...tap(402, 'RB'), ...tap(540, 'AB'), ...tap(552, 'B')]],
  'head-ride': [260, [...tap(31, 'AB'), ...tap(96, 'AB')]],
  'dive-crawl-dive': [500, [...tap(10, 'A'), [60, 70, 'L'], [100, 102, 'L'], ...tap(100, 'B'), [180, 220, 'R'], ...tap(260, 'RB')]],
  'mount-ride-flick': [700, [...tap(10, 'A'), [300, 390, 'R'], ...tap(330, 'AB'), ...doubleTap(420, 'R'), [432, 500, 'R'], ...tap(519, 'RAB', 6)]],
  'keep-up-behind': [260, [...tap(31, 'AB'), [45, 63, 'R'], ...tap(142, 'A')]],
  'flick': [200, [[20, 60, 'R'], ...tap(40, 'RAB')]],
  'run-juggle': [300, [...tap(31, 'AB'), [40, 50, 'L'], ...doubleTap(100, 'R'), [112, 180, 'R']]],
};

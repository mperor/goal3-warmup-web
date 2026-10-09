# Differences from the original

Where the game is known to do something the original does not, how it was found and how to see
it again. Each has a plan in `tools/simulate.py`: `py tools/simulate.py <plan>` plays it on the
original (Mesen and a ROM dump needed, see the README), `node tools/compare_sim.mjs <plan>` shows
where the game first goes its own way.

A plan's frames count from the first frame of the ball-practice screen. The original reads the
pad on frames 1, 4, 7, ... of it, the tests (`tests/harness.mjs`) on frames 0, 3, 6, ..., so the
same plan meets the ticks a frame apart; `compare_sim` feeds the game the original's ticks, so
what it reports is a real difference.

## Open

| Plan | What happens | The original | The game |
|------|--------------|--------------|----------|
| `dive-high-ball-far` (frame 103) | B with the way he faces, no ball; the ball high (60 px) but 45 px off | dives | stays to volley, since any ball high enough to volley stops a dive (`p.ballHigh` in `startKick`, player.js): the original must also go by how far off it is |
| `pass-up-let-go` (frame 109) | A with the ball, Up let go a few frames before the kick leaves the foot | a plain pass forwards | a lob into the depth: the game keeps Up as it was when A was pressed (`press.vertical`), the original seems to read it when the kick goes |
| `trap-ab` (frame 163) | A ball coming down off the wall trapped at the thigh, standing | carries it 0.5 px/tick away from him for two ticks | 0.5 px/tick towards him (`trapCarry`, practice.js) |
| `random-6` (frame 130), `random-11` (frame 469) | Lifting the ball out of a trap, and after | turns back the other way during the lift | keeps facing the ball |
| `trap-ab` (frame 136) | Turning round at the left wall at the end of a run | the running pose one frame longer | standing |
| — | Left and right held together (a keyboard can, a pad cannot) | slows down (−2.48 px/tick from −3.5) | no direction: runs on |
| — | The overhead kick's reach: a hit recorded 12.3 px ahead and 11.2 px up | (a hit, as recorded) | outside the narrower reach found later with the airhit-* plans (`OVERHEAD_FAR_DZ_MAX` in reach.js); a todo test in `tests/reach.test.mjs` |

## Settled

| Plan | What happens | Now as the original |
|------|--------------|---------------------|
| `trap-ab` (frame 165) | A+B with the way he faces while trapping a ball at the thigh | the trap ends with the ball at his feet and he flicks it, staying down (the game used to jump, leaving the trap flag set in the air with the ball on his head) |
| `random-6` (frame 124), `random-11` (frame 178) | A+B with no direction while trapping, at the thigh or the foot | he lifts it from where it is: it goes on by itself a tick, then up (the game used to jump) |

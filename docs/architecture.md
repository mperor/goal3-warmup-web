# Architecture

How the game logic is built, how it is meant to be built, and the steps between. The aim is that,
when something on the screen looks wrong, it is plain where to look: what the player meant, how
he moved, what touched what, what that set off, and only then what is drawn and heard.

The original game is the specification. Whatever the structure, a tick must do what the original's
does, in the same order: the golden traces (`tests/golden/`), `tools/check_replay.mjs` and
`tools/compare_sim.mjs` judge every step below, and a step that is a refactoring changes none of
their output.

## Now

One logic tick (every 3rd frame, as in the original) is `tickPractice` in `js/game/practice.js`:

```
tickPractice(s, input)
└─ step(s, input)
   ├─ note what the reach checks need from before anyone moves (ballX, playerX, ...)
   ├─ tickPlayer(player, input)        js/game/player.js
   │  ├─ buttons: edges, the A+B window, double taps
   │  ├─ by mode (walk, run, skid, air, land, dive): moves, actions (ACTIONS), jumps
   │  └─ returns events for the ball as strings ('lift', 'strike:volley:5', 'kickA', ...)
   ├─ chooseKick / applyEvent          kicks: reach checks (inReach, inKickReach, ...), the ball's new speed
   ├─ the ball by who has it           at the feet, ridden, on the head (headBall), juggled (juggle),
   │                                   in flight (tickBall), trapped, caught, taken up
   └─ sounds pushed where things happen ('kick', 'shot', 'bounce')
└─ sounds from comparing before and after ('jump', 'land', 'pickup')

framePlayer(player)                    every frame: the pose, from a dozen flags (currentAnimation)
```

What makes it hard to follow:

- **Four kinds of work in one pass.** What the player means, how things move, what reaches what,
  and what is shown and heard are mixed in `tickPlayer` and `step`. A wrong pose may come from a
  flag set by a reach check; a missing sound from the order of two `if`s.
- **No owner for the ball's relation to the player.** Whether he has it, rides it, traps it, has it
  on his head or juggles it is spread over nine fields of both objects (`hasBall`, `onBall`,
  `trapping`, `juggleTicks`, `carried`, `headRide`, `lifted`, `flickFromRide`, `noCapture`). Nothing
  keeps them from contradicting each other (one known case: `tests/invariants.test.mjs`, a trap
  carried into a jump).
- **The practice writes inside the player** (speed, facing, boost, taps) to carry out what the ball
  did, so the player's state is not only the player's doing.
- **Reach is code, not data.** The distances are measured and commented, but they live in a chain
  of conditions whose order decides who wins; they cannot be listed, drawn or tested one by one.
- **Events are strings, sounds have two sources**, so a tick has no single record of what happened.

## The aim

The original keeps its objects in tables in RAM (player 0, ball 12, see `tools/recording.py`) and
goes through them in a fixed order every tick. The structure follows that:

```
                 ┌──────────────────────────── World ────────────────────────────┐
input / plan ──► │ 1 intent    each object with a controller: what it means to do │
                 │ 2 state     each object's state machine: transition, then move │
                 │ 3 contacts  the world: who reaches what (shapes from data),    │
                 │             which contact wins, the ball's relation changes    │
                 │ 4 events    the record of the tick, each with its reason       │
                 └────────────────────────────────────────────────────────────────┘
                              │ state + events (read only)
                              ▼
                 5 presentation: pose = f(state), sound = f(events), drawing
```

The rules it keeps:

1. **Objects in a fixed order, as in the original.** A `World` holds them (for now the player and
   the ball) and runs the phases on all of them in turn. The order of the phases is the order the
   original works in; where it judges something before anyone moves, the world keeps that snapshot
   for the contact phase instead of each function noting its own.
2. **Each object has a state machine with named states.** The player's modes and actions already
   are one in all but name; the ball gets one too (rolling, flying, lying). A transition is made in
   one place and says why.
3. **The world owns the relations between objects.** Who has the ball and how (free, at the feet,
   trapped, on the head, juggled, ridden), and since when, is one value the contact phase changes.
   Neither object writes it, nor the other object's state.
4. **Reach is data.** An action states on which ticks and with what shape it can meet the ball
   (`overhead`: ticks 3 to 12 but 5, up to 13 px ahead, up to 11.25 px higher, ...). The contact
   phase tries the rules in their order of priority; the inspector draws the shapes and can show
   why a contact did not happen.
5. **Events are typed and carry their reason**: `{ type: 'kick', by: 'player', reach: 'overhead',
   t: 7, dx: 10.9, dz: 9.1 }`. The tick returns them; tests check them; the inspector shows the
   chain from a press to a sound.
6. **Presentation only reads.** The pose comes from the state, the sounds from the events, through
   tables. Nothing drawn or heard changes the game, so a wrong pose or sound is never a mechanics
   bug, and the other way round.
7. **Controllers are interchangeable.** The keyboard, a plan, a recording (and one day the computer
   playing another player) give an object the same kind of intent.

Kept as it is: fixed-point quirks copied from the original (`js/game/ball.js`), the measured
constants and their comments, `ACTIONS` as data, and determinism (the same input, the same game).

## The steps

Each step is a branch and a pull request of its own. Steps 2 to 5 are refactorings: the golden
traces, `check_replay` and `compare_sim` give the same output before and after.

| Step | What | Done when |
|------|------|-----------|
| 1 | This document | merged |
| 2 | Typed events with their reason; sounds from the events through a table; the pose from the state alone | the player's requests to the ball are objects; each tick keeps a record (`s.events`: what happened, what did it, where the ball was) and the sounds come from it; the pose is worked out in `js/game/animation.js`, and what only the pose needs is one group (`p.look`) nothing else reads; the inspector shows the record |
| 3 | The world's phases over the player and the ball, in today's order (`practice.js` is the world of this screen) | `step` reads as its phases: look, the player, off the ride, kicks, with the player, by itself, take or trap; `practice.js` writes nothing inside the player, it calls what `player.js` offers for it (`seeBall`, `takeBall`, `juggled`, `startTrap`, ...) |
| 4 | Contacts as data: kicks, traps, the head, catching, taking up, mounting as rules with shapes and a priority | every reach check is a rule in `js/game/reach.js` (`fits` decides, `shapes` gives the same as boxes, a test checks they agree); the measured hits and misses from the comments are unit tests (one disagrees: a todo for the original to settle); the order the rules are tried in is still that of `practice.js` |
| 5 | The ball's relation as one state in the world | the nine fields are gone; the trap-into-a-jump case is settled after checking the original (`tools/simulate.py`) |
| 6 | Only if the project grows to more players: controllers for each, the world deciding which player reaches the ball first | — |

## For the inspector

The inspector (`tools/inspector/`, kept on its own branch, `feature/inspector`) reads the state and
plays plans through `tests/harness.mjs`. Each step adds what it can show: the events and their
reasons (2), the phases of a tick (3), the reach shapes on the scene (4), the ball's relation as
one row on the timeline (5).

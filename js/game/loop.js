const FRAME_MS = 1000 / 60;
const MAX_CATCH_UP_FRAMES = 6;

// Calls onFrame at a fixed 60 Hz, like the NES, independent of the display refresh rate.
export function startLoop(onFrame) {
  let last = performance.now();
  let pending = 0;

  function step(now) {
    pending = Math.min(pending + (now - last) / FRAME_MS, MAX_CATCH_UP_FRAMES);
    last = now;
    while (pending >= 1) {
      onFrame();
      pending -= 1;
    }
    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

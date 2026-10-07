// The NES sound chip (2A03 APU, NTSC): two pulse channels, triangle, noise and DPCM, driven by
// register writes ($4000-$4017, given as offsets 0x00-0x17) and rendered to samples.
export const CPU_HZ = 1789773;
export const FRAME_CYCLES = 29780.5;

const LENGTHS = [10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
  12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30];
const DUTIES = [[0, 1, 0, 0, 0, 0, 0, 0], [0, 1, 1, 0, 0, 0, 0, 0], [0, 1, 1, 1, 1, 0, 0, 0], [1, 0, 0, 1, 1, 1, 1, 1]];
const TRIANGLE = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const NOISE_PERIODS = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
const DMC_RATES = [428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54];
// Frame sequencer steps in CPU cycles (4-step and 5-step modes).
const STEPS = [[7457, 14913, 22371, 29829], [7457, 14913, 22371, 29829, 37281]];

function envelope() {
  return { start: false, divider: 0, decay: 0, loop: false, constant: false, volume: 0 };
}

function clockEnvelope(e) {
  if (e.start) {
    e.start = false;
    e.decay = 15;
    e.divider = e.volume;
  } else if (e.divider > 0) {
    e.divider -= 1;
  } else {
    e.divider = e.volume;
    if (e.decay > 0) e.decay -= 1;
    else if (e.loop) e.decay = 15;
  }
}

const envelopeLevel = (e) => (e.constant ? e.volume : e.decay);

function pulse(ones) {
  return {
    ones, // pulse 1 negates its sweep in ones' complement
    enabled: false, duty: 0, step: 0, period: 0, timer: 0, length: 0, env: envelope(),
    sweep: { enabled: false, period: 0, negate: false, shift: 0, reload: false, divider: 0 },
  };
}

function sweepTarget(p) {
  const change = p.period >> p.sweep.shift;
  return p.sweep.negate ? p.period - change - (p.ones ? 1 : 0) : p.period + change;
}

const pulseMuted = (p) => p.period < 8 || sweepTarget(p) > 0x7ff;

export function createApu(readMemory) {
  const p1 = pulse(true);
  const p2 = pulse(false);
  const tri = { enabled: false, control: false, linearLoad: 0, linear: 0, reload: false, period: 0, timer: 0, step: 0, length: 0 };
  const noise = { enabled: false, mode: false, period: NOISE_PERIODS[0], timer: 0, shift: 1, length: 0, env: envelope() };
  const dmc = {
    loop: false, rate: DMC_RATES[0], timer: DMC_RATES[0], level: 0, start: 0xc000, size: 1,
    address: 0xc000, remaining: 0, buffer: -1, bits: 8, shifter: 0, silent: true,
  };
  const seq = { mode: 0, cycle: 0, next: 0 };

  function quarterFrame() {
    clockEnvelope(p1.env);
    clockEnvelope(p2.env);
    clockEnvelope(noise.env);
    if (tri.reload) tri.linear = tri.linearLoad;
    else if (tri.linear > 0) tri.linear -= 1;
    if (!tri.control) tri.reload = false;
  }

  function halfFrame() {
    for (const p of [p1, p2]) {
      if (!p.env.loop && p.length > 0) p.length -= 1;
      const s = p.sweep;
      if (s.divider === 0 && s.enabled && s.shift > 0 && !pulseMuted(p)) p.period = sweepTarget(p);
      if (s.divider === 0 || s.reload) {
        s.divider = s.period;
        s.reload = false;
      } else {
        s.divider -= 1;
      }
    }
    if (!tri.control && tri.length > 0) tri.length -= 1;
    if (!noise.env.loop && noise.length > 0) noise.length -= 1;
  }

  function writePulse(p, reg, v) {
    if (reg === 0) {
      p.duty = v >> 6;
      p.env.loop = Boolean(v & 0x20);
      p.env.constant = Boolean(v & 0x10);
      p.env.volume = v & 0x0f;
    } else if (reg === 1) {
      Object.assign(p.sweep, { enabled: Boolean(v & 0x80), period: (v >> 4) & 7, negate: Boolean(v & 8), shift: v & 7, reload: true });
    } else if (reg === 2) {
      p.period = (p.period & 0x700) | v;
    } else {
      p.period = (p.period & 0xff) | ((v & 7) << 8);
      if (p.enabled) p.length = LENGTHS[v >> 3];
      p.step = 0;
      p.env.start = true;
    }
  }

  function restartSample() {
    dmc.address = dmc.start;
    dmc.remaining = dmc.size;
  }

  // $4015 limited to the channels in `mask` (bits: pulse 1, pulse 2, triangle, noise, DPCM).
  function enable(mask, v) {
    [p1, p2, tri, noise].forEach((c, i) => {
      if (!(mask & (1 << i))) return;
      c.enabled = Boolean(v & (1 << i));
      if (!c.enabled) c.length = 0;
    });
    if (!(mask & 0x10)) return;
    if (!(v & 0x10)) dmc.remaining = 0;
    else if (dmc.remaining === 0) restartSample();
  }

  function write(reg, v) {
    if (reg < 0x04) writePulse(p1, reg, v);
    else if (reg < 0x08) writePulse(p2, reg - 4, v);
    else if (reg === 0x08) {
      tri.control = Boolean(v & 0x80);
      tri.linearLoad = v & 0x7f;
    } else if (reg === 0x0a) tri.period = (tri.period & 0x700) | v;
    else if (reg === 0x0b) {
      tri.period = (tri.period & 0xff) | ((v & 7) << 8);
      if (tri.enabled) tri.length = LENGTHS[v >> 3];
      tri.reload = true;
    } else if (reg === 0x0c) {
      noise.env.loop = Boolean(v & 0x20);
      noise.env.constant = Boolean(v & 0x10);
      noise.env.volume = v & 0x0f;
    } else if (reg === 0x0e) {
      noise.mode = Boolean(v & 0x80);
      noise.period = NOISE_PERIODS[v & 0x0f];
    } else if (reg === 0x0f) {
      if (noise.enabled) noise.length = LENGTHS[v >> 3];
      noise.env.start = true;
    } else if (reg === 0x10) {
      dmc.loop = Boolean(v & 0x40);
      dmc.rate = DMC_RATES[v & 0x0f];
    } else if (reg === 0x11) dmc.level = v & 0x7f;
    else if (reg === 0x12) dmc.start = 0xc000 + v * 64;
    else if (reg === 0x13) dmc.size = v * 16 + 1;
    else if (reg === 0x15) enable(0x1f, v);
    else if (reg === 0x17) {
      seq.mode = v >> 7;
      seq.cycle = 0;
      seq.next = 0;
      if (seq.mode === 1) {
        quarterFrame();
        halfFrame();
      }
    }
  }

  function clockSequencer(cycles) {
    seq.cycle += cycles;
    const steps = STEPS[seq.mode];
    while (seq.cycle >= steps[seq.next]) {
      const i = seq.next;
      const last = steps.length - 1;
      if (seq.mode === 0 || i !== 3) quarterFrame();
      if (i === 1 || i === last) halfFrame();
      if (i === last) {
        seq.cycle -= steps[last];
        seq.next = 0;
      } else {
        seq.next += 1;
      }
    }
  }

  function clockDmcOutput() {
    if (!dmc.silent) {
      if (dmc.shifter & 1) {
        if (dmc.level <= 125) dmc.level += 2;
      } else if (dmc.level >= 2) {
        dmc.level -= 2;
      }
    }
    dmc.shifter >>= 1;
    dmc.bits -= 1;
    if (dmc.bits === 0) {
      dmc.bits = 8;
      if (dmc.buffer < 0) {
        dmc.silent = true;
      } else {
        dmc.silent = false;
        dmc.shifter = dmc.buffer;
        dmc.buffer = -1;
      }
    }
    if (dmc.buffer < 0 && dmc.remaining > 0) {
      dmc.buffer = readMemory(dmc.address);
      dmc.address = dmc.address === 0xffff ? 0x8000 : dmc.address + 1;
      dmc.remaining -= 1;
      if (dmc.remaining === 0 && dmc.loop) restartSample();
    }
  }

  // Advances the channels by `cycles` CPU cycles (any amount; timers carry over).
  function clock(cycles) {
    clockSequencer(cycles);
    for (const p of [p1, p2]) {
      // Pulse timers tick every other CPU cycle.
      let n = cycles / 2;
      const period = p.period + 1;
      while (n >= p.timer) {
        n -= p.timer;
        p.timer = period;
        p.step = (p.step + 1) & 7;
      }
      p.timer -= n;
    }
    {
      let n = cycles;
      const period = tri.period + 1;
      const running = tri.linear > 0 && tri.length > 0;
      while (n >= tri.timer) {
        n -= tri.timer;
        tri.timer = period;
        if (running) tri.step = (tri.step + 1) & 31;
      }
      tri.timer -= n;
    }
    {
      let n = cycles;
      while (n >= noise.timer) {
        n -= noise.timer;
        noise.timer = noise.period;
        const bit = (noise.shift ^ (noise.shift >> (noise.mode ? 6 : 1))) & 1;
        noise.shift = (noise.shift >> 1) | (bit << 14);
      }
      noise.timer -= n;
    }
    {
      let n = cycles;
      while (n >= dmc.timer) {
        n -= dmc.timer;
        dmc.timer = dmc.rate;
        clockDmcOutput();
      }
      dmc.timer -= n;
    }
  }

  // The mixed output, 0..~1 (the NES's non-linear mixer).
  function output() {
    const pulseOut = (p) => (p.length > 0 && !pulseMuted(p) && DUTIES[p.duty][p.step] ? envelopeLevel(p.env) : 0);
    const sq = pulseOut(p1) + pulseOut(p2);
    // An ultrasonic triangle (period < 2) is left out rather than aliased.
    const t = tri.period < 2 ? 7.5 : TRIANGLE[tri.step];
    const n = noise.length > 0 && !(noise.shift & 1) ? envelopeLevel(noise.env) : 0;
    const d = dmc.level;
    const pulseMix = sq === 0 ? 0 : 95.88 / (8128 / sq + 100);
    const tnd = t / 8227 + n / 12241 + d / 22638;
    const tndMix = tnd === 0 ? 0 : 159.79 / (1 / tnd + 100);
    return pulseMix + tndMix;
  }

  return { write, enable, clock, output };
}

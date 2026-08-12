/** The table's sounds, synthesised rather than shipped.
 *
 * Every one of these is a few oscillators and a gain envelope, so there is no
 * audio asset to load, nothing to 404 on a slow connection, and the whole set
 * costs nothing in the bundle. They are short and quiet on purpose: a poker
 * table should be heard from the next room, not the next street.
 */

let audioContext = null;

function context() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  // Browsers hold the context suspended until a gesture; once the player has
  // clicked anything at all this is a no-op.
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

/** One note. `type` shapes the timbre, the envelope keeps it from clicking. */
function tone(ctx, { freq, start, duration, peak, type = "sine", endFreq }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** A short burst of noise — the body of anything that clicks or clatters. */
function noise(ctx, { start, duration, peak, frequency, Q = 1 }) {
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    // Decaying white noise: loud at the strike, gone almost at once.
    samples[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = Q;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
}

function play(build) {
  try {
    const ctx = context();
    if (ctx) build(ctx, ctx.currentTime);
  } catch {
    // Sound is a nicety. It must never be able to break the table.
  }
}

/** Your turn: two rising notes, the one sound meant to pull you back to the tab. */
export function playTurnChime() {
  play((ctx, now) => {
    tone(ctx, { freq: 880, start: now, duration: 0.18, peak: 0.18 });
    tone(ctx, { freq: 1174, start: now + 0.12, duration: 0.18, peak: 0.18 });
  });
}

/** A bet or raise: two chips landing on each other, a beat apart. */
export function playChips() {
  play((ctx, now) => {
    [0, 0.055].forEach((offset) => {
      noise(ctx, { start: now + offset, duration: 0.07, peak: 0.22, frequency: 2600, Q: 0.9 });
      tone(ctx, { freq: 1500, start: now + offset, duration: 0.05, peak: 0.05, type: "triangle" });
    });
  });
}

/** A check: knuckles on the table. Low, dry, no ring to it. */
export function playCheck() {
  play((ctx, now) => {
    noise(ctx, { start: now, duration: 0.06, peak: 0.28, frequency: 220, Q: 0.7 });
    tone(ctx, { freq: 150, start: now, duration: 0.07, peak: 0.12, type: "sine", endFreq: 90 });
  });
}

/** A fold: the soft brush of cards pushed away. */
export function playFold() {
  play((ctx, now) => {
    noise(ctx, { start: now, duration: 0.14, peak: 0.1, frequency: 1200, Q: 0.5 });
  });
}

/** All in: the whole stack goes, so it gets a longer clatter and a rising note
 *  underneath. This is the one moment at the table that deserves the drama. */
export function playAllIn() {
  play((ctx, now) => {
    [0, 0.05, 0.1, 0.16, 0.23].forEach((offset, index) => {
      noise(ctx, {
        start: now + offset, duration: 0.09, peak: 0.2 - index * 0.02,
        frequency: 2400 + index * 220, Q: 0.9,
      });
    });
    tone(ctx, { freq: 220, start: now, duration: 0.42, peak: 0.13, type: "triangle", endFreq: 660 });
  });
}

/** Which sound an action at the table makes. */
export function playAction({ action, isAllIn }) {
  if (isAllIn) return playAllIn();
  switch (action) {
    case "check": return playCheck();
    case "fold": return playFold();
    case "bet":
    case "raise":
    case "call":
    case "blind":
    case "ante": return playChips();
    default: return undefined;
  }
}

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

/**
 * A rising wash of filtered noise — the sound a film uses to say something is
 * coming. The band climbs and the level swells, so it reads as approach rather
 * than as a burst.
 */
function riser(ctx, { start, duration, peak, fromFreq, toFreq, Q = 2.2 }) {
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  // Flat noise, not decaying: the shape comes from the envelope below, and a
  // decaying buffer would fight the swell.
  for (let i = 0; i < frames; i += 1) samples[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(fromFreq, start);
  filter.frequency.exponentialRampToValueAtTime(toFreq, start + duration);
  filter.Q.value = Q;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + duration * 0.86);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}

/**
 * A held low note that opens up as it goes.
 *
 * Sine through a lowpass that sweeps upward, with a slow wobble on the pitch.
 * The wobble is what keeps it from sounding like a test tone: nothing in a
 * score is ever perfectly still.
 */
function drone(ctx, { start, duration, freq, peak, wobble = 3.5, rate = 5.5 }) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, start);

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = rate;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = wobble;
  lfo.connect(lfoDepth).connect(osc.detune);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(220, start);
  filter.frequency.linearRampToValueAtTime(1400, start + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  // Slow in, hold, and out before the end — a swell rather than a note.
  gain.gain.exponentialRampToValueAtTime(peak, start + duration * 0.45);
  gain.gain.setValueAtTime(peak, start + duration * 0.78);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
  lfo.start(start);
  lfo.stop(start + duration + 0.02);
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

/** Your regular time is gone and the bank has started draining.
 *
 * The turn chime inverted — two notes falling where that one rises. Same shape,
 * opposite direction, so it reads as "something has run out" without having to
 * be loud about it.
 */
export function playTimeBankWarning() {
  play((ctx, now) => {
    tone(ctx, { freq: 1174, start: now, duration: 0.16, peak: 0.16, type: "triangle" });
    tone(ctx, { freq: 740, start: now + 0.14, duration: 0.24, peak: 0.16, type: "triangle" });
  });
}

/** One second of the time bank going by.
 *
 * A clock escapement, not a beep: a tiny filtered click with a short square
 * blip inside it. `tic` alternates the pitch between seconds, which is what
 * turns a row of identical clicks into a tick-tock. Quieter than everything
 * else here on purpose — this one repeats, and it plays while somebody is
 * trying to think.
 */
export function playTick(tic) {
  play((ctx, now) => {
    noise(ctx, { start: now, duration: 0.028, peak: 0.1, frequency: tic ? 3000 : 2100, Q: 2.2 });
    tone(ctx, {
      freq: tic ? 1250 : 940, start: now, duration: 0.022, peak: 0.035, type: "square",
    });
  });
}

/** Time is up. Low, flat and falling, with none of the ring the other cues
 *  have — nothing good happens after this one. */
export function playTimeExpired() {
  play((ctx, now) => {
    tone(ctx, { freq: 300, start: now, duration: 0.45, peak: 0.2, type: "sawtooth", endFreq: 120 });
    noise(ctx, { start: now, duration: 0.18, peak: 0.07, frequency: 400, Q: 0.6 });
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

/**
 * The moment the money is already in and the cards decide it.
 *
 * A low bed that swells while a chord climbs over it, then stops dead. It runs
 * just under two seconds because that is the pause before the next street
 * lands — it should end as the card does, not talk over it.
 *
 * Quieter than everything else here on purpose: this plays behind a table
 * people are reading, and tension is a thing you feel rather than one you are
 * told about.
 */
export function playAllInTension() {
  play((ctx, now) => {
    const length = 2.0;

    // Two lows a fraction apart, swelling together. They drift in and out of
    // phase with each other, and that slow beating is most of the unease —
    // it is also why there are two of them rather than one louder one.
    drone(ctx, { start: now, duration: length, freq: 46, peak: 0.11 });
    drone(ctx, { start: now, duration: length, freq: 46.6, peak: 0.09, rate: 4.1, wobble: 4 });

    // The wash climbing over them. Ends with the sound rather than before it,
    // so nothing lands on silence.
    riser(ctx, { start: now, duration: length, peak: 0.05, fromFreq: 260, toFreq: 2600 });

    // A fifth held far back, barely there — enough that the low is a chord and
    // not a hum, not enough to be a tune anybody could whistle.
    drone(ctx, { start: now + 0.35, duration: length - 0.5, freq: 138, peak: 0.028, rate: 3.2 });

    // Two slow heartbeats, the second closer than the first. Nothing else in
    // here has a pulse, which is what makes these two count.
    [0.25, 1.15].forEach((offset) => {
      tone(ctx, {
        freq: 58, start: now + offset, duration: 0.3,
        peak: 0.075, type: "sine", endFreq: 32,
      });
    });
  });
}

/** Something leaving your hand: air, and not much of it. */
export function playThrow() {
  play((ctx, now) => {
    noise(ctx, { start: now, duration: 0.22, peak: 0.1, frequency: 900, Q: 0.6 });
    tone(ctx, { freq: 420, start: now, duration: 0.2, peak: 0.05, type: "sine", endFreq: 180 });
  });
}

/** And landing on somebody. */
export function playSplat() {
  play((ctx, now) => {
    noise(ctx, { start: now, duration: 0.16, peak: 0.22, frequency: 320, Q: 0.8 });
    tone(ctx, { freq: 150, start: now, duration: 0.14, peak: 0.1, type: "square", endFreq: 60 });
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

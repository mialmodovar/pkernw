/** The table's sounds, synthesised rather than shipped.
 *
 * Every one of these is a few oscillators and a gain envelope, so there is no
 * audio asset to load, nothing to 404 on a slow connection, and the whole set
 * costs nothing in the bundle. They are short and quiet on purpose: a poker
 * table should be heard from the next room, not the next street.
 */

let audioContext = null;

// When the pulse already running is due to finish, so a second one does not
// start on top of it.
let heartbeatUntil = 0;

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

/** A game you queued for has started somewhere else.
 *
 * The one sound that plays when you are not looking at the thing it is about —
 * from the lobby, from a club page, from the felt of a different table — so it
 * has to carry further than the turn chime and must not be mistaken for it.
 * Three notes up an arpeggio rather than two up a step, and then the table
 * being dealt underneath, which is literally what has just happened.
 */
export function playGameStarting() {
  play((ctx, now) => {
    [523, 659, 880].forEach((freq, index) => {
      tone(ctx, {
        freq, start: now + index * 0.1, duration: 0.26, peak: 0.2, type: "triangle",
      });
    });
    // Held over the top of the arpeggio: the note that makes it an announcement
    // rather than three separate beeps.
    tone(ctx, { freq: 1319, start: now + 0.3, duration: 0.5, peak: 0.15, type: "triangle" });
    for (let card = 0; card < 4; card += 1) {
      noise(ctx, {
        start: now + 0.42 + card * 0.075, duration: 0.045, peak: 0.08,
        frequency: 2600, Q: 0.9,
      });
    }
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
 * A pulse, when somebody's tournament is on the line.
 *
 * Two thumps to a beat, the second softer and close behind the first, the way
 * a heart actually goes — one thump on its own reads as a drum. The beats
 * quicken slightly as they go, which is the whole trick: a steady pulse is
 * calm, and one that is speeding up is not.
 *
 * Low and quiet, because it belongs under the table rather than on top of it.
 */
export function playHeartbeat({ beats = 5 } = {}) {
  play((ctx, now) => {
    // Three players shoving in a row is one moment, not three. A second pulse
    // laid over the first would beat out of time with itself.
    if (now < heartbeatUntil) return;

    let at = now;
    let gap = 0.78;

    for (let beat = 0; beat < beats; beat += 1) {
      // Lub: the one you feel.
      tone(ctx, { freq: 62, start: at, duration: 0.26, peak: 0.13, type: "sine", endFreq: 33 });
      noise(ctx, { start: at, duration: 0.07, peak: 0.05, frequency: 120, Q: 1.4 });

      // Dub: softer, higher, and right behind it.
      tone(ctx, { freq: 54, start: at + 0.19, duration: 0.2, peak: 0.085, type: "sine", endFreq: 30 });

      at += gap;
      // Each one a little sooner than the last.
      gap *= 0.9;
    }

    heartbeatUntil = at;
  });
}

/**
 * Cards going round the table.
 *
 * One flick per card, two rounds of them, at the pace a dealer actually pitches
 * — a card every seventy milliseconds or so, and a short gap between the first
 * round and the second. Each one is a scrape of filtered noise: card on felt,
 * nothing more. Quiet, because this fires at the start of every single hand.
 */
export function playDeal(players = 2) {
  // A nine-handed table is eighteen cards and a second and a half of rattling.
  // Enough of them to hear a table being dealt is the point, not a headcount.
  const seats = Math.max(1, Math.min(9, players));
  play((ctx, now) => {
    for (let round = 0; round < 2; round += 1) {
      for (let seat = 0; seat < seats; seat += 1) {
        const at = now + round * (seats * 0.07 + 0.09) + seat * 0.07;
        noise(ctx, { start: at, duration: 0.045, peak: 0.075, frequency: 2600, Q: 0.9 });
        noise(ctx, { start: at + 0.01, duration: 0.03, peak: 0.03, frequency: 700, Q: 0.6 });
      }
    }
  });
}

/** Something leaving your hand: air, and not much of it. */
export function playThrow() {
  play((ctx, now) => {
    noise(ctx, { start: now, duration: 0.22, peak: 0.1, frequency: 900, Q: 0.6 });
    tone(ctx, { freq: 420, start: now, duration: 0.2, peak: 0.05, type: "sine", endFreq: 180 });
  });
}

/**
 * And landing on somebody — in the voice of whatever it was.
 *
 * A brick and a rose arriving with the same wet thud was the joke falling flat:
 * half of throwing something is what it sounds like when it hits. Every one of
 * these is still a couple of oscillators and a burst of filtered noise, so the
 * set costs nothing to ship, and anything unrecognised lands on the old sound.
 */
const LANDINGS = {
  // Wet, and nothing left of it.
  splat: (ctx, now) => {
    noise(ctx, { start: now, duration: 0.16, peak: 0.22, frequency: 320, Q: 0.8 });
    tone(ctx, { freq: 150, start: now, duration: 0.14, peak: 0.1, type: "square", endFreq: 60 });
  },
  // Shell first, then the mess.
  crack: (ctx, now) => {
    noise(ctx, { start: now, duration: 0.04, peak: 0.24, frequency: 2600, Q: 1.4 });
    noise(ctx, { start: now + 0.04, duration: 0.18, peak: 0.16, frequency: 360, Q: 0.7 });
  },
  // Glass and liquid: a ring on top of the slop.
  glass: (ctx, now) => {
    noise(ctx, { start: now, duration: 0.05, peak: 0.2, frequency: 3400, Q: 2.5 });
    tone(ctx, { freq: 1800, start: now, duration: 0.22, peak: 0.07, type: "triangle", endFreq: 900 });
    noise(ctx, { start: now + 0.05, duration: 0.16, peak: 0.12, frequency: 420, Q: 0.8 });
  },
  // Something hard, off something solid.
  knock: (ctx, now) => {
    noise(ctx, { start: now, duration: 0.05, peak: 0.26, frequency: 1200, Q: 1.2 });
    tone(ctx, { freq: 260, start: now, duration: 0.1, peak: 0.12, type: "square", endFreq: 90 });
  },
  // Heavier, and it stays where it lands.
  thud: (ctx, now) => {
    noise(ctx, { start: now, duration: 0.09, peak: 0.2, frequency: 220, Q: 0.5 });
    tone(ctx, { freq: 110, start: now, duration: 0.2, peak: 0.16, type: "sine", endFreq: 45 });
  },
  // A chip on felt, and then the roll.
  clink: (ctx, now) => {
    tone(ctx, { freq: 2300, start: now, duration: 0.09, peak: 0.09, type: "triangle", endFreq: 1500 });
    noise(ctx, { start: now + 0.06, duration: 0.1, peak: 0.06, frequency: 1800, Q: 2 });
  },
  // Ice: brittle, high, and gone.
  chink: (ctx, now) => {
    tone(ctx, { freq: 3100, start: now, duration: 0.07, peak: 0.08, type: "triangle", endFreq: 2400 });
    noise(ctx, { start: now, duration: 0.06, peak: 0.12, frequency: 4200, Q: 3 });
  },
  // Petals. Barely a sound at all, which is the point of throwing one.
  soft: (ctx, now) => {
    noise(ctx, { start: now, duration: 0.18, peak: 0.05, frequency: 1600, Q: 0.5 });
  },
  // Powder snow.
  poff: (ctx, now) => {
    noise(ctx, { start: now, duration: 0.22, peak: 0.1, frequency: 700, Q: 0.4 });
    tone(ctx, { freq: 300, start: now, duration: 0.12, peak: 0.04, type: "sine", endFreq: 140 });
  },
  // Two notes of indignation, up and then further up.
  squawk: (ctx, now) => {
    tone(ctx, { freq: 700, start: now, duration: 0.1, peak: 0.12, type: "sawtooth", endFreq: 1250 });
    tone(ctx, { freq: 900, start: now + 0.11, duration: 0.13, peak: 0.1, type: "sawtooth", endFreq: 1500 });
  },
  // The only one anybody will complain is too loud, and rightly so.
  boom: (ctx, now) => {
    noise(ctx, { start: now, duration: 0.5, peak: 0.3, frequency: 160, Q: 0.3 });
    tone(ctx, { freq: 90, start: now, duration: 0.55, peak: 0.22, type: "sine", endFreq: 30 });
  },
  // Something better than it deserves to be.
  fanfare: (ctx, now) => {
    [880, 1108, 1318].forEach((freq, index) => {
      tone(ctx, { freq, start: now + index * 0.07, duration: 0.22, peak: 0.08, type: "triangle" });
    });
  },
};

/** Which of those each thing makes. Anything missing lands on the wet one. */
const LANDING_BY_ITEM = {
  tomato: "splat", egg: "crack", beer: "glass", chip: "clink",
  shoe: "thud", chicken: "squawk", rose: "soft", snowball: "poff",
  banana: "splat", ice: "chink", pie: "splat", fish: "splat",
  brick: "knock", bomb: "boom", crown: "fanfare",
};

/** Which landing an item makes, or null when nothing was written for it. */
export function landingFor(itemId) {
  const name = LANDING_BY_ITEM[itemId];
  return name && LANDINGS[name] ? name : null;
}

export function playSplat(itemId) {
  play(LANDINGS[landingFor(itemId) || "splat"]);
}

/**
 * The stings a knockout finisher can carry.
 *
 * A GIF landing in silence is half a joke. These are chosen with the GIF and
 * travel as a name, never a file — the server keeps the same list in
 * game/finishers.py, and anything it does not recognise arrives as silence.
 * Louder than the table's own sounds, because this one is a punchline, but
 * still short: it plays over somebody's worst moment of the night.
 */
const FINISHER_STINGS = {
  // ── Triumph ───────────────────────────────────────────────────────────
  fanfare: (ctx, now) => {
    [523, 659, 784, 1047].forEach((freq, index) => {
      tone(ctx, { freq, start: now + index * 0.09, duration: 0.3, peak: 0.11, type: "triangle" });
    });
  },
  // The bugle call, with the last note held the way a whole stand shouts it.
  charge: (ctx, now) => {
    const notes = [[392, 0.1], [523, 0.1], [659, 0.1], [784, 0.14], [659, 0.1], [784, 0.42]];
    let at = now;
    notes.forEach(([freq, length]) => {
      tone(ctx, { freq, start: at, duration: length, peak: 0.12, type: "sawtooth" });
      tone(ctx, { freq: freq * 2, start: at, duration: length, peak: 0.04, type: "triangle" });
      at += length * 0.92;
    });
  },
  // A jingle rather than a chord: up the scale and land on the octave.
  victory: (ctx, now) => {
    [523, 659, 784, 1047, 1319].forEach((freq, index) => {
      tone(ctx, { freq, start: now + index * 0.07, duration: 0.22, peak: 0.1, type: "triangle" });
    });
    tone(ctx, { freq: 2093, start: now + 0.35, duration: 0.5, peak: 0.09, type: "triangle" });
  },
  // Struck once and left to ring, with the harmonics that make it metal
  // rather than a beep.
  bell: (ctx, now) => {
    [[1046, 0.09], [2093, 0.05], [3140, 0.03], [4186, 0.02]].forEach(([freq, peak]) => {
      tone(ctx, { freq, start: now, duration: 1.4, peak, type: "sine" });
    });
    noise(ctx, { start: now, duration: 0.04, peak: 0.1, frequency: 5200, Q: 2 });
  },
  // Hands, not tones: a swell of noise that takes a moment to gather.
  applause: (ctx, now) => {
    for (let burst = 0; burst < 14; burst += 1) {
      const at = now + burst * 0.055;
      noise(ctx, {
        start: at, duration: 0.35, peak: 0.035 + Math.min(burst, 6) * 0.006,
        frequency: 1500 + burst * 90, Q: 0.4,
      });
    }
  },

  // ── Noise ─────────────────────────────────────────────────────────────
  airhorn: (ctx, now) => {
    [0, 0.16, 0.32].forEach((offset) => {
      tone(ctx, {
        freq: 420, start: now + offset, duration: 0.14, peak: 0.16,
        type: "sawtooth", endFreq: 380,
      });
      tone(ctx, {
        freq: 632, start: now + offset, duration: 0.14, peak: 0.1,
        type: "sawtooth", endFreq: 570,
      });
    });
  },
  boom: (ctx, now) => {
    noise(ctx, { start: now, duration: 0.6, peak: 0.3, frequency: 140, Q: 0.3 });
    tone(ctx, { freq: 80, start: now, duration: 0.7, peak: 0.24, type: "sine", endFreq: 28 });
  },
  slam: (ctx, now) => {
    noise(ctx, { start: now, duration: 0.12, peak: 0.3, frequency: 900, Q: 0.7 });
    tone(ctx, { freq: 180, start: now, duration: 0.28, peak: 0.2, type: "square", endFreq: 50 });
  },
  // Far off and rolling, rather than a bang.
  thunder: (ctx, now) => {
    noise(ctx, { start: now, duration: 1.6, peak: 0.26, frequency: 90, Q: 0.25 });
    noise(ctx, { start: now + 0.25, duration: 1.1, peak: 0.16, frequency: 160, Q: 0.4 });
    tone(ctx, { freq: 54, start: now, duration: 1.7, peak: 0.14, type: "sine", endFreq: 26 });
  },
  // Sticks, faster and faster, and then the crash that stops them.
  drumroll: (ctx, now) => {
    let at = now;
    let gap = 0.075;
    while (at < now + 1.1) {
      noise(ctx, { start: at, duration: 0.05, peak: 0.12, frequency: 320, Q: 1.1 });
      at += gap;
      gap = Math.max(0.028, gap * 0.93);
    }
    noise(ctx, { start: at, duration: 0.7, peak: 0.22, frequency: 6000, Q: 0.3 });
  },
  // Two notes and a whistle: the sound of somebody being sent off.
  whistle: (ctx, now) => {
    [0, 0.22].forEach((offset) => {
      tone(ctx, {
        freq: 2400, start: now + offset, duration: 0.18, peak: 0.1,
        type: "sine", endFreq: 2650,
      });
      noise(ctx, { start: now + offset, duration: 0.18, peak: 0.05, frequency: 2500, Q: 6 });
    });
  },
  siren: (ctx, now) => {
    for (let sweep = 0; sweep < 3; sweep += 1) {
      const at = now + sweep * 0.36;
      tone(ctx, { freq: 620, start: at, duration: 0.18, peak: 0.11, type: "sawtooth", endFreq: 960 });
      tone(ctx, { freq: 960, start: at + 0.18, duration: 0.18, peak: 0.11, type: "sawtooth", endFreq: 620 });
    }
  },

  // ── Comedy ────────────────────────────────────────────────────────────
  // Three notes falling: the sound of somebody's night ending.
  sting: (ctx, now) => {
    [660, 550, 440].forEach((freq, index) => {
      tone(ctx, {
        freq, start: now + index * 0.13, duration: 0.24, peak: 0.12,
        type: "square", endFreq: freq * 0.94,
      });
    });
  },
  // The full slide down, which is a different joke from three notes.
  trombone: (ctx, now) => {
    [[392, 0.18], [349, 0.18], [311, 0.2]].forEach(([freq, length], index) => {
      tone(ctx, {
        freq, start: now + index * 0.19, duration: length, peak: 0.13,
        type: "sawtooth", endFreq: freq * 0.86,
      });
    });
    tone(ctx, { freq: 262, start: now + 0.57, duration: 0.55, peak: 0.13, type: "sawtooth", endFreq: 160 });
  },
  // Ba-dum-tss.
  rimshot: (ctx, now) => {
    noise(ctx, { start: now, duration: 0.07, peak: 0.2, frequency: 260, Q: 1.2 });
    noise(ctx, { start: now + 0.14, duration: 0.07, peak: 0.2, frequency: 200, Q: 1.2 });
    noise(ctx, { start: now + 0.3, duration: 0.5, peak: 0.16, frequency: 7000, Q: 0.3 });
  },
  // A spring, wobbling itself still.
  boing: (ctx, now) => {
    tone(ctx, { freq: 620, start: now, duration: 0.5, peak: 0.14, type: "sine", endFreq: 120 });
    [0.12, 0.26, 0.4].forEach((offset, index) => {
      tone(ctx, {
        freq: 300 - index * 60, start: now + offset, duration: 0.16, peak: 0.06 - index * 0.015,
        type: "sine", endFreq: 180 - index * 40,
      });
    });
  },
  // Up, and then straight back down.
  slidewhistle: (ctx, now) => {
    tone(ctx, { freq: 500, start: now, duration: 0.35, peak: 0.1, type: "sine", endFreq: 2200 });
    tone(ctx, { freq: 2200, start: now + 0.36, duration: 0.4, peak: 0.1, type: "sine", endFreq: 400 });
  },
  // Not a duck, but near enough that everybody hears a duck.
  quack: (ctx, now) => {
    [0, 0.19].forEach((offset) => {
      tone(ctx, {
        freq: 320, start: now + offset, duration: 0.16, peak: 0.13,
        type: "sawtooth", endFreq: 180,
      });
    });
  },

  // ── Arcade ────────────────────────────────────────────────────────────
  powerup: (ctx, now) => {
    [392, 523, 659, 784, 1047, 1319].forEach((freq, index) => {
      tone(ctx, { freq, start: now + index * 0.05, duration: 0.12, peak: 0.09, type: "square" });
    });
  },
  gameover: (ctx, now) => {
    [523, 415, 330, 262].forEach((freq, index) => {
      tone(ctx, { freq, start: now + index * 0.14, duration: 0.2, peak: 0.1, type: "square" });
    });
    tone(ctx, { freq: 131, start: now + 0.56, duration: 0.5, peak: 0.1, type: "square" });
  },
  coin: (ctx, now) => {
    tone(ctx, { freq: 988, start: now, duration: 0.07, peak: 0.1, type: "square" });
    tone(ctx, { freq: 1319, start: now + 0.07, duration: 0.4, peak: 0.1, type: "square" });
  },
  // Three chords, each one worse news than the last.
  dundundun: (ctx, now) => {
    [0, 0.42, 0.84].forEach((offset, index) => {
      [110, 165, 208].forEach((freq) => {
        tone(ctx, {
          freq: freq * (1 - index * 0.06), start: now + offset,
          duration: index === 2 ? 0.9 : 0.34, peak: 0.075, type: "sawtooth",
        });
      });
    });
  },
};

/** Whether a name is one of ours. "none" is a choice, not a mistake. */
export function finisherSoundExists(name) {
  return Boolean(FINISHER_STINGS[name]);
}

export function playFinisherSound(name) {
  const sting = FINISHER_STINGS[name];
  if (sting) play(sting);
}

/** Which sound an action at the table makes. */
export function playAction({ action, isAllIn }) {
  // The chips going in, and then your pulse under them. It starts the moment
  // somebody is all in — whether or not anyone ever calls, because the tension
  // is in the stack being out there, not in how the hand resolves.
  if (isAllIn) {
    playAllIn();
    return playHeartbeat();
  }
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

import { useEffect, useRef } from "react";

let audioContext = null;

// Two short rising notes, synthesised — no audio asset to ship or load.
function playChime() {
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    if (!audioContext) audioContext = new Ctor();
    // Browsers suspend the context until a user gesture; resume is a no-op
    // once the player has clicked anything.
    if (audioContext.state === "suspended") audioContext.resume();

    const now = audioContext.currentTime;
    [[880, 0], [1174, 0.12]].forEach(([freq, offset]) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
  } catch {
    // Audio is a nicety — never let it break the table.
  }
}

/**
 * Fires when it becomes the hero's turn: a chime (if not muted) and a flashing
 * document title, so a backgrounded tab still gets noticed. The title is
 * restored as soon as the turn ends.
 */
export function useTurnAlert(isMyTurn, soundEnabled) {
  const wasMyTurn = useRef(false);

  useEffect(() => {
    if (isMyTurn && !wasMyTurn.current && soundEnabled) playChime();
    wasMyTurn.current = isMyTurn;
  }, [isMyTurn, soundEnabled]);

  useEffect(() => {
    if (!isMyTurn) return undefined;
    const original = document.title;
    let on = false;
    const id = setInterval(() => {
      on = !on;
      document.title = on ? "● YOUR TURN" : original;
    }, 900);
    return () => {
      clearInterval(id);
      document.title = original;
    };
  }, [isMyTurn]);
}

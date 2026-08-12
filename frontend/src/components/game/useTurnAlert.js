import { useEffect, useRef } from "react";
import { playTurnChime } from "./sounds";

/**
 * Fires when it becomes the hero's turn: a chime (if not muted) and a flashing
 * document title, so a backgrounded tab still gets noticed. The title is
 * restored as soon as the turn ends.
 */
export function useTurnAlert(isMyTurn, soundEnabled) {
  const wasMyTurn = useRef(false);

  useEffect(() => {
    if (isMyTurn && !wasMyTurn.current && soundEnabled) playTurnChime();
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

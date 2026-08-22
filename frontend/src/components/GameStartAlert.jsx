import { useCallback, useEffect, useState } from "react";
import Icon from "./icons/Icon";
import { useLocation, useNavigate } from "react-router-dom";

import { onMessage } from "../api/presence";
import { notify } from "../api/notifications";
import useAuthStore from "../store/authStore";
import useFastGameStore from "../store/fastGameStore";
import useGameStore from "../store/gameStore";
import useTablesStore from "../store/tablesStore";
import { playGameStarting } from "./game/sounds";
import { alertText, tablePath, worthTelling } from "./startingGame";

/**
 * "Your game is starting", from wherever you happen to be.
 *
 * A player can hold seats at several tiers at once, and the last one of them
 * fills whenever the last stranger sits down — which is not a moment they can
 * be watching for. The lobby polls for it and walks you to the table, but only
 * while the lobby is the page on screen. Sitting down and then going to play
 * the game you already had running is the ordinary way to use this app, and
 * that player was being dealt into a table nothing had told them about.
 *
 * So: a sound, a flashing title, a notification if the window is behind
 * something else, and a banner with the way in. What it deliberately does not
 * do is move you — somebody halfway through a hand at another table is not to
 * be dragged out of it. The lobby's own redirect stays where it is, because
 * there you are doing nothing else.
 *
 * Outside the routes, like TableShortcut and for the same reason: a game of
 * yours starting is a fact about the app rather than about the page.
 */
export default function GameStartAlert() {
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const soundEnabled = useGameStore((s) => s.soundEnabled);
  const [pending, setPending] = useState([]);

  const dismiss = useCallback((id) => {
    setPending((games) => games.filter((one) => one.id !== id));
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    return onMessage((message) => {
      if (message?.type !== "fast_game_started") return;
      const game = message.game;
      if (!game?.id) return;

      // The tab strip and the lobby both draw from the server's idea of your
      // seats, and neither has any reason to have asked since this happened.
      useTablesStore.getState().refreshSeats();
      useFastGameStore.getState().fetchLobby({ silent: true }).catch(() => {});

      // Read at delivery rather than from the closure: this listener outlives
      // several navigations, and where the player is *now* is what decides
      // whether they are being told something they can already see.
      if (!worthTelling({ pathname: window.location.pathname, gameId: game.id })) return;

      if (soundEnabled) playGameStarting();

      const { title, body } = alertText(game);
      notify({
        title,
        body,
        // The same game twice — a reconnect redelivering the message — is one
        // piece of news and must not stack two toasts.
        tag: `fast-game-${game.id}`,
        onClick: () => navigate(tablePath(game.id)),
      });

      setPending((games) => (
        games.some((one) => one.id === game.id) ? games : [...games, game]
      ));
    });
  }, [user, soundEnabled, navigate]);

  // Arriving at the table is the alert being answered, whether it was answered
  // by pressing the button here or by finding your own way there.
  useEffect(() => {
    setPending((games) => {
      const answered = games.filter(
        (game) => worthTelling({ pathname: location.pathname, gameId: game.id }),
      );
      return answered.length === games.length ? games : answered;
    });
  }, [location.pathname]);

  // A backgrounded tab shows nothing but its title, which makes the title the
  // only part of this that reaches somebody who has gone to read the news.
  useEffect(() => {
    if (pending.length === 0) return undefined;
    const original = document.title;
    let on = false;
    const id = setInterval(() => {
      on = !on;
      document.title = on ? "● GAME STARTING" : original;
    }, 900);
    return () => {
      clearInterval(id);
      document.title = original;
    };
  }, [pending.length]);

  // Logging out takes the alerts with it: they are somebody's seats.
  useEffect(() => {
    if (!user) setPending([]);
  }, [user]);

  if (pending.length === 0) return null;

  return (
    // Above TableShortcut rather than beside it: both live in this corner, and
    // this one is the more urgent of the two.
    <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-2">
      {pending.map((game) => {
        const { title, body } = alertText(game);
        return (
          <div
            key={game.id}
            role="alert"
            className="panel-raised animate-fade-in flex items-center gap-3 rounded-xl
                       border border-(--color-accent) px-3 py-2.5 shadow-xl shadow-black/50"
          >
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold">{title}</span>
              <span className="text-[11px] text-(--color-text-muted)">{body}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                dismiss(game.id);
                navigate(tablePath(game.id));
              }}
              className="btn-accent shrink-0 rounded px-3 py-1.5 text-xs font-semibold"
            >
              Take your seat
            </button>
            <button
              type="button"
              onClick={() => dismiss(game.id)}
              aria-label="Dismiss"
              title="Dismiss"
              className="shrink-0 px-1 text-(--color-text-muted) transition-colors
                         hover:text-(--color-silver)"
            >
              <Icon name="close" className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

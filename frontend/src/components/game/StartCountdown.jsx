import { send } from "../../api/socket";
import useGameStore from "../../store/gameStore";
import SpinReveal from "./SpinReveal";

/**
 * The wait before the first hand, with a way out of it.
 *
 * The thirty seconds exist so everybody has time to load the table, not because
 * the table needs them. Once every seat says it is ready there is nothing left
 * to wait for, and sitting through the rest of the count is just sitting there.
 *
 * Ready is unanimous among seated players, so one person cannot start the
 * tournament while the others are still opening the page — and anyone who never
 * connects simply lets the count run out as before.
 */
export default function StartCountdown({ myUserId }) {
  const countdown = useGameStore((s) => s.countdown);
  // A Spin n Go spends its short countdown showing what was drawn, which is the
  // one thing about the game nobody chose and everybody wants to see. The other
  // instant formats have nothing to reveal, so they say what they are instead.
  const fast = useGameStore((s) => s.fast);
  const readyUserIds = useGameStore((s) => s.readyUserIds);
  const readyTotal = useGameStore((s) => s.readyTotal);
  const players = useGameStore((s) => s.players);

  if (countdown === null || countdown <= 0) return null;

  const iAmReady = myUserId != null && readyUserIds.includes(myUserId);
  const readyCount = readyUserIds.length;
  // Falls back to the roster we can see, so the tally is never blank while the
  // first ready_state is in flight.
  const total = readyTotal || players.length;
  const waitingOn = players
    .filter((p) => p.user_id != null && !readyUserIds.includes(p.user_id))
    .map((p) => p.name);

  return (
    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20 px-4 text-center">
      {fast ? (
        <>
          {fast.multiplier > 0 ? (
            <SpinReveal spin={fast} />
          ) : (
            <div className="flex flex-col items-center">
              <div className="text-(--color-text-muted) text-sm tracking-[0.2em] uppercase mb-2">
                {fast.label} · {"\u{1FA99}"} {fast.stake_coins} each
              </div>
              <div className="text-4xl font-bold tabular-nums text-(--color-highlight-text)">
                {"\u{1FA99}"} {Number(fast.prize_coins || 0).toLocaleString()}
              </div>
              <div className="text-(--color-text-muted) text-sm mt-1">in the middle</div>
            </div>
          )}
          <div className="text-(--color-text-muted) text-sm mt-3">
            Cards in <span className="tabular-nums">{countdown}</span>
          </div>
        </>
      ) : (
        <>
          <div className="text-(--color-text-muted) text-lg mb-2">Tournament starting in</div>
          <div className="text-6xl font-bold text-(--color-silver) tabular-nums">{countdown}</div>
        </>
      )}

      <button
        type="button"
        onClick={() => send({ type: "ready", value: !iAmReady })}
        aria-pressed={iAmReady}
        className={`mt-4 px-5 py-2 rounded font-semibold text-sm transition-colors ${
          iAmReady
            ? "panel-raised text-(--color-highlight-text) border border-(--color-highlight-edge)"
            : "btn-accent"
        }`}
      >
        {iAmReady ? "Ready ✓" : "I'm ready"}
      </button>

      <div className="text-(--color-text-muted) text-sm mt-3">
        {total > 0 && (
          <span className="tabular-nums">{readyCount}/{total} ready</span>
        )}
        {readyCount > 0 && waitingOn.length > 0 && (
          <span className="block mt-1 max-w-xs truncate">
            waiting on {waitingOn.join(", ")}
          </span>
        )}
        {readyCount === 0 && (
          <span className="block mt-1">Everyone ready starts it early.</span>
        )}
      </div>
    </div>
  );
}

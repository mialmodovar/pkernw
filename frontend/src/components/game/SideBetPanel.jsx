import { send } from "../../api/socket";
import useGameStore from "../../store/gameStore";
import Avatar from "../Avatar";
import { recordLabel, sideBetState } from "./sideBets";

/**
 * Side bets — the game the folded players get to play.
 *
 * Folding is the dullest thing that happens at a poker table: you are still
 * there, still waiting, and now with nothing to think about. This gives you
 * something to be right about. Nothing rides on it but a tally, which is the
 * only part anybody would remember anyway.
 *
 * One card doing four jobs rather than four things appearing in four corners:
 * it takes your call, holds it while the hand plays out, reads out how the
 * calls went, and otherwise is not there at all. Which of those it is doing is
 * decided in sideBets.js, where it can be tested.
 *
 * Sits in the felt's top-right corner — the spot the tournament info chip used
 * to occupy, and the one part of the table with nothing on it.
 */
export default function SideBetPanel({ mySeat, myUserId, canCall = true }) {
  const players = useGameStore((s) => s.players);
  const bets = useGameStore((s) => s.sideBets);
  const open = useGameStore((s) => s.sideBetsOpen);
  const results = useGameStore((s) => s.sideBetResults);
  const records = useGameStore((s) => s.sideBetRecords);

  const state = sideBetState({ players, mySeat, open, bets, results, myUserId, canCall });
  if (!state.mode) return null;

  const myRecord = recordLabel(records[myUserId]);

  return (
    <div className="absolute top-1 right-1 md:top-2 md:right-2 z-10 w-40 md:w-48
                    panel panel-floating rounded-lg shadow-lg shadow-black/50 select-none">
      <div className="flex items-baseline justify-between gap-2 px-2.5 pt-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-silver)">
          {state.mode === "results" ? "Called it" : "Side bet"}
        </span>
        {myRecord && (
          <span className="text-[10px] text-(--color-text-muted) whitespace-nowrap">{myRecord}</span>
        )}
      </div>

      {state.mode === "picking" && (
        <div className="px-1.5 pb-1.5 pt-1">
          <p className="px-1 pb-1 text-[10px] text-(--color-text-muted) leading-snug">
            Who takes it?
          </p>
          {state.contenders.map((player) => (
            <button
              key={player.seat}
              type="button"
              onClick={() => send({ type: "side_bet", on_user_id: player.user_id })}
              title={`Back ${player.name} to win this hand`}
              className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left
                         hover:bg-white/10 transition-colors"
            >
              <Avatar
                url={player.avatar_url}
                emoji={player.avatar}
                name={player.name}
                className="w-4 h-4 rounded-full shrink-0"
              />
              <span className="truncate text-[11px] font-semibold text-(--color-silver)">
                {player.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {state.mode === "waiting" && (
        <p className="px-2.5 pb-2 pt-0.5 text-[11px] leading-snug text-(--color-silver)">
          You are on{" "}
          <span className="font-bold text-(--color-highlight-text)">{state.myBet.on_name}</span>
        </p>
      )}

      {state.mode === "results" && (
        <div className="px-1.5 pb-1.5 pt-1 space-y-0.5">
          {state.results.map((one) => (
            <div key={one.user_id} className="flex items-center gap-1.5 px-1.5 py-0.5 text-[11px]">
              <span className={one.correct ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"}>
                {one.correct ? "✓" : "✗"}
              </span>
              <span className="truncate text-(--color-silver)">{one.name}</span>
              <span className="text-(--color-text-muted) shrink-0">on</span>
              <span className={`truncate ${
                one.correct ? "text-(--color-highlight-text) font-semibold" : "text-(--color-text-muted)"
              }`}>
                {one.on_name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

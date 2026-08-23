import { useEffect, useState } from "react";

import { send } from "../../api/socket";
import Icon from "../icons/Icon";
import useGameStore from "../../store/gameStore";
import useWalletStore from "../../store/walletStore";
import Avatar from "../Avatar";
import { recordLabel, sideBetState, stakeChoices } from "./sideBets";

const DEFAULT_STAKE = 25;

/**
 * Side bets — the game the folded players get to play.
 *
 * Folding is the dullest thing that happens at a poker table: you are still
 * there, still waiting, and now with nothing to think about. This gives you
 * something to be right about, and coins riding on being right.
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
  const balance = useWalletStore((s) => s.balance);
  const fetchWallet = useWalletStore((s) => s.fetchWallet);
  const setBalance = useWalletStore((s) => s.setBalance);
  const games = useWalletStore((s) => s.games);
  const [stake, setStake] = useState(DEFAULT_STAKE);

  // The table is often the first page a player opens, so the balance has to be
  // fetched here rather than assumed to have come from the lobby.
  useEffect(() => { if (balance == null) fetchWallet(); }, [balance, fetchWallet]);

  // A settled hand carries everybody's balance with it, so yours arrives
  // without asking. Reads its own row out of the table's results.
  useEffect(() => {
    const mine = (results || []).find((one) => one.user_id === myUserId);
    if (mine?.balance != null) setBalance(mine.balance);
  }, [results, myUserId, setBalance]);

  const state = sideBetState({ players, mySeat, open, bets, results, myUserId, canCall });
  if (!state.mode) return null;

  const game = games.find((one) => one.id === "player_bet");
  const stakes = stakeChoices(balance, game);
  const myRecord = recordLabel(records[myUserId]);
  // What a right call is worth: one player of however many are still in.
  const odds = state.contenders.length;

  return (
    <div className="absolute top-1 right-1 md:top-2 md:right-2 z-10 w-44 md:w-52
                    panel panel-floating rounded-lg shadow-lg shadow-black/50 select-none">
      <div className="flex items-baseline justify-between gap-2 px-2.5 pt-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-silver)">
          {state.mode === "results" ? "Called it" : "Side bet"}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-(--color-text-muted)
                         whitespace-nowrap">
          {/* The app's own coin, not the system emoji: that one is a different
              picture on every platform and none of them is the one in the
              header. */}
          {balance != null && <Icon name="coin" className="w-3 h-3" tone="gold" />}
          {balance != null ? balance.toLocaleString() : myRecord}
        </span>
      </div>

      {state.mode === "picking" && (
        <div className="px-1.5 pb-1.5 pt-1">
          {stakes.length === 0 ? (
            <p className="px-1 py-1 text-[10px] text-(--color-text-muted) leading-snug">
              No coins to call with — take today's from the lobby.
            </p>
          ) : (
            <>
              {/* The stake first: it is the thing you change, and the names
                  below it are the thing you click once you have. */}
              <div className="flex flex-wrap gap-1 px-1 pb-1.5">
                {stakes.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setStake(amount)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                      stake === amount
                        ? "bg-(--color-highlight) text-(--color-highlight-ink)"
                        : "panel-raised text-(--color-text-muted) hover:text-(--color-silver)"
                    }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>
              <p className="px-1 pb-1 text-[10px] text-(--color-text-muted) leading-snug">
                Who takes it? <span className="text-(--color-highlight-text) font-semibold">
                  {stake * odds} back
                </span>
              </p>
              {state.contenders.map((player) => (
                <button
                  key={player.seat}
                  type="button"
                  onClick={() => send({
                    type: "side_bet",
                    on_user_id: player.user_id,
                    stake: Math.min(stake, balance ?? 0),
                  })}
                  title={`Put ${stake} on ${player.name} to win this hand`}
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
            </>
          )}
        </div>
      )}

      {state.mode === "waiting" && (
        <p className="px-2.5 pb-2 pt-0.5 text-[11px] leading-snug text-(--color-silver)
                      flex items-center gap-1 flex-wrap">
          <Icon name="coin" className="w-3 h-3 shrink-0" tone="gold" />
          {state.myBet.stake} on{" "}
          <span className="font-bold text-(--color-highlight-text)">{state.myBet.on_name}</span>
          <span className="text-(--color-text-muted)"> · {state.myBet.returns} back</span>
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
              <span className={`ml-auto shrink-0 font-bold tabular-nums ${
                one.correct ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
              }`}>
                {one.correct ? `+${one.returns - one.stake}` : `−${one.stake}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

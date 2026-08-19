import { useEffect, useState } from "react";

import { giphyConfigured, gifPreviewUrl } from "../../api/giphy";
import { formatCoins, isSpinGo } from "../lobby/buyIn";
import { formatEuros } from "./formatMoney";
import { findOutcomeGif, outcomeOf } from "./outcomeGif";
import { entryCount, paidLabel, poolCoins } from "./prizePool";

const ordinal = (n) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
};

function Stat({ label, value }) {
  return (
    <div className="panel-raised rounded-md px-3 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">{label}</p>
      <p className="text-sm font-semibold text-(--color-silver) mt-0.5">{value}</p>
    </div>
  );
}

/**
 * The end of a tournament used to be the words "Tournament Complete" over a
 * bare list of names. Everything here was already on hand — the payout
 * structure, rebuy counts, the entrant list, the hand count and the final
 * level — it just was not being shown.
 */
export default function TournamentCompleteScreen({
  standings, tournament, username, handNumber, level, onLeave, onViewTournament,
}) {
  const rows = standings || [];
  const winner = rows.find((row) => row.finish === 1);
  const mine = rows.find((row) => row.username === username);
  const iWon = mine?.finish === 1;

  const payouts = tournament?.payout_structure || [];
  const payoutFor = (finish) => payouts.find((row) => row.place === finish);
  const playerRecord = (name) => tournament?.players?.find((p) => p.username === name);
  const spinGo = isSpinGo(tournament);

  const entrants = tournament?.players?.length ?? rows.length;
  const myPayout = mine ? payoutFor(mine.finish) : null;

  const bountyOn = (tournament?.bounty_mode || "none") !== "none" && (tournament?.bounty_cents || 0) > 0;
  // Once settled the ledger figure is the authoritative one — it includes the
  // bounty still on the winner's own head. Before that lands, what they
  // collected off other people is the best answer available.
  const bountyPrize = (record) => (record?.bounty_prize_cents || record?.bounty_won_cents || 0);
  const myRecord = mine ? playerRecord(mine.name) : null;

  const entries = entryCount(tournament);
  // What a place was worth. Once the game has settled, the ledger's own figure
  // is the truest answer there is — it is what was actually paid, in coins or in
  // euros — so it wins over anything recomputed here. A percentage is never the
  // answer where there is a pot to apply it to, which is every game that costs
  // anything.
  const prizeLabel = (finish, record) => paidLabel(tournament, record, payoutFor(finish), entries);

  // Something to look at while it sinks in, the same way busting out gets one.
  // Seeded on the game and the place so it holds still rather than reshuffling
  // on every render, and a table with no Giphy key carries on without it.
  const [gifId, setGifId] = useState(null);
  const myFinish = mine?.finish ?? null;
  const outcome = outcomeOf({
    finishPosition: myFinish,
    inTheMoney: Boolean(myFinish && prizeLabel(myFinish, playerRecord(mine?.name))),
  });
  useEffect(() => {
    if (!giphyConfigured || !myFinish) return undefined;
    const controller = new AbortController();
    findOutcomeGif({
      outcome,
      seed: (tournament?.id || 0) * 89 + myFinish,
      signal: controller.signal,
    })
      .then(setGifId)
      // The result underneath is the result whether or not a picture arrives.
      .catch(() => {});
    return () => controller.abort();
  }, [outcome, tournament?.id, myFinish]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg panel rounded-xl p-6 shadow-2xl shadow-black/60">
        <p className="text-xs uppercase tracking-[0.2em] text-(--color-text-muted) text-center">
          {tournament?.name || "Tournament"} · complete
        </p>

        {/* Your own result first — it's the thing you actually want to know. */}
        {mine ? (
          <div className="text-center mt-3">
            <h1 className={`text-3xl font-bold ${iWon ? "text-(--color-highlight-text)" : "text-(--color-silver)"}`}>
              {iWon ? "🏆 You won" : `You finished ${ordinal(mine.finish)}`}
            </h1>
            <p className="text-(--color-text-muted) text-sm mt-1">
              of {entrants} entrants
              {myPayout && prizeLabel(mine.finish, myRecord) && (
                <span className="text-(--color-highlight-text)">
                  {` · ${prizeLabel(mine.finish, myRecord)}`}
                </span>
              )}
            </p>
          </div>
        ) : (
          <div className="text-center mt-3">
            <h1 className="text-3xl font-bold text-(--color-silver)">Tournament complete</h1>
            {winner && (
              <p className="text-(--color-highlight-text) text-sm mt-1">🏆 {winner.name} won</p>
            )}
          </div>
        )}

        {gifId && (
          <img
            src={gifPreviewUrl(gifId)}
            alt=""
            className="mt-4 w-full max-h-56 object-cover rounded-lg border border-(--color-border)"
          />
        )}

        <div className="grid grid-cols-3 gap-2 mt-5">
          {/* A Spin n Go was three players and one number nobody chose, so the
              number and what it paid are the result — an entrant count of three
              and a hand count say nothing about it. */}
          {spinGo ? (
            <>
              <Stat label="Multiplier" value={`${tournament?.spin_multiplier || 0}×`} />
              <Stat label="Prize" value={formatCoins(poolCoins(tournament, entries))} />
              <Stat label="Hands" value={handNumber || "—"} />
            </>
          ) : (
            <>
              <Stat label="Entrants" value={entrants} />
              <Stat label="Hands" value={handNumber || "—"} />
              {/* In a knockout tournament this is often the bigger half of the
                  night's result, so it replaces the final blinds rather than
                  being buried in the standings. */}
              {bountyOn && myRecord ? (
                <Stat
                  label={`Your KOs (${myRecord.knockouts || 0})`}
                  value={formatEuros(bountyPrize(myRecord))}
                />
              ) : (
                <Stat
                  label="Final blinds"
                  value={level ? `${level.small_blind}/${level.big_blind}` : "—"}
                />
              )}
            </>
          )}
        </div>

        <h2 className="text-xs uppercase tracking-wide text-(--color-text-muted) mt-6 mb-2">
          Final standings
        </h2>
        <ol className="panel-raised rounded-lg divide-y divide-[rgba(196,178,165,0.14)]">
          {rows.map((row) => {
            const isMe = row.username === username;
            const payout = payoutFor(row.finish);
            const record = playerRecord(row.name);
            return (
              <li
                key={`${row.finish}-${row.name}`}
                className={`px-4 py-2.5 flex items-center gap-3 ${isMe ? "bg-(--color-accent-soft)" : ""}`}
              >
                <span className={`font-mono text-sm w-6 shrink-0 ${
                  row.finish === 1 ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
                }`}>
                  {row.finish}
                </span>
                <span className={`flex-1 min-w-0 truncate ${
                  row.finish === 1 ? "text-(--color-highlight-text) font-semibold" : "text-(--color-silver)"
                }`}>
                  {row.finish === 1 && "🏆 "}{row.name}{isMe && " (you)"}
                </span>
                {/* One money figure per player: what they took home. Once
                    settled that already includes their knockouts, so the KO
                    line breaks it down rather than adding to it — two euro
                    amounts side by side read as a sum, and would be wrong. */}
                <span className="text-xs text-(--color-text-muted) shrink-0 text-right">
                  {(payout || record?.prize_cents > 0) && (
                    <span className="text-(--color-highlight-text)">{prizeLabel(row.finish, record)}</span>
                  )}
                  {bountyOn && bountyPrize(record) > 0 && (
                    <span>
                      {(payout || record?.prize_cents > 0) ? " " : ""}
                      {record?.prize_cents > 0
                        ? `(${record.knockouts || 0} KO, ${formatEuros(bountyPrize(record))} of it)`
                        : `${record.knockouts || 0} KO · ${formatEuros(bountyPrize(record))}`}
                    </span>
                  )}
                  {record?.rebuy_count > 0
                    && ` · ${record.rebuy_count} rebuy${record.rebuy_count === 1 ? "" : "s"}`}
                </span>
              </li>
            );
          })}
        </ol>

        {payouts.length === 0 && (
          <p className="text-xs text-(--color-text-muted) mt-2">
            No payout structure was configured for this tournament.
          </p>
        )}

        <div className="flex flex-wrap gap-3 mt-6">
          <button onClick={onLeave} className="btn-accent flex-1 px-4 py-2.5 rounded font-semibold transition-colors">
            Back home
          </button>
          {onViewTournament && (
            <button onClick={onViewTournament} className="btn-secondary px-4 py-2.5 rounded font-semibold transition-colors">
              Tournament lobby
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

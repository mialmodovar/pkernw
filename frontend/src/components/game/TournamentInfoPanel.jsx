import useGameStore from "../../store/gameStore";
import { formatChips } from "./formatChips";
import { formatEuros } from "./formatMoney";
import { entryCount, payoutLabel } from "./prizePool";
import { levelRemainingLabel, useLevelCountdown } from "./useLevelCountdown";

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-(--color-text-muted)">{label}</span>
      <span className="text-(--color-silver) text-right">{children}</span>
    </div>
  );
}

/**
 * Tournament context that would otherwise force you back to the lobby: the
 * blinds you're playing, what's coming next, how many players are left, your
 * standing and the payouts. `tournament` is the REST detail already fetched by
 * GamePage — its `levels`, `payout_structure` and `players` were all being
 * fetched and thrown away.
 *
 * Opened from the header rather than from a chip of its own on the felt. That
 * chip carried the level and the clock, both of which the blind bar an inch
 * above it was already showing, so it spent every hand covering a corner of the
 * table to repeat what was on screen anyway.
 */
export default function TournamentInfoPanel({ tournament, username, open, onClose }) {
  const level = useGameStore((s) => s.level);
  const levelRemaining = useLevelCountdown();
  const tableSummaries = useGameStore((s) => s.tableSummaries);
  const currentTableNumber = useGameStore((s) => s.currentTableNumber);
  const livePlayers = useGameStore((s) => s.players);
  const showBB = useGameStore((s) => s.showBB);
  const bb = level?.big_blind || 0;

  const levels = tournament?.levels || [];
  // level_index counts every level including breaks, so it indexes `levels`.
  const nextLevel = level?.level_index != null ? levels[level.level_index + 1] : null;

  // Prefer the live per-table counts; fall back to the REST snapshot.
  const remaining = tableSummaries.length
    ? tableSummaries.reduce((sum, t) => sum + (t.player_count || 0), 0)
    : (tournament?.players || []).filter((p) => !p.is_eliminated).length;

  const stacks = (tournament?.players || [])
    .filter((p) => !p.is_eliminated)
    .map((p) => ({ username: p.username, chips: p.chips }))
    .sort((a, b) => b.chips - a.chips);

  const myRank = stacks.findIndex((p) => p.username === username) + 1;
  const averageStack = stacks.length
    ? Math.round(stacks.reduce((sum, p) => sum + p.chips, 0) / stacks.length)
    : 0;

  const payouts = tournament?.payout_structure || [];
  const chipLeader = stacks[0] || null;

  // The bubble is the place just outside the money: bust here and you get
  // nothing, survive one more and you are paid.
  const paidPlaces = payouts.length;
  const inTheMoney = paidPlaces > 0 && remaining <= paidPlaces;
  const onTheBubble = paidPlaces > 0 && remaining === paidPlaces + 1;

  // Bust now and you finish where the last player standing after you would:
  // in the place equal to the number of players still in.
  const payoutFor = (place) => payouts.find((row) => row.place === place);
  const prizeNow = inTheMoney ? payoutFor(remaining) : null;
  const nextPrize = inTheMoney ? payoutFor(remaining - 1) : null;

  // Every rebuy is another buy-in — the same sum the settlement ledger makes.
  const entries = entryCount(tournament);
  // Money wherever there is money to state; the percentage only survives a
  // tournament with no buy-in, where the split is all there is to say.
  const withMoney = (row) => payoutLabel(tournament, row, entries);

  // Knockouts. The live table is the truthful source — it is updated the moment
  // a bounty changes hands — and the REST snapshot covers the case where your
  // own seat is not on the table being watched (eliminated, or spectating).
  const bountyMode = tournament?.bounty_mode || "none";
  const bountyOn = bountyMode !== "none" && (tournament?.bounty_cents || 0) > 0;
  const myLiveSeat = livePlayers.find((p) => p.username === username);
  const myRestSeat = (tournament?.players || []).find((p) => p.username === username);
  const myBountyWon = myLiveSeat?.bounty_won_cents ?? myRestSeat?.bounty_won_cents ?? 0;
  const myKnockouts = myLiveSeat?.knockouts ?? myRestSeat?.knockouts ?? 0;
  const myHead = myLiveSeat?.bounty_cents ?? myRestSeat?.bounty_cents ?? 0;
  // Every entry paid for one bounty, rebuys included — the same count the
  // settlement uses, so the pool shown here is the pool that gets paid.
  const bountyPoolCents = (tournament?.bounty_cents || 0) * entries;
  const biggestHead = bountyOn
    ? [...(tournament?.players || [])]
        .filter((p) => !p.is_eliminated)
        .sort((a, b) => (b.bounty_cents || 0) - (a.bounty_cents || 0))[0]
    : null;

  const levelClock = levelRemainingLabel(level, levelRemaining);

  // Under the button that opens it, on the side of the felt where the header's
  // tools are — a panel that opens across the table from its own button reads
  // as something that appeared rather than something you opened.
  const corner = "absolute top-1 left-1 md:top-2 md:left-2 z-10";

  if (!open) return null;

  return (
    <div className={`${corner} w-52 md:w-60 panel rounded-lg text-xs shadow-lg shadow-black/50
                     max-h-[85%] overflow-y-auto`}>
      {/* Double-click the header to collapse, the same gesture the floating
          panels use on their title bars. */}
      <div
        onDoubleClick={onClose}
        title="Double-click to collapse"
        className="flex items-center justify-between px-3 py-1.5 gap-2 text-[10px]
                   font-semibold uppercase tracking-wide text-(--color-silver) select-none cursor-pointer"
      >
        <span className="truncate">{tournament?.name || "Tournament"}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide tournament info"
          className="shrink-0 rounded px-1 text-sm leading-none text-(--color-text-muted)
                     hover:text-(--color-silver) transition-colors"
        >
          ×
        </button>
      </div>

      <div className="px-3 pb-3 space-y-2">
          <div className="space-y-1">
            <Row label={level?.is_break ? "Break" : "Blinds"}>
              {level ? `${level.small_blind}/${level.big_blind}${level.ante ? ` (${level.ante})` : ""}` : "—"}
            </Row>
            <Row label="Level ends">
              <span className="font-mono tabular-nums">{levelClock || "—"}</span>
            </Row>
            <Row label="Next level">
              {nextLevel
                ? nextLevel.is_break
                  ? `Break · ${nextLevel.duration_minutes} min`
                  : `${nextLevel.small_blind}/${nextLevel.big_blind}${nextLevel.ante ? ` (${nextLevel.ante})` : ""}`
                : "Last level"}
            </Row>
          </div>

          <div className="space-y-1 pt-2 border-t border-(--color-border)">
            <Row label="Players left">{remaining}</Row>
            <Row label="Avg stack">{formatChips(averageStack, showBB, bb)}</Row>
            {myRank > 0 && <Row label="Your rank">{`${myRank} of ${stacks.length}`}</Row>}
            {chipLeader && (
              <Row label="Chip leader">
                <span className={chipLeader.username === username ? "text-(--color-highlight-text)" : ""}>
                  {chipLeader.username} · {formatChips(chipLeader.chips, showBB, bb)}
                </span>
              </Row>
            )}
            {paidPlaces > 0 && (
              <Row label="Money">
                {inTheMoney ? (
                  <span className="text-(--color-highlight-text)">In the money</span>
                ) : onTheBubble ? (
                  <span className="text-[#c76b7a]">On the bubble</span>
                ) : (
                  <span>{paidPlaces} paid</span>
                )}
              </Row>
            )}
            {prizeNow && (
              <Row label="Your prize now">
                <span className="text-(--color-highlight-text)">{withMoney(prizeNow)}</span>
              </Row>
            )}
            {nextPrize && (
              <Row label="Next jump">
                <span className="text-(--color-highlight-text)">{withMoney(nextPrize)}</span>
                <span className="text-(--color-text-muted)">
                  {` · ${remaining - 1}${remaining - 1 === 1 ? "st" : remaining - 1 === 2 ? "nd" : remaining - 1 === 3 ? "rd" : "th"}`}
                </span>
              </Row>
            )}
          </div>

          {/* Knockouts. What you have already banked off other people's heads
              is the half of a bounty tournament the payout table never shows —
              you can be out of the money and still up on the night. */}
          {bountyOn && (
            <div className="pt-2 border-t border-(--color-border) space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">
                {bountyMode === "progressive" ? "Progressive KO" : "Knockouts"}
              </div>
              <Row label="KO winnings">
                <span className="text-(--color-highlight-text) font-semibold">{formatEuros(myBountyWon)}</span>
                <span className="text-(--color-text-muted)">
                  {` · ${myKnockouts} KO${myKnockouts === 1 ? "" : "s"}`}
                </span>
              </Row>
              {myHead > 0 && (
                <Row label="On your head">
                  <span className="text-(--color-highlight-text)">{formatEuros(myHead)}</span>
                  {bountyMode === "progressive" && myHead > (tournament?.bounty_cents || 0) && (
                    <span className="text-(--color-text-muted)">
                      {` · from ${formatEuros(tournament.bounty_cents)}`}
                    </span>
                  )}
                </Row>
              )}
              {biggestHead && (
                <Row label="Biggest bounty">
                  <span className={biggestHead.username === username ? "text-(--color-highlight-text)" : ""}>
                    {biggestHead.username} · {formatEuros(biggestHead.bounty_cents || 0)}
                  </span>
                </Row>
              )}
              <Row label="KO pool">{formatEuros(bountyPoolCents)}</Row>
              {bountyMode === "progressive" && (
                <p className="text-[10px] text-(--color-text-muted) leading-snug">
                  {`Knock someone out and ${tournament.bounty_progressive_split_pct}% of their bounty is yours to keep — the rest goes onto your own head.`}
                </p>
              )}
            </div>
          )}

          {/* Other tables. tableSummaries was already in the store and had
              never been rendered anywhere. */}
          {tableSummaries.length > 1 && (
            <div className="pt-2 border-t border-(--color-border) space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">
                Tables ({tableSummaries.length})
              </div>
              {tableSummaries.map((table) => {
                const isMine = table.table_number === currentTableNumber;
                return (
                  <Row key={table.table_number} label={`Table ${table.table_number}${isMine ? " (yours)" : ""}`}>
                    <span className={isMine ? "text-(--color-highlight-text)" : ""}>
                      {table.player_count}/{table.max_seats}
                    </span>
                  </Row>
                );
              })}
            </div>
          )}

          {payouts.length > 0 && (
            <div className="pt-2 border-t border-(--color-border) space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">Payouts</div>
              {payouts.slice(0, 5).map((row) => (
                <Row key={row.place} label={row.label || `${row.place}`}>
                  <span className="text-(--color-highlight-text)">{withMoney(row)}</span>
                </Row>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

import { useState } from "react";
import useGameStore from "../../store/gameStore";
import { formatChips } from "./formatChips";
import { formatClock, useLevelCountdown } from "./useLevelCountdown";

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
 */
export default function TournamentInfoPanel({ tournament, username }) {
  const [open, setOpen] = useState(false);
  const level = useGameStore((s) => s.level);
  const levelRemaining = useLevelCountdown();
  const tableSummaries = useGameStore((s) => s.tableSummaries);
  const currentTableNumber = useGameStore((s) => s.currentTableNumber);
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
  const poolCents = (tournament?.buy_in_cents || 0) * (tournament?.players || [])
    .reduce((sum, p) => sum + 1 + (p.rebuy_count || 0), 0);
  const money = (percentage) => (poolCents > 0
    ? (Math.round(poolCents * percentage) / 10000).toLocaleString(undefined,
        { style: "currency", currency: "EUR", maximumFractionDigits: 2 })
    : null);
  const withMoney = (row) => `${row.percentage}%${money(row.percentage) ? ` · ${money(row.percentage)}` : ""}`;

  // The blinds and the clock stay on screen whether or not the panel is open —
  // they are the two things you look up mid-hand without wanting to read a card.
  const levelLabel = level
    ? level.is_break
      ? "Break"
      : `L${level.blind_level_number || 1} · ${level.small_blind}/${level.big_blind}`
    : "—";
  const levelClock = levelRemaining != null
    ? formatClock(levelRemaining)
    : level?.duration_minutes != null ? `${level.duration_minutes}:00` : null;

  // Closed it is a single button: this is reference you want between hands, not
  // something worth a corner of the felt every hand.
  const corner = "absolute top-1 right-1 md:top-2 md:right-2 z-10";

  if (!open) {
    return (
      <div
        onDoubleClick={() => setOpen(true)}
        title="Double-click to open tournament info"
        className={`${corner} flex items-center gap-2 panel panel-floating rounded-full
                    py-1 pl-3 pr-1 shadow-lg shadow-black/50 select-none`}
      >
        <span className="text-[11px] font-semibold leading-none text-(--color-silver) whitespace-nowrap">
          {levelLabel}
        </span>
        {levelClock && (
          <span className="text-[11px] font-mono leading-none tabular-nums text-(--color-text-muted)">
            {levelClock}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Tournament info"
          aria-label="Show tournament info"
          className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                     font-serif italic font-bold text-sm leading-none text-(--color-silver)
                     hover:bg-white/10 transition-colors"
        >
          i
        </button>
      </div>
    );
  }

  return (
    <div className={`${corner} w-52 md:w-60 panel rounded-lg text-xs shadow-lg shadow-black/50
                     max-h-[85%] overflow-y-auto`}>
      {/* Double-click the header to collapse, the same gesture the floating
          panels use on their title bars. */}
      <div
        onDoubleClick={() => setOpen(false)}
        title="Double-click to collapse"
        className="flex items-center justify-between px-3 py-1.5 gap-2 text-[10px]
                   font-semibold uppercase tracking-wide text-(--color-silver) select-none cursor-pointer"
      >
        <span className="truncate">{tournament?.name || "Tournament"}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
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
                <span className={chipLeader.username === username ? "text-[#d9c07a]" : ""}>
                  {chipLeader.username} · {formatChips(chipLeader.chips, showBB, bb)}
                </span>
              </Row>
            )}
            {paidPlaces > 0 && (
              <Row label="Money">
                {inTheMoney ? (
                  <span className="text-[#d9c07a]">In the money</span>
                ) : onTheBubble ? (
                  <span className="text-[#c76b7a]">On the bubble</span>
                ) : (
                  <span>{paidPlaces} paid</span>
                )}
              </Row>
            )}
            {prizeNow && (
              <Row label="Your prize now">
                <span className="text-[#d9c07a]">{withMoney(prizeNow)}</span>
              </Row>
            )}
            {nextPrize && (
              <Row label="Next jump">
                <span className="text-[#d9c07a]">{withMoney(nextPrize)}</span>
                <span className="text-(--color-text-muted)">
                  {` · ${remaining - 1}${remaining - 1 === 1 ? "st" : remaining - 1 === 2 ? "nd" : remaining - 1 === 3 ? "rd" : "th"}`}
                </span>
              </Row>
            )}
          </div>

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
                    <span className={isMine ? "text-[#d9c07a]" : ""}>
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
                  <span className="text-[#d9c07a]">{row.percentage}%</span>
                </Row>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

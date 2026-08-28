import { useState } from "react";

import Icon from "../icons/Icon";
import useFastGameStore from "../../store/fastGameStore";
import { askOnce } from "../../api/notifications";
import useWalletStore from "../../store/walletStore";
import PlayerFaces from "./PlayerFaces";
import { drawLabel, historyNet, myResult, netLabel, winnerName } from "./fastHistory";
import {
  formatMeta, hasSharedPrizes, myGameAction, myQueueAt, myTablesAt, payoutRows, prizeRows,
  prizeSummary, seatCounts, seatPips, tierAction,
} from "./fastTiers";

// The server names the format; the drawing is ours. Both Sit n Go shapes are
// the same picture — two hands, front to front — because what tells them apart
// is the seat count printed beside it.
const FORMAT_ICONS = { spingo: "spin", hu: "duel", sixmax: "duel", allinfold: "shove" };

/**
 * The games you sit down at, for whichever tab is asking.
 *
 * One component for both tabs, because a Spin n Go and a Sit n Go are the same
 * card twice: a price, a seat count, and a button. What differs is what the card
 * promises — a draw or a set of places — and that comes off the format itself.
 *
 * `formatKeys` is which of them this tab shows. The store holds all of them
 * regardless, because a queue fills up whether or not you are looking at its tab.
 */
export default function FastGameBrowser({ formatKeys, onOpenTable }) {
  const { formats, myGames, history, top, loading, error, sit, leave, sitting } = useFastGameStore();
  const balance = useWalletStore((s) => s.balance);
  const [oddsOpen, setOddsOpen] = useState(null);

  // Sitting down, wherever the row it was pressed on. Lifted out of the row so
  // the row is layout and nothing else.
  const onSit = async (tier) => {
    // Asked here because here is the only moment it makes sense: a click, and
    // the one thing this app would ever interrupt somebody for is the game they
    // are sitting down at now. askOnce means a refusal is respected.
    askOnce();
    // Whoever fills the table is taken to it there and then. The others get
    // GameStartAlert, on the presence socket, wherever in the app they have got
    // to — and the lobby's own watch walks them in if they are still here.
    const game = await sit(tier.key, tier.stake);
    if (game?.status === "running") onOpenTable?.(game.id);
    return game;
  };

  const shown = formats.filter((one) => formatKeys.includes(one.key));
  // Your own games in these formats. The Sit n Go tab has no business listing
  // your Spin n Gos, and the other way round.
  const rows = history.filter((one) => formatKeys.includes(one.key));
  const board = top.filter((one) => formatKeys.includes(one.key));

  if (loading && !formats.length) {
    return <p className="text-(--color-text-muted)">Loading...</p>;
  }

  return (
    <div className="space-y-5">
      {shown.map((format) => (

        <section key={format.key} className="space-y-3">
          {/* The format, said properly and always — even on a tab that shows
              only one. What kind of game this is is the first thing anybody
              needs, and it used to be a small grey heading that the Spin n Go
              tab did not draw at all. */}
          <header className="flex items-start gap-3">
            <Icon name={FORMAT_ICONS[format.key] || "trophy"} className="w-8 h-8 shrink-0" tone="gold" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-(--color-silver) tracking-wide">
                {format.label}
              </h2>
              <p className="text-xs text-(--color-highlight-text) tabular-nums">
                {formatMeta(format)}
              </p>
              <p className="text-xs text-(--color-text-muted) leading-snug mt-1 max-w-prose">
                {format.blurb}
              </p>
            </div>
          </header>

          {/* A row per buy-in rather than a card per buy-in. There are seven of
              them now, and seven cards is a wall — a row says the same four
              things (what it costs, what it pays, how full it is, and the way
              in) in one line you can run your eye down. Everything else about
              the tier is behind the row, because it is what you read once and
              then never again. */}
          <TierList
            format={format}
            myGames={myGames}
            balance={balance}
            openKey={oddsOpen}
            onToggle={(key) => setOddsOpen(oddsOpen === key ? null : key)}
            onSit={onSit}
            onLeave={leave}
            onOpenTable={onOpenTable}
            sitting={sitting}
          />
        </section>
      ))}

      {error && <p className="text-xs text-[#c76b7a]">{error}</p>}

      {/* Underneath: what happened to you, and — where the prize is a draw —
          what the format is capable of. */}
      <div className={`grid gap-4 pt-2 ${board.length > 0 ? "md:grid-cols-2" : ""}`}>
        <HistoryPanel rows={rows} />
        {board.length > 0 && <RecordPanel rows={board} />}
      </div>
    </div>
  );
}

/**
 * Every buy-in a format offers, one row each.
 *
 * A list rather than a grid of cards, because the ladder is seven rungs long
 * and the thing being compared between them is a single number. Rows put those
 * numbers in a column you can run your eye down; cards put them in a wall you
 * have to read one at a time.
 *
 * One column at every width. Two was tried and is worse: the widest thing a row
 * has to say is a Spin n Go's prize range — "1,000 – 40,000" — and half a lobby
 * is not enough for it, so the number a player is choosing between got an
 * ellipsis. A row is cheap vertically; a truncated prize is not cheap at all.
 *
 * Each row fits a 320px screen without wrapping. The seat count spelled out and
 * the faces of the people already waiting are the parts that stand down as the
 * screen narrows, because they are the two things the row can also say with a
 * shape — the pips, which never go.
 */
function TierList({
  format, myGames, balance, openKey, onToggle, onSit, onLeave, onOpenTable, sitting,
}) {
  return (
    <div className="grid gap-2">
      {format.tiers.map((tier) => (
        <TierRow
          key={`${tier.key}:${tier.stake}`}
          tier={tier}
          format={format}
          myGames={myGames}
          balance={balance}
          open={openKey === `${tier.key}:${tier.stake}`}
          onToggle={() => onToggle(`${tier.key}:${tier.stake}`)}
          onSit={onSit}
          onLeave={onLeave}
          onOpenTable={onOpenTable}
          busy={sitting === `${tier.key}:${tier.stake}`}
        />
      ))}
    </div>
  );
}

/**
 * One buy-in: what it costs, what it pays, how full it is, and the way in.
 *
 * The four things in that order, left to right, because that is the order the
 * question is asked in — can I afford it, is it worth it, will it start, yes.
 */
function TierRow({
  tier, format, myGames, balance, open, onToggle, onSit, onLeave, onOpenTable, busy,
}) {
  // Your own seat at this tier, if you have one: the button is the way out of
  // it, and any game of yours here that is already dealing gets a row of its
  // own underneath.
  const queued = myQueueAt(tier, myGames);
  const playing = myTablesAt(tier, myGames);
  const action = tierAction(tier, { queued, balance });
  // The seats drawn are the ones you are waiting on. The tier itself reports
  // the queue you *could* join, which is a different game once you are in one.
  const shown = queued ? { ...tier, game: queued } : tier;
  const [seated, needed] = seatCounts(shown);
  const prize = prizeSummary(tier, format);
  const waiting = shown.game?.waiting || [];

  return (
    <div
      className={`panel-raised rounded-lg transition-colors ${
        queued
          ? "border-(--color-highlight-text)"
          : seated > 0 ? "border-(--color-border-strong)" : ""
      }`}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* What it costs. The widest thing on the ladder is 500, so the column
            is fixed and the prices line up down it. */}
        <span className="w-20 shrink-0 flex items-center gap-1.5 text-lg font-bold
                         text-(--color-silver) tabular-nums">
          <Icon name="coin" className="w-4 h-4 shrink-0" tone="gold" />
          {tier.stake}
        </span>

        {/* What it pays. Its own label, because a Spin n Go's range and a
            6-Max's two places are not the same promise. */}
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] uppercase tracking-wider
                           text-(--color-text-muted) leading-tight">
            {prize.label}
          </span>
          <span className="block truncate text-sm font-semibold
                           text-(--color-highlight-text) tabular-nums leading-tight">
            {prize.value}
          </span>
        </span>

        {/* How full it is. The pips are the part worth watching while you wait,
            so they survive every screen width; the count spelling them out and
            the faces of the people already sitting are what stand down. */}
        <span className="w-auto sm:w-28 shrink-0 flex items-center justify-end gap-2">
          <span className="flex gap-1" aria-hidden="true">
            {seatPips(shown).map((filled, index) => (
              <span
                key={index}
                className={`w-1.5 h-1.5 rounded-full ${
                  filled ? "bg-(--color-highlight-text)" : "bg-(--color-border-strong)"
                }`}
              />
            ))}
          </span>
          <span className="hidden sm:inline text-[11px] text-(--color-text-muted) tabular-nums">
            {seated}/{needed}
          </span>
          {waiting.length > 0 && (
            <span className="hidden md:block">
              <PlayerFaces players={waiting} size="w-5 h-5" />
            </span>
          )}
        </span>

        <span className="w-[6.5rem] shrink-0 flex items-center justify-end gap-1">
          <button
            type="button"
            disabled={!action.enabled || busy}
            title={action.note || undefined}
            onClick={() => (
              // Your own seat: the same button gives it back.
              action.kind === "unregister" ? onLeave(action.game.id) : onSit(tier)
            )}
            className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap
                        transition-colors ${
              action.enabled && !busy
                ? action.kind === "unregister" ? "btn-secondary" : "btn-accent"
                : "btn-secondary opacity-50 cursor-not-allowed"
            }`}
          >
            {busy ? "..." : action.label}
          </button>
          <button
            type="button"
            aria-expanded={open}
            aria-label={format.draws_multiplier
              ? `Every multiplier and its odds at ${tier.stake} coins`
              : `How the pot is split at ${tier.stake} coins`}
            onClick={onToggle}
            className="w-6 h-6 shrink-0 grid place-items-center rounded text-(--color-text-muted)
                       hover:text-(--color-silver) transition-colors"
          >
            <span
              aria-hidden="true"
              className={`text-[10px] leading-none transition-transform ${open ? "rotate-180" : ""}`}
            >
              ▼
            </span>
          </button>
        </span>
      </div>

      {/* Where you stand, when it is not simply "you could sit here": you are
          in this one, or you cannot afford it. Under the row rather than in it,
          because it is a sentence and the row is a set of columns. */}
      {action.note && (
        <p className={`px-3 pb-2 -mt-1 text-[11px] ${
          queued ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
        }`}>
          {queued && <Icon name="check" className="inline w-3 h-3 mr-1" />}
          {action.note}
        </p>
      )}

      {/* A game of yours at this tier that is already dealing. It does not hold
          the tier — you can be playing one and queued for the next — so it gets
          its own way back to the felt. */}
      {playing.map((game) => {
        const own = myGameAction(game);
        return (
          <div
            key={game.id}
            className="flex items-center gap-2 mx-3 py-2 border-t border-(--color-border)"
          >
            <span className="flex-1 min-w-0 truncate text-[11px]
                             text-(--color-highlight-text) tabular-nums">
              {own.note}
            </span>
            <button
              type="button"
              onClick={() => (own.kind === "leave" ? onLeave(game.id) : onOpenTable?.(game.id))}
              className={`px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap
                          transition-colors ${
                own.kind === "leave" ? "btn-secondary" : "btn-accent"
              }`}
            >
              {own.label}
            </button>
          </div>
        );
      })}

      {open && (
        // Held to a readable width rather than the row's. Three columns of
        // figures stretched across a desktop lobby are three columns nobody can
        // read across — the multiplier and its chance belong on the same line
        // as each other, not at opposite ends of the screen.
        <div className="px-3 pb-3 max-w-md">
          <TierPrizes tier={tier} drawn={format.draws_multiplier} />
        </div>
      )}
    </div>
  );
}

/** What a tier pays: a ladder of odds, or a list of places. */
function TierPrizes({ tier, drawn }) {
  if (drawn) {
    return (
      <div className="pt-2 border-t border-(--color-border) space-y-1">
        {prizeRows(tier).map((row) => (
          <div key={row.multiplier} className="flex items-baseline justify-between text-xs">
            <span className="text-(--color-silver) tabular-nums">
              {row.multiplier}×
              {/* The rows where busting out is not the same as getting nothing. */}
              {row.shared && (
                <span title="Pays all three seats: 80 / 12 / 8"
                  className="ml-1 text-[9px] uppercase tracking-wider text-(--color-highlight-text)">
                  all 3
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 text-(--color-highlight-text) tabular-nums">
              <Icon name="coin" className="w-3 h-3" />
              {row.prize.toLocaleString()}
            </span>
            <span className="text-(--color-text-muted) tabular-nums w-16 text-right">
              {row.chance}
            </span>
          </div>
        ))}
        <p className="text-[11px] text-(--color-text-muted) pt-1 leading-snug">
          Pays back more than it takes: three buy-ins in, 3.17 out on average.
          {hasSharedPrizes(tier)
            ? " The big ones pay every seat — the figure is the winner's share."
            : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="pt-2 border-t border-(--color-border) space-y-1">
      {payoutRows(tier).map((row) => (
        <div key={row.place} className="flex items-baseline justify-between text-xs">
          <span className="text-(--color-silver)">{row.label}</span>
          <span className="flex items-center gap-1 text-(--color-highlight-text) tabular-nums">
            <Icon name="coin" className="w-3 h-3" />
            {Number(row.coins || 0).toLocaleString()}
          </span>
          <span className="text-(--color-text-muted) tabular-nums w-16 text-right">
            {row.percentage}%
          </span>
        </div>
      ))}
      <p className="text-[11px] text-(--color-text-muted) pt-1 leading-snug">
        The buy-ins, split. Nothing is raked off.
      </p>
    </div>
  );
}

/** Your own last games, newest first, with what they came to. */
function HistoryPanel({ rows = [] }) {
  const net = historyNet(rows);
  return (
    <section className="panel-raised rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-(--color-silver) uppercase tracking-wide">
          Your last games
        </h2>
        {rows.length > 0 && (
          <span
            title={`Across the ${rows.length} games listed`}
            className={`text-xs font-semibold tabular-nums ${
              net > 0 ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
            }`}
          >
            {netLabel(net)}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-(--color-text-muted) mt-2">
          Nothing yet. Sit at a table above.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[rgba(196,178,165,0.12)]">
          {rows.map((row) => (
            <li key={row.id} className="py-1.5 flex items-center gap-2 text-xs">
              <span className={`w-10 shrink-0 font-semibold ${
                row.i_won ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
              }`}>
                {myResult(row)}
              </span>
              <span className="flex items-center gap-1 text-(--color-text-muted)
                               tabular-nums shrink-0">
                <Icon name="coin" className="w-3 h-3" />
                {row.stake}
              </span>
              <span className="flex-1 min-w-0 truncate text-(--color-silver) tabular-nums">
                {drawLabel(row)}
              </span>
              {/* Whoever took it, when it was not you. */}
              {!row.i_won && (
                <span className="text-(--color-text-muted) truncate max-w-[7rem]">
                  {winnerName(row)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The three biggest draws in the app, whoever had them. */
function RecordPanel({ rows = [] }) {
  const medals = ["medal-1", "medal-2", "medal-3"];
  return (
    <section className="panel-raised rounded-xl p-4">
      <h2 className="text-sm font-semibold text-(--color-silver) uppercase tracking-wide">
        Biggest spins
      </h2>

      <ol className="mt-2 divide-y divide-[rgba(196,178,165,0.12)]">
        {rows.map((row, index) => (
          <li key={row.id} className="py-1.5 flex items-center gap-2 text-xs">
            {medals[index]
              ? <Icon name={medals[index]} className="w-5 h-5" tone="gold" />
              : <span className="w-4 text-center shrink-0" aria-hidden="true">·</span>}
            <span className={`flex-1 min-w-0 truncate ${
              row.i_won ? "text-(--color-highlight-text) font-semibold" : "text-(--color-silver)"
            }`}>
              {winnerName(row)}{row.i_won && " (you)"}
            </span>
            <span className="text-(--color-highlight-text) font-semibold tabular-nums shrink-0">
              {row.multiplier}×
            </span>
            <span className="flex items-center justify-end gap-1 text-(--color-text-muted)
                             tabular-nums shrink-0 w-20">
              <Icon name="coin" className="w-3 h-3" />
              {Number(row.prize_coins || 0).toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

import { CARD_FACE, SUIT_COLOR, parseCard } from "./cardStyles";
import { Suit } from "./PlayingCard";
import { isInBestFive, namesBySeat, showdownOf, streetsOf, winningSeats } from "./handStreets";

const VERB = {
  fold: "folds", check: "checks", call: "calls",
  bet: "bets", raise: "raises to", blind: "posts", ante: "antes",
};

/**
 * One card, small enough to sit in a line of text.
 *
 * `lit` rings the cards that made somebody's hand, which is the difference
 * between reading a board and seeing why it mattered.
 */
export function MiniCard({ card, lit = false, size = "sm" }) {
  const parsed = parseCard(card);
  if (!parsed) return null;
  const box = size === "lg" ? "w-8 h-11 text-sm" : "w-6 h-8 text-[10px]";
  return (
    <span
      className={`inline-flex flex-col items-center justify-center rounded font-bold ${box} ${CARD_FACE} ${
        lit
          ? "ring-2 ring-(--color-highlight) shadow-[0_0_10px_var(--color-highlight-edge)]"
          : "opacity-80"
      }`}
      style={{ color: SUIT_COLOR[parsed.suit] || "#161616" }}
    >
      <span>{parsed.rank}</span>
      <Suit suit={parsed.suit} className={size === "lg" ? "w-3 h-3" : "w-2 h-2"} />
    </span>
  );
}

/**
 * A finished hand, replayed.
 *
 * The old rendering was one list of actions with three headings dropped into
 * it, which is fine for skimming the hand you have just played and useless for
 * reading one you have not — the board was drawn once at the top, so a bet on
 * the turn was a name and a number with no cards anywhere near it. Here each
 * street carries the board the players were actually looking at, and the cards
 * that street turned over are the lit ones.
 *
 * The showdown leads with whoever was paid rather than with whoever was
 * sitting nearest seat zero, and every card that made a hand is ringed.
 *
 * `heroSeat` is optional: it marks one player's line as yours, which is what
 * the lobby wants when it is showing you your own best hand.
 */
export default function HandReplay({ hand, heroSeat = null }) {
  const streets = streetsOf(hand);
  const winners = winningSeats(hand);
  const names = namesBySeat(hand);
  const showdown = showdownOf(hand);
  const nameFor = (seat) => (seat === heroSeat ? "You" : names.get(seat) ?? `Seat ${seat}`);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-(--color-silver)">
          Hand #{hand.hand_number}
        </span>
        <span className="text-xs font-semibold text-(--color-highlight-text)">
          Pot {hand.pot_total?.toLocaleString()}
        </span>
      </div>

      {/* The streets, in order, each under the board it was played on. */}
      <div className="space-y-2">
        {streets.map((group) => (
          <div key={group.street} className="panel-raised rounded-lg px-3 py-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#a8632c]">
                {group.label}
              </span>
              {group.board.length > 0 && (
                <span className="flex gap-1">
                  {group.board.map((card) => (
                    // Lit: the cards this street turned over. On the turn that
                    // is one card among four, which is the whole point.
                    <MiniCard key={card} card={card} lit={group.dealt.includes(card)} />
                  ))}
                </span>
              )}
            </div>

            {group.actions.length > 0 ? (
              <div className="mt-1.5 space-y-0.5 text-xs">
                {group.actions.map((action, index) => (
                  <div key={index} className="flex gap-1.5 text-(--color-text-muted)">
                    <span className={`shrink-0 ${
                      action.seat === heroSeat
                        ? "font-semibold text-(--color-highlight-text)"
                        : "text-(--color-silver)"
                    }`}>
                      {nameFor(action.seat)}
                    </span>
                    <span>
                      {VERB[action.action] || action.action}
                      {action.amount ? ` ${action.amount.toLocaleString()}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              // Everybody was already all in, so the cards simply came out.
              <p className="mt-1 text-[11px] italic text-(--color-text-muted)">Run out — nobody left to act.</p>
            )}
          </div>
        ))}
      </div>

      {showdown.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-muted)">
            Showdown
          </div>
          {showdown.map((entry) => (
            <div
              key={entry.seat}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${
                winners.has(entry.seat)
                  ? "bg-(--color-highlight-dim) border border-(--color-highlight-edge)"
                  : "panel-raised"
              }`}
            >
              <span className={`text-xs w-16 truncate shrink-0 ${
                entry.seat === heroSeat
                  ? "font-bold text-(--color-highlight-text)"
                  : "text-(--color-silver)"
              }`}>
                {nameFor(entry.seat)}
              </span>
              <span className="flex gap-1 shrink-0">
                {(entry.cards || []).map((card) => (
                  <MiniCard key={card} card={card} lit={isInBestFive(entry, card)} />
                ))}
              </span>
              <span className={`text-xs truncate ml-auto text-right ${
                winners.has(entry.seat) ? "text-(--color-highlight-text) font-semibold" : "text-(--color-text-muted)"
              }`}>
                {entry.hand_name}
              </span>
            </div>
          ))}
        </div>
      )}

      {(hand.result?.awards || []).length > 0 && (
        <div className="space-y-0.5 text-xs">
          {hand.result.awards.map((award, index) => (
            <div key={index} className="text-(--color-highlight-text) font-semibold">
              {nameFor(award.seat)} wins {award.amount?.toLocaleString()}
              <span className="font-normal text-(--color-text-muted)"> ({award.description})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

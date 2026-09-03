import { useEffect, useRef, useState } from "react";

import Avatar from "../Avatar";
import Icon from "../icons/Icon";
import PlayingCard, { CardBack } from "./PlayingCard";
import Chip, { ChipFan } from "./Chip";
import useBlackjackTableStore, { POLL_MS } from "../../store/blackjackTableStore";
import useWalletStore from "../../store/walletStore";
import { playBlackjack, playBust, playCard, playChips, playPush, playWin } from "./sounds";
import { chipsFor, handLabel, handTotal, outcomeLine } from "./blackjack";
import {
  FLIP_MS, PLAN_MOVES, REVEAL_MS, betCeiling, betLimits, betSteps, canBet, canJoin, canPlan,
  cardOverlap, dealDelay, dealerTableLine, drawDelay, myPlan, mySeat, occupancy,
  revealDelay, settlementLine,
  bettingPct, phaseLine, players, seatState, tableActions, turnPct,
} from "./sharedBlackjack";

/**
 * Eight seats, one dealer, everybody dealt at once.
 *
 * The solo game next door is a hand you play in a gap. This is a room: you take
 * a chair, the clock goes round whether or not you bet, and the cards that come
 * out are the same cards everybody else is looking at. What makes it worth
 * having is not the blackjack — that is identical — it is that somebody else
 * busting is something you watched happen.
 *
 * Everybody acts at the same time rather than in seat order. That is a real
 * departure from a casino floor and it is the decision that makes the table
 * playable: seat order would mean one player looking at their phone freezes
 * seven other people, and the fix for that is a per-seat clock nobody enjoys.
 * One window, everyone in it, and whoever has not acted when it closes stands.
 *
 * The felt shows the table. Your own hand is drawn again underneath it, large,
 * with the buttons — because the thing you are deciding about should not be one
 * of eight small tiles, and on a phone the tiles are small indeed.
 */
export default function SharedBlackjackTable() {
  const {
    table, error, busy, settledRound, fetch, join, leave, bet, act, plan,
    markSettled, clearError,
  } = useBlackjackTableStore();
  const balance = useWalletStore((s) => s.balance);
  const fetchWallet = useWalletStore((s) => s.fetchWallet);
  const [pending, setPending] = useState(0);

  useEffect(() => { if (balance == null) fetchWallet(); }, [balance, fetchWallet]);

  // The poll is also what drives the table: the server advances the phase on
  // whatever request reaches it, so a table with somebody watching is a table
  // whose clock is running.
  useEffect(() => {
    fetch({ silent: false });
    const timer = setInterval(() => fetch(), POLL_MS);
    return () => clearInterval(timer);
  }, [fetch]);

  useTableSounds(table, settledRound, markSettled);

  const phase = phaseLine(table);
  const betClock = bettingPct(table);
  const seat = mySeat(table);
  const seated = players(table);
  const entry = canJoin(table, balance);
  // The bet being built. Cleared once it is placed, and again whenever a new
  // round comes round, so last round's stack is not sitting on the felt.
  useEffect(() => { setPending(0); }, [table?.round]);

  if (!table) {
    return <p className="text-(--color-text-muted) text-sm">Finding the table...</p>;
  }

  return (
    <div className="space-y-3">
      {/* What the table is doing and how long it has to do it in, and how full
          it is. Only once you are in it: every one of those is a deadline or a
          count for somebody playing, and to somebody still deciding whether to
          sit down they are three numbers about a game they are not in. What
          that person needs is the felt and the Join button, and both are below.
          The one line that has to be right for everybody else: everything a
          player can press is decided by it. */}
      {seat && (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="text-sm font-bold text-(--color-silver)">{phase.label}</span>
              <span className="text-xs text-(--color-highlight-text) tabular-nums">
                {phase.detail}
              </span>
            </span>
            <span className="text-[11px] text-(--color-text-muted) tabular-nums shrink-0">
              {occupancy(table)}
            </span>
          </div>

          {/* The betting window, drawn as well as counted. The seconds are
              already in the line above; this is the same clock for the part of
              the eye that does not read. Only while there is something to do
              about it — a bar over the dealer playing is a deadline for a
              decision nobody has. */}
          {betClock != null && (
            <div className="h-1 rounded-full bg-black/40 overflow-hidden -mt-1.5"
              role="progressbar" aria-label="Time left to bet">
              <div
                className="h-full rounded-full bg-(--color-highlight-bright)
                           transition-[width] duration-1000 ease-linear"
                style={{ width: `${betClock}%` }}
              />
            </div>
          )}
        </>
      )}

      {/* Oxblood and gold in the high room, the house green in the low one. The
          minimum in there is this room's whole ceiling, so the two must not be
          mistakable for one another at a glance. */}
      <div className={`@container felt rounded-2xl px-3 py-4 sm:px-5 space-y-4 ${
        table.room?.high ? "felt-high" : ""
      }`}>
        <DealerSide table={table} seats={seated.length} />

        {/* The people who are here, and only them. A row rather than a grid of
            chairs: nobody picks a seat any more, so an empty one is not an
            offer, it is a hole. Each tile takes an equal share of the felt
            between a floor and a ceiling, so two players get a wide comfortable
            hand each and six still fit — and the row wraps rather than
            squeezing past the point a hand can be read. */}
        {seated.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-2">
            {seated.map((one, index) => (
              <SeatTile
                key={one.seat}
                seat={one}
                table={table}
                position={index}
                seats={seated.length}
                className="flex-1 basis-[7.5rem] min-w-[7.5rem] max-w-[13rem]"
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-xs text-(--color-text-muted) py-6">
            Nobody is playing. The table deals as soon as somebody bets.
          </p>
        )}
      </div>

      {error && (
        <p className="text-xs text-[#c76b7a] text-center" role="alert" onClick={clearError}>
          {error}
        </p>
      )}

      {seat ? (
        <YourSeat
          table={table}
          seat={seat}
          balance={balance}
          busy={busy}
          pending={pending}
          setPending={setPending}
          onBet={() => bet(pending)}
          onAct={act}
          onPlan={plan}
          onLeave={leave}
        />
      ) : (
        <div className="space-y-1.5">
          {/* One button, because there is one thing to decide. Picking a chair
              was a choice with nothing behind it — see blackjacktable.join. */}
          <button
            type="button"
            disabled={!entry.allowed || busy === "join"}
            onClick={join}
            className={`w-full py-2.5 rounded font-bold text-sm transition-colors ${
              entry.allowed && busy !== "join"
                ? "btn-accent" : "btn-secondary opacity-50 cursor-not-allowed"
            }`}
          >
            {busy === "join" ? "Joining..." : entry.allowed ? "Join the game" : entry.reason}
          </button>
          <p className="text-[11px] text-(--color-text-muted) text-center">
            The table deals whether or not you are in it.
          </p>
        </div>
      )}
    </div>
  );
}

// The two actions that take a second stake out of the wallet. They get the
// accent so that "this one costs more" is carried by the colour as well as by
// the line under the word.
const SPENDS = ["double", "split"];

/**
 * Whether the dealer's hand has finished arriving on screen.
 *
 * True at once for every phase but settling — before that there is nothing to
 * hold back, and the line is already only saying what is face up. At settling
 * it waits out the turn and the draws, and it is keyed on the round so the next
 * one starts hidden again rather than inheriting this one's answer.
 */
function useDealerReveal(table, count) {
  const settling = table?.phase === "settling";
  const round = table?.round;
  const [done, setDone] = useState(!settling);

  useEffect(() => {
    if (!settling) {
      setDone(true);
      return undefined;
    }
    setDone(false);
    const timer = setTimeout(() => setDone(true), revealDelay(count));
    return () => clearTimeout(timer);
  }, [settling, round, count]);

  return done;
}

/** The dealer, and how much of their hand anybody is allowed to know yet. */
function DealerSide({ table, seats }) {
  const cards = table.dealer?.cards || [];
  // The payload's total is the settled one and it arrives in the same response
  // that turns the hole card over, so printing it straight away prints the
  // answer over a card still face down. `revealed` is dealerTableLine's own way
  // of saying "not yet" — it has been there all along and was never passed.
  const revealed = useDealerReveal(table, cards.length);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-baseline gap-2 min-h-[1.1rem]">
        <span className="text-[10px] uppercase tracking-wider text-(--color-text-muted)">
          Dealer
        </span>
        <span className="text-xs font-semibold text-(--color-silver) tabular-nums">
          {dealerTableLine(table, revealed)}
        </span>
      </div>
      <div className="flex gap-1.5 min-h-[3.4rem] items-start">
        {cards.length === 0 && <EmptySlot />}
        {cards.map((card, index) => (
          // Keyed on the round and the slot rather than on the card, so the
          // hole card's node survives being turned over: keyed on the card it
          // would unmount as "??" and remount as a nine, and fly in from the
          // shoe a second time instead of flipping where it lies. A new round
          // changes the key and everything deals again.
          <span
            key={`${table.round}-${index}`}
            className="animate-bj-deal"
            style={{
              animationDelay: index < 2
                ? `${dealDelay({ card: index, seats, dealer: true })}ms`
                // The house drawing itself out at the end, one card at a time
                // with the whole table watching. Its own clock — these arrive
                // when the round settles, which is not when the deal happened.
                : `${drawDelay(index)}ms`,
            }}
          >
            {card === "??" ? (
              <CardBack size="hand" />
            ) : index === 1 ? (
              // The hole card, turning over. The back is still there and still
              // has to get out of the way: it squashes to nothing and the face
              // opens out from nothing behind it, half a turn later. Showing
              // the face and then animating it is what this did before, and
              // what that looks like is the card being revealed and then
              // wobbling.
              <span className="relative block">
                <span className="block animate-bj-turn-in"
                  style={{ animationDelay: `${REVEAL_MS + FLIP_MS / 2}ms` }}>
                  <PlayingCard card={card} size="hand" />
                </span>
                <span className="absolute inset-0 animate-bj-turn-out"
                  style={{ animationDelay: `${REVEAL_MS}ms` }} aria-hidden="true">
                  <CardBack size="hand" />
                </span>
              </span>
            ) : (
              <PlayingCard card={card} size="hand" />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * One chair.
 *
 * Small on purpose: eight of these have to fit, and what a player needs off
 * somebody else's seat is who they are, what they put up and how it went — not
 * a readable hand. Their cards are here anyway, at seat size, because watching
 * the person next to you draw to sixteen is the entire reason to sit at a table
 * rather than play alone.
 */
function SeatTile({ seat, table, position = 0, seats = 1, className = "" }) {
  const state = seatState(seat, table);
  // The clock over whoever is being asked. Only theirs: it is one seat's turn
  // and one seat's deadline, and a bar over every chair would read as the
  // table's.
  const left = state.turn ? turnPct(table) : null;
  const hand = seat.hands?.[0] || null;
  const cards = hand?.cards || [];
  // Past two cards the hand is fanned rather than laid out, or a seat that drew
  // twice runs into the one beside it. See cardOverlap.
  const overlap = cardOverlap(cards.length);

  return (
    <div
      // Lit while the table is waiting on it. The turn is the one thing on this
      // screen that everybody has to be able to find at a glance, so it beats
      // "this one is mine" for the border — you already know which seat is
      // yours, and the ring says it too.
      className={`${className} rounded-lg px-2 py-2 min-h-[5.5rem] flex flex-col
                  items-center gap-1 border transition-colors ${
        state.turn
          ? "border-(--color-highlight-text) bg-(--color-highlight-dim) ring-2 ring-(--color-highlight-edge)"
          : state.mine
            ? "border-(--color-highlight-text) bg-black/30"
            : "border-(--color-border) bg-black/20"
      } ${state.won ? "animate-bj-win" : ""} ${state.bust ? "animate-bj-bust" : ""}`}
    >
      {/* How long they have. Drawn over the seat rather than beside the heading
          because the question it answers — "is this going to be my turn soon" —
          is asked about a person, and the countdown in the heading is a number
          you have to read. Transitioned, because the table is polled once a
          second and a bar that jumped a tenth at a time would read as a stutter
          rather than as time passing. */}
      <div className="w-full h-1 rounded-full bg-black/40 overflow-hidden"
        role="progressbar" aria-label="Time left on this turn">
        {left != null && (
          <div
            className="h-full rounded-full bg-(--color-highlight-bright)
                       transition-[width] duration-1000 ease-linear"
            style={{ width: `${left}%` }}
          />
        )}
      </div>

      <div className="flex items-center gap-1 min-w-0 w-full">
        <span className="w-5 h-5 shrink-0 rounded-full overflow-hidden">
          <Avatar
            url={seat.player?.avatar_url}
            emoji={seat.player?.avatar_emoji}
            border={seat.player?.avatar_border}
            name={seat.player?.display_name || seat.player?.username}
            className="w-full h-full"
            emojiClassName="text-[0.7rem]"
          />
        </span>
        <span className="text-[10px] truncate text-(--color-silver) min-w-0">
          {state.mine ? "You" : (seat.player?.display_name || seat.player?.username)}
        </span>
      </div>

      <div className="flex min-h-[2rem] items-start justify-center">
        {cards.map((card, index) => (
          <span
            key={`${table.round}-${index}`}
            className="animate-bj-deal shrink-0"
            style={{
              // Round the table, on the same beat the server dealt: one card to
              // everybody, the house's own, a second to everybody. Every seat's
              // cards used to land at the same instant.
              animationDelay: `${dealDelay({ card: index, position, seats })}ms`,
              // A share of one card's width, which is the clamp PlayingCard
              // gives size="seat" — kept in step with it by hand, because a
              // Tailwind class has to be a literal string for the scanner to
              // find it and cannot be built out of a shared constant.
              marginLeft: index === 0
                ? undefined
                : `calc(-${overlap} * clamp(1.52rem,4.97cqw,3.31rem))`,
              // Later cards over earlier ones, so the fan opens to the right
              // and every rank stays readable.
              zIndex: index,
            }}
          >
            <PlayingCard card={card} size="seat" />
          </span>
        ))}
      </div>

      <span className="text-[10px] tabular-nums text-(--color-text-muted) min-h-[0.9rem]">
        {state.label}
      </span>

      {seat.bet > 0 && (
        <span className="flex items-center gap-1">
          <ChipFan chips={chipsFor(seat.bet)} size={13} max={3} />
          <span className="text-[10px] tabular-nums text-(--color-text-muted)">{seat.bet}</span>
        </span>
      )}
    </div>
  );
}

/**
 * Your own seat, drawn again and drawn large.
 *
 * Everything above is the table; this is the decision. It changes with the
 * phase — chips while the betting window is open, buttons while it is your hand
 * to play, what it came to while the dealer settles — and it keeps its place on
 * the screen through all three, so a thumb already moving towards Stand does not
 * find Deal underneath it.
 */
function YourSeat({
  table, seat, balance, busy, pending, setPending, onBet, onAct, onPlan, onLeave,
}) {
  // Where this seat sits in the row of players, so the big copy of your hand
  // deals on the same beat as the small one on the felt above it.
  const row = players(table);
  const seats = row.length || 1;
  const seatPosition = Math.max(0, row.findIndex((one) => one.seat === seat.seat));
  const hand = seat.hands?.[0] || null;
  const betting = table.phase === "betting";
  const placed = seat.bet > 0;
  const check = canBet(table, pending, balance);
  const limits = betLimits(table);
  const ceiling = betCeiling(table, balance) ?? limits.min;
  const steps = betSteps(table, balance);
  const result = settlementLine(table);
  const buttons = tableActions(table);
  // Somebody else is being asked, and you are still in the round: the buttons
  // would all be dead, so they are replaced by the promise of them.
  const planning = canPlan(table);
  const planned = myPlan(table);

  return (
    <div className="panel-raised rounded-xl p-3 space-y-3">
      {/* Your hand, at the size the thing you are deciding about deserves. */}
      {(seat.hands || []).map((one, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {one.cards.map((card, i) => (
              <span key={`${table.round}-${index}-${i}`} className="animate-bj-deal"
                style={{ animationDelay: `${dealDelay({ card: i, position: seatPosition, seats })}ms` }}>
                <PlayingCard card={card} size="hand" />
              </span>
            ))}
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold text-(--color-silver) tabular-nums">
              {handTotal(one)}
            </div>
            {handLabel(one) && (
              <div className={`text-[10px] font-bold uppercase tracking-wider ${
                handLabel(one) === "Bust" ? "text-[#c76b7a]"
                  : handLabel(one) === "Blackjack" ? "text-(--color-highlight-text)"
                  : "text-(--color-text-muted)"
              }`}>
                {handLabel(one)}
              </div>
            )}
            {one.outcome && (
              <div className="text-xs font-bold tabular-nums animate-bj-payout
                              text-(--color-highlight-text)">
                {outcomeLine(one)}
              </div>
            )}
          </div>
        </div>
      ))}

      {betting && !placed && (
        <div className="space-y-2.5">
          {/* The figure first and big. It used to be readable only off the Bet
              button, which is the one thing on this panel that moves. */}
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-(--color-text-muted)">
              Your bet
            </span>
            <span className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-xl font-bold tabular-nums text-(--color-highlight-text)">
                {pending.toLocaleString()}
              </span>
              <span className="text-[10px] text-(--color-text-muted) tabular-nums">
                of {ceiling.toLocaleString()}
              </span>
            </span>
          </div>

          {/* A slider, because the chips can only ever offer a few figures and
              the high room runs from five hundred to whatever is in the wallet.
              Steps of the room's own minimum, so every position it can stop on
              is a bet the table will take. */}
          <input
            type="range"
            min={0}
            max={ceiling}
            step={limits.min}
            value={Math.min(pending, ceiling)}
            onChange={(event) => setPending(Number(event.target.value))}
            aria-label="Bet amount"
            className="w-full h-11 accent-(--color-highlight-bright) cursor-pointer
                       touch-manipulation"
          />

          <div className="flex items-center justify-center gap-2 sm:gap-3">
            {steps.map((value) => {
              const next = canBet(table, pending + value, balance);
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!next.allowed}
                  onClick={() => { setPending(pending + value); playChips(); }}
                  aria-label={`Add ${value.toLocaleString()} to the bet`}
                  title={`Add ${value.toLocaleString()}`}
                  className={`rounded-full transition-transform ${
                    next.allowed ? "hover:scale-110 active:scale-95" : "opacity-30 cursor-not-allowed"
                  }`}
                >
                  <Chip value={value} size={48} />
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending === 0}
              onClick={() => setPending(0)}
              className={`px-3 min-h-11 rounded text-xs font-semibold btn-secondary ${
                pending === 0 ? "opacity-40 cursor-not-allowed" : ""
              }`}
            >
              Clear
            </button>
            <button
              type="button"
              disabled={ceiling <= 0}
              onClick={() => setPending(ceiling)}
              className={`px-3 min-h-11 rounded text-xs font-semibold btn-secondary ${
                ceiling <= 0 ? "opacity-40 cursor-not-allowed" : ""
              }`}
            >
              Max
            </button>
            <button
              type="button"
              disabled={!check.allowed || busy === "bet"}
              onClick={onBet}
              className={`flex-1 min-h-11 rounded font-bold text-sm transition-colors ${
                check.allowed && busy !== "bet"
                  ? "btn-accent" : "btn-secondary opacity-50 cursor-not-allowed"
              }`}
            >
              {busy === "bet" ? "Placing..." : check.allowed
                ? `Deal me in for ${pending.toLocaleString()}`
                : check.reason || "Place a bet"}
            </button>
          </div>
        </div>
      )}

      {betting && placed && (
        <p className="text-xs text-center text-(--color-highlight-text)">
          <Icon name="check" className="inline w-3 h-3 mr-1" />
          {seat.bet.toLocaleString()} in. Waiting for the deal.
        </p>
      )}

      {planning && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-center text-(--color-text-muted)">
            Not your turn yet — choose now and it plays itself when it is.
          </p>
          {/* Stand and Hit only. Both are legal for any hand still being
              played, so neither can turn out to be a promise the table cannot
              keep; Double and Split want a look at the cards, which is what
              the turn is for. See PLAN_MOVES. */}
          <div className="grid grid-cols-2 gap-2">
            {PLAN_MOVES.map((move) => {
              const armed = planned === move.key;
              return (
                <button
                  key={move.key}
                  type="button"
                  aria-pressed={armed}
                  disabled={Boolean(busy)}
                  // Pressing the armed one puts the decision back: a plan is a
                  // convenience and must never be a thing you cannot undo.
                  onClick={() => onPlan(armed ? "" : move.key)}
                  className={`py-2.5 rounded font-bold text-sm transition-colors border ${
                    armed
                      ? "border-(--color-highlight-edge) bg-(--color-highlight-dim) text-(--color-highlight-text)"
                      : "border-(--color-border) btn-secondary"
                  } ${busy ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {armed ? `${move.label} \u2713` : move.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {result && (
        // The per-hand outcome is beside each hand already, at the size a
        // footnote deserves. This is the one number somebody actually wants
        // when the cards stop, at the size that answers it from across a room.
        <div className={`rounded-lg px-3 py-2 text-center animate-bj-payout ${
          result.tone === "win"
            ? "bg-(--color-highlight-dim) border border-(--color-highlight-edge)"
            : "panel-raised border border-(--color-border)"
        }`}>
          <span className={`block text-lg font-bold tabular-nums ${
            result.tone === "win"
              ? "text-(--color-highlight-text)"
              : result.tone === "loss" ? "text-[#c76b7a]" : "text-(--color-silver)"
          }`}>
            {result.label}
          </span>
        </div>
      )}

      {table.phase === "playing" && hand && !planning && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {buttons.map((button) => (
            <button
              key={button.key}
              type="button"
              disabled={!button.enabled || Boolean(busy)}
              onClick={() => onAct(button.key)}
              // The word, and under it what it does to this hand. Four bare
              // verbs assume the reader already plays — and the two that take
              // a second stake off the wallet looked exactly like the two that
              // do not, which is the confusion worth paying a line for.
              // Gold for the two that spend, so they read as the bigger ones.
              className={`min-h-14 px-2 py-2 rounded font-bold text-sm leading-tight
                          flex flex-col items-center justify-center gap-0.5
                          transition-colors ${
                button.enabled && !busy
                  ? SPENDS.includes(button.key)
                    ? "btn-accent" : "btn-secondary border border-(--color-border-strong)"
                  : "btn-secondary opacity-35 cursor-not-allowed"
              }`}
            >
              {busy === button.key ? "..." : (
                <>
                  <span>{button.label}</span>
                  {button.note && (
                    <span className="text-[9px] font-semibold uppercase tracking-wide opacity-70">
                      {button.note}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onLeave}
        disabled={busy === "leave"}
        className="w-full text-[11px] text-(--color-text-muted) hover:text-(--color-silver)
                   transition-colors"
      >
        Leave the table
      </button>
    </div>
  );
}

function EmptySlot() {
  return (
    <span className="w-11 h-16 rounded border border-dashed border-(--color-border-strong)
                     opacity-40" aria-hidden="true" />
  );
}

/**
 * The sounds, once per round rather than once per poll.
 *
 * The settling window is six seconds and the table is asked about it six times
 * over. Without the round number to compare against, a win would chime six
 * times — which is the sort of thing that gets a tab muted.
 */
function useTableSounds(table, settledRound, markSettled) {
  const lastCards = useRef(0);
  const round = table?.round ?? 0;

  useEffect(() => {
    const seats = table?.seats || [];
    const dealt = seats.reduce(
      (sum, seat) => sum + (seat.hands || []).reduce((n, hand) => n + hand.cards.length, 0),
      0,
    ) + (table?.dealer?.cards?.length || 0);
    if (dealt > lastCards.current) playCard();
    lastCards.current = dealt;
  }, [table]);

  useEffect(() => {
    if (table?.phase !== "settling" || round === settledRound) return;
    markSettled(round);
    const mine = mySeat(table);
    if (!mine) return;
    const hands = mine.hands || [];
    if (!hands.length) return;

    // Held until the cards have finished arriving, for the same reason the
    // dealer's total is — and more so. A win chime over a hole card still face
    // down does not merely give the answer away, it gives it away before the
    // player has had a chance to look, and there is no unhearing it.
    const wait = revealDelay(table?.dealer?.cards?.length || 2);
    const timer = setTimeout(() => {
      if (hands.some((one) => one.outcome === "blackjack")) playBlackjack();
      else if (hands.some((one) => one.outcome === "win")) playWin();
      else if (hands.every((one) => one.outcome === "push")) playPush();
      else playBust();
    }, wait);
    return () => clearTimeout(timer);
  }, [table, round, settledRound, markSettled]);
}

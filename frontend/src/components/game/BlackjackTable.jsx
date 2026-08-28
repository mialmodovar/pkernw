import { useEffect, useMemo, useRef, useState } from "react";

import Icon from "../icons/Icon";
import PlayingCard, { CardBack } from "./PlayingCard";
import Chip, { ChipFan, ChipStack } from "./Chip";
import useBlackjackStore from "../../store/blackjackStore";
import useWalletStore from "../../store/walletStore";
import { playBlackjack, playBust, playCard, playChips, playPush, playWin } from "./sounds";
import {
  actionButtons, bettingState, chipsFor, dealerLine, handLabel, handTotal, historyMark,
  outcomeLine, roundSummary,
} from "./blackjack";

// How long the dealer waits between turning over each of their own cards.
//
// The server answers a Stand with the whole finished round — the dealer's draw
// has already happened, and the result is sitting in the reply. Drawing it all
// at once is correct and it is also the least interesting thing that could
// happen: the entire tension of blackjack is watching a dealer on 16 reach for
// one more card. So the cards are held back and let out one at a time, which
// costs a second and is most of what makes this feel like a game rather than a
// verdict.
const DEALER_BEAT_MS = 520;

/**
 * Blackjack, against the house, in coins.
 *
 * The one game here played against nobody. A poker table has five other people
 * supplying the drama; this has a dealer and whatever the screen does, so it
 * moves more than anything else in the app — cards land, chips drop, a hand
 * that wins glows and a hand that busts shakes.
 *
 * Two places draw this: the Casino tab, and the panel at a poker table once you
 * have folded. `compact` is the second of them, where it sits over a felt
 * somebody is also reading. The round itself is the same round either way; see
 * store/blackjackStore.js.
 *
 * Nothing here decides anything about a hand. The totals, what is legal and who
 * won all come off the server — this file's whole job is to draw them and to
 * make the drawing worth watching.
 */
export default function BlackjackTable({ compact = false, onClose = null }) {
  const { round, history, busy, error, settledAt, resume, deal, act, clear } = useBlackjackStore();
  const balance = useWalletStore((s) => s.balance);
  const fetchWallet = useWalletStore((s) => s.fetchWallet);
  const games = useWalletStore((s) => s.games);
  const [bet, setBet] = useState(0);

  const game = games.find((one) => one.id === "blackjack");

  // The table is often the first thing opened in a session, so the balance and
  // the stake limits have to be asked for here rather than assumed to have
  // arrived from the lobby.
  useEffect(() => { if (balance == null) fetchWallet(); }, [balance, fetchWallet]);
  // An unfinished hand you walked away from. Asked for once, on arrival: the
  // round lives on the server precisely so that closing the tab on a bad hand
  // is not a way out of it.
  useEffect(() => { resume(); }, [resume]);

  const revealed = useDealerReveal(round);
  useRoundSounds(round, settledAt, revealed);

  const finished = round?.status === "finished";
  const summary = finished ? roundSummary(round) : null;

  // Once the dealer has finished turning cards over, the felt is offering the
  // next hand rather than reporting the last one — so the bet from the hand
  // just played is put back up, which is what a player wants nine times in ten.
  const playAgain = () => {
    setBet(round?.stake || 0);
    clear();
  };

  return (
    <div className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`}>
      <Felt compact={compact}>
        <DealerSide round={round} revealed={revealed} compact={compact} />

        <PlayerSide
          round={round}
          bet={bet}
          compact={compact}
          dealerDone={revealed.done}
        />
      </Felt>

      {/* Under the felt: the bet, or the buttons, or what just happened. One
          row that changes its job, rather than three that appear and vanish and
          move everything else as they go. */}
      <div className={compact ? "space-y-1.5" : "space-y-2"}>
        {error && (
          <p className="text-xs text-[#c76b7a] text-center" role="alert">{error}</p>
        )}

        {!round && (
          <BettingBar
            bet={bet}
            setBet={setBet}
            balance={balance}
            game={game}
            busy={busy === "deal"}
            compact={compact}
            onDeal={() => deal(bet)}
          />
        )}

        {round && !finished && (
          <ActionBar round={round} busy={busy} balance={balance} compact={compact} onAct={act} />
        )}

        {round && finished && revealed.done && (
          <Settled summary={summary} compact={compact} onAgain={playAgain} />
        )}

        {/* While the dealer is still turning cards, there is nothing to press.
            The row keeps its height so the buttons do not jump up the screen
            underneath a thumb that is already on its way down. */}
        {round && finished && !revealed.done && (
          <p className={`text-center text-(--color-text-muted) ${
            compact ? "text-[11px] py-1.5" : "text-sm py-3"
          }`}>
            Dealer draws...
          </p>
        )}

        <HistoryStrip rows={history} compact={compact} />

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-full py-1.5 text-[11px] text-(--color-text-muted)
                       hover:text-(--color-silver) transition-colors"
          >
            Back to the table
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The last ten hands, as a row of marks.
 *
 * The one thing a table like this owes a player that the felt cannot tell them:
 * how the session is going. A letter each, newest on the left, because the hand
 * you just played is the one you are looking for — and read as a shape before
 * it is read as text, which is why the colours carry it and the letters only
 * confirm.
 *
 * Nothing at all before the first hand. An empty strip with ten grey slots
 * would be a promise the table has not kept yet.
 */
function HistoryStrip({ rows = [], compact }) {
  if (!rows.length) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-(--color-text-muted)
                       shrink-0">
        Last {rows.length}
      </span>
      <div className="flex gap-1 min-w-0">
        {rows.map((row) => {
          const mark = historyMark(row);
          return (
            <span
              key={row.id}
              title={mark.title}
              className={`grid place-items-center rounded font-bold shrink-0 ${
                compact ? "w-5 h-5 text-[9px]" : "w-6 h-6 text-[10px]"
              } ${
                mark.tone === "blackjack"
                  ? "bg-(--color-highlight) text-(--color-highlight-ink)"
                  : mark.tone === "win"
                  ? "border border-(--color-highlight-text) text-(--color-highlight-text)"
                  : mark.tone === "lose"
                  ? "border border-[#c76b7a] text-[#c76b7a]"
                  : "border border-(--color-border-strong) text-(--color-text-muted)"
              }`}
            >
              {mark.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** The felt this is played on — the app's own, so a blackjack table belongs to
 *  the same room as the poker ones and follows the same theme. */
function Felt({ compact, children }) {
  return (
    <div
      className={`@container felt rounded-2xl flex flex-col justify-center ${
        compact ? "px-3 py-3 gap-4 min-h-[11rem]" : "px-4 py-5 sm:px-6 gap-7 min-h-[14rem]"
      }`}
    >
      {children}
    </div>
  );
}

/**
 * The dealer's side: their cards, and how much of them is known.
 *
 * The hole card stays face down until the round is settled, and then it turns
 * over — which is the single most watched moment in the game and the reason
 * `revealed` exists at all.
 */
function DealerSide({ round, revealed, compact }) {
  const dealer = round?.dealer;
  const cards = dealer?.cards || [];
  // Only as many as the reveal has let out. Before it starts that is the two
  // they were dealt; the rest arrive on the beat.
  const shown = cards.slice(0, revealed.count);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-baseline gap-2 min-h-[1.1rem]">
        <span className="text-[10px] uppercase tracking-wider text-(--color-text-muted)">
          Dealer
        </span>
        {/* The reveal is passed in, and it is what holds the settled total
            back: the round is finished by the time the cards start coming out,
            so a line free to read `dealer.total` would print the ending over
            the top of the moment it is supposed to arrive from. Until the last
            card lands this says "one card down", which is what is true. */}
        {round && (
          <span className="text-xs font-semibold text-(--color-silver) tabular-nums">
            {dealerLine(round, revealed.done)}
          </span>
        )}
      </div>

      <div className={`flex ${compact ? "gap-1" : "gap-1.5"} min-h-[3.2rem] items-start`}>
        {shown.length === 0 && <CardSlot compact={compact} />}
        {shown.map((card, index) => (
          <span
            key={`${card}-${index}`}
            // The hole card turning over rather than arriving: it was already
            // on the table, face down, and a card that fades in where a
            // face-down one was standing reads as a different card.
            className={index === 1 && revealed.flipping ? "animate-bj-flip" : "animate-bj-deal"}
            style={{ animationDelay: index >= 2 ? "0ms" : `${index * 110}ms` }}
          >
            {card === "??"
              ? <CardBack size="hand" />
              : <PlayingCard card={card} size="hand" />}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Your side: every hand you are playing, and what is riding on each. */
function PlayerSide({ round, bet, compact, dealerDone }) {
  const hands = round?.hands || [];

  // Before a hand is dealt the felt is not empty — the chips you have pushed
  // out are already on it. That is what makes pressing a chip feel like
  // betting rather than filling in a form.
  if (!round) {
    return (
      <div className="flex flex-col items-center gap-2 min-h-[5rem] justify-end">
        {bet > 0 ? (
          <>
            <ChipStack chips={chipsFor(bet)} size={compact ? 26 : 34} />
            <span className="flex items-center gap-1 text-sm font-bold
                             text-(--color-highlight-text) tabular-nums">
              <Icon name="coin" className="w-3.5 h-3.5" />
              {bet.toLocaleString()}
            </span>
          </>
        ) : (
          <span className="text-xs text-(--color-text-muted)">Press a chip to bet</span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex justify-center items-start ${
      // Two hands after a split. Side by side even on a phone, because the
      // whole point of a split is seeing them against each other.
      hands.length > 1 ? "gap-3 sm:gap-6" : ""
    }`}>
      {hands.map((hand, index) => (
        <PlayerHand
          key={index}
          hand={hand}
          active={round.active === index && round.status !== "finished"}
          split={hands.length > 1}
          compact={compact}
          dealerDone={dealerDone}
        />
      ))}
    </div>
  );
}

/** One hand of yours: the cards, what they add to, and what it is worth. */
function PlayerHand({ hand, active, split, compact, dealerDone }) {
  const label = handLabel(hand);
  // Only a split needs its hands to report themselves. With one hand the line
  // under the felt is already saying what happened, and the same words twice a
  // card's width apart read as two different results.
  const settled = dealerDone && hand.outcome && split;
  const won = dealerDone
    && (hand.outcome === "win" || hand.outcome === "blackjack");

  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-xl transition-all ${
        compact ? "px-1.5 py-1" : "px-2.5 py-1.5"
      } ${
        // The hand it is your turn on, when there is more than one. A ring
        // rather than a colour: after a split both hands are yours, and the
        // only question the highlight answers is which one the buttons act on.
        active && split ? "ring-2 ring-(--color-highlight-text) bg-black/25" : ""
      } ${won ? "animate-bj-win" : ""} ${hand.status === "bust" ? "animate-bj-bust" : ""}`}
    >
      {/* What the hand came to, over the cards, so it is read before them. */}
      <div className="flex items-baseline gap-2 min-h-[1.1rem]">
        {label && (
          <span className={`text-[10px] font-bold uppercase tracking-wider ${
            label === "Bust" ? "text-[#c76b7a]"
              : label === "Blackjack" ? "text-(--color-highlight-text)"
              : "text-(--color-text-muted)"
          }`}>
            {label}
          </span>
        )}
        <span className="text-sm font-bold text-(--color-silver) tabular-nums">
          {handTotal(hand)}
        </span>
      </div>

      <div className={`flex ${compact ? "gap-1" : "gap-1.5"}`}>
        {hand.cards.map((card, index) => (
          <span
            key={`${card}-${index}`}
            className="animate-bj-deal"
            // Only the opening two are staggered. A card taken on a hit is one
            // card and should land the moment it is asked for.
            style={{ animationDelay: index < 2 ? `${55 + index * 110}ms` : "0ms" }}
          >
            <PlayingCard card={card} size="hand" />
          </span>
        ))}
      </div>

      {/* The chips riding on this hand, and then what they came back as. */}
      <div className="flex items-center gap-1.5 min-h-[1.4rem]">
        {settled ? (
          <span className={`animate-bj-payout text-xs font-bold tabular-nums ${
            won ? "text-(--color-highlight-text)"
              : hand.outcome === "push" ? "text-(--color-text-muted)" : "text-[#c76b7a]"
          }`}>
            {outcomeLine(hand)}
          </span>
        ) : (
          <>
            <ChipFan chips={chipsFor(hand.stake)} size={18} />
            <span className="text-[11px] text-(--color-text-muted) tabular-nums">
              {hand.stake.toLocaleString()}
              {hand.doubled && <span className="ml-1 text-(--color-highlight-text)">×2</span>}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** An empty place on the felt, so the table has a shape before it has cards. */
function CardSlot({ compact }) {
  return (
    <span
      className={`rounded border border-dashed border-(--color-border-strong) opacity-40 ${
        compact ? "w-8 h-11" : "w-11 h-16"
      }`}
      aria-hidden="true"
    />
  );
}

/**
 * Building a bet out of chips.
 *
 * Chips rather than a number field or a slider, because the amount is the
 * decision and a chip is a decision you can make with your thumb without
 * looking away from the felt. Three denominations is what fits across a phone
 * at a size worth pressing.
 */
function BettingBar({ bet, setBet, balance, game, busy, compact, onDeal }) {
  const state = bettingState({ bet, balance, game });

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
      <div className="flex items-center justify-center gap-2 sm:gap-3">
        {state.chipButtons.map((chip) => (
          <button
            key={chip.value}
            type="button"
            disabled={!chip.enabled}
            onClick={() => { setBet(bet + chip.value); playChips(); }}
            aria-label={`Bet ${chip.value} more`}
            className={`rounded-full transition-transform ${
              chip.enabled
                ? "hover:scale-110 active:scale-95 cursor-pointer"
                : "opacity-30 cursor-not-allowed"
            }`}
          >
            <Chip value={chip.value} size={compact ? 42 : 56} />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!state.canClear}
          onClick={() => setBet(0)}
          className={`px-3 rounded text-xs font-semibold btn-secondary transition-colors ${
            compact ? "py-2" : "py-3"
          } ${state.canClear ? "" : "opacity-40 cursor-not-allowed"}`}
        >
          Clear
        </button>
        <button
          type="button"
          disabled={!state.canDeal || busy}
          onClick={onDeal}
          className={`flex-1 rounded font-bold transition-colors ${
            compact ? "py-2 text-sm" : "py-3 text-base"
          } ${state.canDeal && !busy ? "btn-accent" : "btn-secondary opacity-50 cursor-not-allowed"}`}
        >
          {busy ? "Dealing..." : state.canDeal ? `Deal ${state.label}` : state.reason || "Deal"}
        </button>
      </div>
    </div>
  );
}

/**
 * Hit, stand, double, split.
 *
 * Always in that order and always in the same places, including the ones that
 * are not available — a button that moves position between hands is a button
 * pressed by accident, and the accident here costs coins. Unavailable ones are
 * dimmed rather than removed for exactly that reason.
 */
function ActionBar({ round, busy, balance, compact, onAct }) {
  // The balance matters here: a double or a split takes a second stake off the
  // wallet, so a player who bet everything can be offered a button the server
  // is about to refuse. The module works that out; this only has to pass it.
  const buttons = actionButtons(round, { balance });
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {buttons.map((button) => (
        <button
          key={button.key}
          type="button"
          disabled={!button.enabled || Boolean(busy)}
          onClick={() => onAct(button.key)}
          className={`rounded font-bold transition-colors ${
            // Big enough for a thumb. This is the one row in the app that gets
            // pressed several times a minute on a phone held in one hand.
            compact ? "py-2.5 text-xs" : "py-3.5 text-sm"
          } ${
            button.enabled && !busy
              ? button.key === "stand" ? "btn-secondary" : "btn-accent"
              : "btn-secondary opacity-35 cursor-not-allowed"
          }`}
        >
          {busy === button.key ? "..." : button.label}
        </button>
      ))}
    </div>
  );
}

/** What the round came to, and the way into the next one. */
function Settled({ summary, compact, onAgain }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`flex-1 min-w-0 flex items-baseline justify-center gap-2
                        font-bold tabular-nums animate-bj-payout ${
        compact ? "text-xs" : "text-base"
      } ${
        summary.tone === "win" ? "text-(--color-highlight-text)"
          : summary.tone === "push" ? "text-(--color-silver)" : "text-[#c76b7a]"
      }`}>
        {summary.headline}
        {/* What it came to. A push moved nothing and says so by having no
            figure at all, which is why this is null there rather than "0". */}
        {summary.netLabel && <span>{summary.netLabel}</span>}
      </span>
      <button
        type="button"
        onClick={onAgain}
        className={`px-4 rounded font-bold btn-accent transition-colors ${
          compact ? "py-2 text-xs" : "py-3 text-sm"
        }`}
      >
        Again
      </button>
    </div>
  );
}

/**
 * Letting the dealer's cards out one at a time.
 *
 * The server settles the whole round in one reply, so by the time this runs the
 * hand is already decided and every card is in hand. Showing them on a beat is
 * a fiction, and it is the fiction the game is made of: a dealer standing on 16
 * and reaching for one more card is the reason anybody watches. Nothing is
 * hidden that the player could act on — their own turn is over — so the only
 * thing bought by the delay is the part that was worth buying.
 *
 * Returns how many of the dealer's cards to draw, whether the hole card is
 * mid-turn, and whether the reveal has finished, which is what gates the
 * outcome line and the payout.
 */
function useDealerReveal(round) {
  const total = round?.dealer?.cards?.length || 0;
  const finished = round?.status === "finished";
  const roundId = round?.id ?? null;
  const [count, setCount] = useState(total);
  const [flipping, setFlipping] = useState(false);
  const timers = useRef([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    // Mid-hand there is nothing to reveal: the dealer has two cards and one of
    // them is the string "??", which is all the client is ever told.
    if (!finished) {
      setCount(total);
      setFlipping(false);
      return undefined;
    }

    // Settled. Start from the two that were already face up, turn the hole
    // card, then let the draw out a card at a time.
    setCount(Math.min(2, total));
    setFlipping(true);
    timers.current.push(setTimeout(() => setFlipping(false), 400));
    for (let index = 2; index < total; index += 1) {
      timers.current.push(setTimeout(
        () => setCount(index + 1),
        400 + (index - 1) * DEALER_BEAT_MS,
      ));
    }
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // Keyed on the round, so a new hand restarts the reveal and a re-render
    // in the middle of one does not.
  }, [roundId, finished, total]);

  return {
    count: finished ? count : total,
    flipping,
    // Done once the last card is out — and immediately for a hand that ended
    // without the dealer drawing at all, which is most of the bust ones.
    done: !finished || count >= total,
  };
}

/**
 * The sounds, tied to what actually changed.
 *
 * Fired off the round rather than off the button, because the button is not
 * what happened — a hit that busts and a hit that does not are the same press
 * and want opposite noises, and only the reply knows which it was.
 */
function useRoundSounds(round, settledAt, revealed) {
  const lastCards = useRef(0);
  const lastSettle = useRef(settledAt);
  const lastRound = useRef(null);

  // A card landing anywhere: the deal, a hit, a double, the dealer drawing.
  const dealt = useMemo(() => {
    const mine = (round?.hands || []).reduce((sum, hand) => sum + hand.cards.length, 0);
    return mine + Math.min(revealed.count, round?.dealer?.cards?.length || 0);
  }, [round, revealed.count]);

  useEffect(() => {
    if (round?.id !== lastRound.current) {
      lastRound.current = round?.id ?? null;
      lastCards.current = dealt;
      return;
    }
    if (dealt > lastCards.current) playCard();
    lastCards.current = dealt;
  }, [dealt, round?.id]);

  // The result, once the dealer has finished and not before: telling somebody
  // they lost while the card that beat them is still face down is telling them
  // the ending first.
  useEffect(() => {
    if (settledAt === lastSettle.current || !revealed.done || !round) return;
    lastSettle.current = settledAt;
    const hands = round.hands || [];
    if (hands.some((one) => one.outcome === "blackjack")) return playBlackjack();
    if (hands.some((one) => one.outcome === "win")) return playWin();
    if (hands.every((one) => one.outcome === "push")) return playPush();
    return playBust();
  }, [settledAt, revealed.done, round]);
}

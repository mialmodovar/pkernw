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
  canBet, canSit, dealerTableLine, mySeat, occupancy, phaseLine, seatState, tableActions,
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
    table, error, busy, settledRound, fetch, sit, leave, bet, act, markSettled, clearError,
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
  const seat = mySeat(table);
  // The bet being built. Cleared once it is placed, and again whenever a new
  // round comes round, so last round's stack is not sitting on the felt.
  useEffect(() => { setPending(0); }, [table?.round]);

  if (!table) {
    return <p className="text-(--color-text-muted) text-sm">Finding the table...</p>;
  }

  return (
    <div className="space-y-3">
      {/* What the table is doing and how long it has to do it in. The one line
          that has to be right: everything a player can press is decided by it. */}
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

      <div className="@container felt rounded-2xl px-3 py-4 sm:px-5 space-y-4">
        <DealerSide table={table} />

        {/* The eight chairs. Two across on a phone, all eight in a row on a
            wide screen — a table is a row of people, and it should look like
            one wherever there is room for it to. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
          {(table.seats || []).map((one) => (
            <SeatTile
              key={one.seat}
              seat={one}
              table={table}
              balance={balance}
              busy={busy}
              onSit={() => sit(one.seat)}
            />
          ))}
        </div>
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
          onLeave={leave}
        />
      ) : (
        <p className="text-xs text-(--color-text-muted) text-center py-2">
          Take a seat to play. The table deals whether or not you are in it.
        </p>
      )}
    </div>
  );
}

/** The dealer, and how much of their hand anybody is allowed to know yet. */
function DealerSide({ table }) {
  const cards = table.dealer?.cards || [];
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-baseline gap-2 min-h-[1.1rem]">
        <span className="text-[10px] uppercase tracking-wider text-(--color-text-muted)">
          Dealer
        </span>
        <span className="text-xs font-semibold text-(--color-silver) tabular-nums">
          {dealerTableLine(table)}
        </span>
      </div>
      <div className="flex gap-1.5 min-h-[3.4rem] items-start">
        {cards.length === 0 && <EmptySlot />}
        {cards.map((card, index) => (
          <span key={`${card}-${index}`} className="animate-bj-deal"
            style={{ animationDelay: `${index * 90}ms` }}>
            {card === "??"
              ? <CardBack size="hand" />
              : <PlayingCard card={card} size="hand" />}
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
function SeatTile({ seat, table, balance, busy, onSit }) {
  const state = seatState(seat, table);
  const hand = seat.hands?.[0] || null;

  if (state.empty) {
    const { allowed, reason } = canSit(table, seat.seat, balance);
    return (
      <button
        type="button"
        disabled={!allowed || busy === `sit:${seat.seat}`}
        onClick={onSit}
        title={reason || `Sit in seat ${seat.seat + 1}`}
        className={`rounded-lg border border-dashed min-h-[5.5rem] flex flex-col
                    items-center justify-center gap-1 transition-colors ${
          allowed
            ? "border-(--color-border-strong) text-(--color-text-muted) hover:border-(--color-highlight-text) hover:text-(--color-silver)"
            : "border-(--color-border) text-(--color-text-muted) opacity-40 cursor-not-allowed"
        }`}
      >
        <Icon name="casino" className="w-4 h-4" />
        <span className="text-[10px] uppercase tracking-wider">Sit</span>
      </button>
    );
  }

  return (
    <div
      className={`rounded-lg px-2 py-2 min-h-[5.5rem] flex flex-col items-center gap-1
                  border transition-colors ${
        state.mine
          ? "border-(--color-highlight-text) bg-black/30"
          : "border-(--color-border) bg-black/20"
      } ${state.won ? "animate-bj-win" : ""} ${state.bust ? "animate-bj-bust" : ""}`}
    >
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

      <div className="flex gap-0.5 min-h-[2rem] items-start">
        {(hand?.cards || []).map((card, index) => (
          <span key={`${card}-${index}`} className="animate-bj-deal"
            style={{ animationDelay: `${index * 70}ms` }}>
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
function YourSeat({ table, seat, balance, busy, pending, setPending, onBet, onAct, onLeave }) {
  const hand = seat.hands?.[0] || null;
  const betting = table.phase === "betting";
  const placed = seat.bet > 0;
  const check = canBet(table, pending, balance);
  const buttons = tableActions(table);

  return (
    <div className="panel-raised rounded-xl p-3 space-y-3">
      {/* Your hand, at the size the thing you are deciding about deserves. */}
      {(seat.hands || []).map((one, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {one.cards.map((card, i) => (
              <span key={`${card}-${i}`} className="animate-bj-deal"
                style={{ animationDelay: `${i * 90}ms` }}>
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
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            {[5, 25, 100].map((value) => {
              const next = canBet(table, pending + value, balance);
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!next.allowed}
                  onClick={() => { setPending(pending + value); playChips(); }}
                  aria-label={`Bet ${value} more`}
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
              className={`px-3 py-2.5 rounded text-xs font-semibold btn-secondary ${
                pending === 0 ? "opacity-40 cursor-not-allowed" : ""
              }`}
            >
              Clear
            </button>
            <button
              type="button"
              disabled={!check.allowed || busy === "bet"}
              onClick={onBet}
              className={`flex-1 py-2.5 rounded font-bold text-sm transition-colors ${
                check.allowed && busy !== "bet"
                  ? "btn-accent" : "btn-secondary opacity-50 cursor-not-allowed"
              }`}
            >
              {busy === "bet" ? "Placing..." : check.allowed
                ? `Bet ${pending.toLocaleString()}`
                : check.reason || "Bet"}
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

      {table.phase === "playing" && hand && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {buttons.map((button) => (
            <button
              key={button.key}
              type="button"
              disabled={!button.enabled || Boolean(busy)}
              onClick={() => onAct(button.key)}
              className={`py-3 rounded font-bold text-sm transition-colors ${
                button.enabled && !busy
                  ? button.key === "stand" ? "btn-secondary" : "btn-accent"
                  : "btn-secondary opacity-35 cursor-not-allowed"
              }`}
            >
              {busy === button.key ? "..." : button.label}
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
    if (hands.some((one) => one.outcome === "blackjack")) playBlackjack();
    else if (hands.some((one) => one.outcome === "win")) playWin();
    else if (hands.length && hands.every((one) => one.outcome === "push")) playPush();
    else if (hands.length) playBust();
  }, [table, round, settledRound, markSettled]);
}

"""Async single-hand engine — no I/O, uses broadcast/request_action callbacks."""

from __future__ import annotations
import asyncio
import random
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine, List, Optional, Tuple

from .card import Card, Deck, Rank, Suit, cards_str
from .player import Player
from .evaluator import evaluate, hand_name


# ── Equity estimation ────────────────────────────────────────────────────

_ALL_CARDS = [Card(r, s) for r in Rank for s in Suit]


def _monte_carlo_equity(
    hands: List[List[Card]],
    board: List[Card],
    iterations: int = 5000,
) -> List[float]:
    """Estimate equity (0.0-1.0) for each hand via Monte Carlo simulation."""
    dead = set()
    for h in hands:
        dead.update(h)
    dead.update(board)
    remaining_deck = [c for c in _ALL_CARDS if c not in dead]

    cards_needed = 5 - len(board)
    num_players = len(hands)
    wins = [0.0] * num_players

    for _ in range(iterations):
        runout = random.sample(remaining_deck, cards_needed)
        full_board = board + runout
        scores = [evaluate(h + full_board) for h in hands]
        best = max(scores)
        winners = [i for i, s in enumerate(scores) if s == best]
        share = 1.0 / len(winners)
        for w in winners:
            wins[w] += share

    total = sum(wins)
    if total == 0:
        return [1.0 / num_players] * num_players
    return [w / total for w in wins]


# ── Types for callbacks ──────────────────────────────────────────────────

BroadcastFn     = Callable[[str, dict], Coroutine[Any, Any, None]]
RequestActionFn = Callable[
    [Player, dict],               # player, context
    Coroutine[Any, Any, Tuple[str, int]],  # (action, amount)
]


# ── Pot helper ───────────────────────────────────────────────────────────

@dataclass
class Pot:
    amount: int
    eligible: List[Player] = field(default_factory=list)


def _build_pots(players: List[Player]) -> List[Pot]:
    contribs = [
        (p, p.total_invested) for p in players if p.total_invested > 0
    ]
    if not contribs:
        return []

    pots: List[Pot] = []
    remaining = sorted(contribs, key=lambda x: x[1])
    prev = 0

    while remaining:
        level  = remaining[0][1]
        amount = (level - prev) * len(remaining)
        if amount > 0:
            eligible = [p for p, _ in remaining if not p.is_folded]
            if not eligible:
                eligible = [remaining[0][0]]
            pots.append(Pot(amount=amount, eligible=list(eligible)))
        prev      = level
        remaining = [(p, inv) for p, inv in remaining if inv > level]

    return pots


# ── Hand result ──────────────────────────────────────────────────────────

@dataclass
class HandResult:
    pot_awards:     List[Tuple[Player, int, str]]
    busted_players: List[Player]
    community_cards: List[Card]
    hand_number:    int


# ── Card serialisation helper ────────────────────────────────────────────

def card_to_str(c: Card) -> str:
    return f"{c.rank}{c.suit}"


def cards_to_list(cards: List[Card]) -> List[str]:
    return [card_to_str(c) for c in cards]


def _seat_of(player: Player) -> int:
    """Return the original table seat stored by the consumer, or 0."""
    return getattr(player, "_seat", 0)


# ── Hand engine ──────────────────────────────────────────────────────────

class HandEngine:
    def __init__(
        self,
        players:        List[Player],
        dealer_pos:     int,
        small_blind:    int,
        big_blind:      int,
        ante:           int,
        hand_number:    int,
        broadcast:      BroadcastFn,
        request_action: RequestActionFn,
    ):
        self.players        = players
        self.dealer_pos     = dealer_pos % len(players)
        self.small_blind    = small_blind
        self.big_blind      = big_blind
        self.ante           = ante
        self.hand_number    = hand_number
        self.broadcast      = broadcast
        self.request_action = request_action

        self.deck              = Deck()
        self.community_cards:  List[Card] = []
        self._street_bet       = 0
        self._min_raise        = big_blind
        self._street_name      = "preflop"
        self._dead_money       = 0  # antes (dead money, added to main pot)

    # ── public entry ─────────────────────────────────────────────────────

    async def run(self) -> HandResult:
        for p in self.players:
            p.reset_for_hand()

        await self.broadcast("hand_started", {
            "hand_number": self.hand_number,
            "dealer_seat": _seat_of(self.players[self.dealer_pos]),
        })

        await self._post_antes()
        bb_pos = await self._post_blinds()
        await self._deal_hole_cards()

        n = len(self.players)
        preflop_start = (bb_pos + 1) % n
        self._street_name = "preflop"
        await self._betting_round(preflop_start, preflop=True)

        for street, count in [("flop", 3), ("turn", 1), ("river", 1)]:
            if self._active_count() <= 1:
                break

            # Detect all-in runout: all active players are all-in or at most
            # one can still act — no more meaningful betting will happen.
            all_in_runout = self._is_all_in_runout()

            if all_in_runout:
                # Reveal all hole cards and broadcast equity before each street
                active = [p for p in self.players if not p.is_folded]
                hands  = [p.hole_cards for p in active]
                equities = _monte_carlo_equity(hands, self.community_cards)
                await self.broadcast("all_in_equity", [
                    {"seat": _seat_of(p), "equity": round(eq * 100, 1),
                     "cards": cards_to_list(p.hole_cards)}
                    for p, eq in zip(active, equities)
                ])
                await asyncio.sleep(3)

            self.community_cards += self.deck.deal(count)
            self._street_name = street
            await self.broadcast("street_dealt", {
                "street": street,
                "cards": cards_to_list(self.community_cards),
                "pot": self._pot_total(),
            })

            if all_in_runout:
                # No betting round needed — just show the cards
                continue

            start = self._first_to_act_postflop()
            await self._betting_round(start, preflop=False)

        return await self._resolve()

    # ── setup ────────────────────────────────────────────────────────────

    async def _post_antes(self):
        if not self.ante:
            return
        entries = []
        for p in self.players:
            if p.chips > 0:
                paid              = min(self.ante, p.chips)
                p.chips          -= paid
                self._dead_money += paid
                if p.chips == 0:
                    p.is_all_in = True
                entries.append({"seat": _seat_of(p), "amount": paid})
        if entries:
            await self.broadcast("antes_posted", entries)

    async def _post_blinds(self) -> int:
        n = len(self.players)
        if n == 2:
            sb_idx, bb_idx = self.dealer_pos, (self.dealer_pos + 1) % n
        else:
            sb_idx = (self.dealer_pos + 1) % n
            bb_idx = (self.dealer_pos + 2) % n

        sb_p, bb_p = self.players[sb_idx], self.players[bb_idx]
        sb_paid = sb_p.bet(self.small_blind)
        bb_paid = bb_p.bet(self.big_blind)

        self._street_bet = bb_paid
        self._min_raise  = self.big_blind

        await self.broadcast("blinds_posted", {
            "sb": {"seat": _seat_of(sb_p), "amount": sb_paid},
            "bb": {"seat": _seat_of(bb_p), "amount": bb_paid},
        })
        return bb_idx

    async def _deal_hole_cards(self):
        for p in self.players:
            p.hole_cards = self.deck.deal(2)
        # Broadcast per-player card data; consumer will unicast privately
        await self.broadcast("hole_cards_dealt", {
            "players": [
                {"seat": _seat_of(p),
                 "user_id": getattr(p, "_user_id", None),
                 "cards": cards_to_list(p.hole_cards)}
                for p in self.players
            ],
        })

    # ── betting round ────────────────────────────────────────────────────

    async def _betting_round(self, start_pos: int, preflop: bool):
        n = len(self.players)

        if not preflop:
            for p in self.players:
                p.current_bet = 0
            self._street_bet = 0
            self._min_raise  = self.big_blind

        queue: List[int] = []
        for i in range(n):
            idx = (start_pos + i) % n
            p = self.players[idx]
            if not p.is_folded and not p.is_all_in:
                queue.append(idx)

        while queue:
            if self._active_count() <= 1:
                break
            if not any(self.players[i].can_act() for i in queue):
                break

            idx = queue.pop(0)
            p   = self.players[idx]
            if p.is_folded or p.is_all_in or p.chips == 0:
                continue

            can_check = p.current_bet >= self._street_bet
            to_call   = self._street_bet - p.current_bet
            min_raise = self._street_bet + self._min_raise
            max_raise = p.current_bet + p.chips

            valid = ["fold"]
            if can_check:
                valid.append("check")
            else:
                valid.append("call")
            if p.chips > to_call:
                valid.append("raise")

            seat = _seat_of(p)
            context = {
                "seat":          seat,
                "to_call":       to_call,
                "min_raise":     min_raise,
                "max_raise":     max_raise,
                "valid_actions": valid,
                "pot":           self._pot_total(),
                "street":        self._street_name,
            }

            action, amount = await self.request_action(p, context)

            event = {"seat": seat, "action": action, "amount": 0}

            if action == "fold":
                p.is_folded = True
                event["amount"] = 0

            elif action == "check":
                event["amount"] = 0

            elif action == "call":
                actual_call = min(to_call, p.chips)
                p.bet(actual_call)
                event["amount"] = actual_call

            elif action in ("bet", "raise"):
                extra = amount - p.current_bet
                p.bet(extra)
                actual_total     = p.current_bet
                increment        = actual_total - self._street_bet
                self._min_raise  = max(increment, self.big_blind)
                self._street_bet = actual_total
                event["amount"]  = actual_total
                event["action"]  = "bet" if self._street_bet == actual_total and not preflop else "raise"

                queue = []
                for i in range(1, n):
                    j = (idx + i) % n
                    pl = self.players[j]
                    if not pl.is_folded and not pl.is_all_in and j != idx:
                        queue.append(j)

            await self.broadcast("action_taken", event)

            if self._active_count() <= 1:
                break

    # ── resolve ──────────────────────────────────────────────────────────

    async def _resolve(self) -> HandResult:
        pots   = _build_pots(self.players)
        # Add dead money (antes) to the main pot
        if self._dead_money > 0:
            if pots:
                pots[0].amount += self._dead_money
            else:
                # Edge case: all folded before any bets — dead money is the only pot
                active = [p for p in self.players if not p.is_folded]
                pots = [Pot(amount=self._dead_money, eligible=active or self.players[:1])]
        awards: List[Tuple[Player, int, str]] = []
        active = [p for p in self.players if not p.is_folded]

        if len(active) == 1:
            winner = active[0]
            total  = sum(pt.amount for pt in pots)
            winner.chips += total
            winner.hands_won += 1
            awards.append((winner, total, "uncontested"))
            await self.broadcast("pot_awarded", [{
                "seat": _seat_of(winner),
                "amount": total,
                "description": "uncontested",
            }])
        else:
            showdown_data = []
            for p in active:
                score = evaluate(p.hole_cards + self.community_cards)
                showdown_data.append({
                    "seat":      _seat_of(p),
                    "cards":     cards_to_list(p.hole_cards),
                    "hand_name": hand_name(score),
                })
            await self.broadcast("showdown", showdown_data)

            pot_awards_data = []
            for i, pot in enumerate(pots):
                label    = "Main pot" if i == 0 else f"Side pot {i}"
                eligible = [p for p in pot.eligible if not p.is_folded]
                if not eligible:
                    eligible = pot.eligible

                scores  = [(p, evaluate(p.hole_cards + self.community_cards)) for p in eligible]
                best    = max(s for _, s in scores)
                winners = [p for p, s in scores if s == best]

                share    = pot.amount // len(winners)
                odd_chip = pot.amount % len(winners)

                for j, w in enumerate(winners):
                    amt = share + (odd_chip if j == 0 else 0)
                    w.chips    += amt
                    w.hands_won += 1
                    desc = f"{label}: {hand_name(best)}"
                    if len(winners) > 1:
                        desc += f" (split {len(winners)}-way)"
                    awards.append((w, amt, desc))
                    pot_awards_data.append({
                        "seat": _seat_of(w),
                        "amount": amt,
                        "description": desc,
                    })

            await self.broadcast("pot_awarded", pot_awards_data)

        stacks = [{"seat": _seat_of(p), "chips": p.chips} for p in self.players]
        await self.broadcast("hand_complete", {"stacks": stacks})

        busted = [p for p in self.players if p.chips == 0]
        return HandResult(
            pot_awards=awards,
            busted_players=busted,
            community_cards=self.community_cards,
            hand_number=self.hand_number,
        )

    # ── helpers ──────────────────────────────────────────────────────────

    def _active_count(self) -> int:
        return sum(1 for p in self.players if not p.is_folded)

    def _is_all_in_runout(self) -> bool:
        """True when no further betting is possible (all-in showdown)."""
        active = [p for p in self.players if not p.is_folded]
        if len(active) < 2:
            return False
        can_act = sum(1 for p in active if p.can_act())
        return can_act <= 1

    def _first_to_act_postflop(self) -> int:
        n = len(self.players)
        for i in range(1, n + 1):
            idx = (self.dealer_pos + i) % n
            if not self.players[idx].is_folded:
                return idx
        return self.dealer_pos

    def _pot_total(self) -> int:
        return sum(p.total_invested for p in self.players) + self._dead_money

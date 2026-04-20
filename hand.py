"""Single hand of NL Hold'em: blinds, betting rounds, side pots, showdown."""

from __future__ import annotations
import random
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from card import Card, Deck, cards_str
from player import Player
from evaluator import evaluate, hand_name, preflop_strength


# ─────────────────────────────────────────────────────────────────────────────
# Pot helper
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Pot:
    amount: int
    eligible: List[Player] = field(default_factory=list)


def _build_pots(players: List[Player]) -> List[Pot]:
    """Convert per-player total_invested into a list of (main + side) pots."""
    # List of (player, invested) for everyone who put chips in
    contribs: List[Tuple[Player, int]] = [
        (p, p.total_invested) for p in players if p.total_invested > 0
    ]
    if not contribs:
        return []

    pots: List[Pot] = []
    remaining = sorted(contribs, key=lambda x: x[1])  # sort by invested asc
    prev = 0

    while remaining:
        level  = remaining[0][1]
        amount = (level - prev) * len(remaining)
        if amount > 0:
            eligible = [p for p, _ in remaining if not p.is_folded]
            if not eligible:           # everyone folded into this pot
                eligible = [remaining[0][0]]
            pots.append(Pot(amount=amount, eligible=list(eligible)))
        prev      = level
        remaining = [(p, inv) for p, inv in remaining if inv > level]

    return pots


# ─────────────────────────────────────────────────────────────────────────────
# Hand result
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class HandResult:
    pot_awards: List[Tuple[Player, int, str]]   # (player, amount, description)
    busted_players: List[Player]                # players whose chips hit 0


# ─────────────────────────────────────────────────────────────────────────────
# Hand engine
# ─────────────────────────────────────────────────────────────────────────────

class HandEngine:
    """Runs one complete hand from blinds to showdown."""

    def __init__(
        self,
        players:     List[Player],   # active players in seat order
        dealer_pos:  int,            # index into players
        small_blind: int,
        big_blind:   int,
        ante:        int,
        hand_number: int = 0,
    ) -> None:
        self.players     = players
        self.dealer_pos  = dealer_pos % len(players)
        self.small_blind = small_blind
        self.big_blind   = big_blind
        self.ante        = ante
        self.hand_number = hand_number

        self.deck             = Deck()
        self.community_cards: List[Card] = []
        self._street_bet      = 0          # highest bet in the current street
        self._min_raise       = big_blind  # minimum raise increment

    # ─────────────────────────────────────────────────────────────────────────
    # Public entry point
    # ─────────────────────────────────────────────────────────────────────────

    def run(self) -> HandResult:
        for p in self.players:
            p.reset_for_hand()

        self._print_header()
        self._post_antes()
        bb_pos = self._post_blinds()
        self._deal_hole_cards()

        # Pre-flop: action starts left of BB
        n            = len(self.players)
        preflop_start = (bb_pos + 1) % n
        self._betting_round(preflop_start, preflop=True, bb_pos=bb_pos)

        for street, count in [("FLOP", 3), ("TURN", 1), ("RIVER", 1)]:
            if self._active_count() <= 1:
                break
            self.community_cards += self.deck.deal(count)
            self._print_board(street)
            start = self._first_to_act_postflop()
            self._betting_round(start, preflop=False)

        return self._resolve()

    # ─────────────────────────────────────────────────────────────────────────
    # Setup
    # ─────────────────────────────────────────────────────────────────────────

    def _print_header(self) -> None:
        sep = "─" * 60
        print(f"\n{sep}")
        dealer = self.players[self.dealer_pos]
        print(f"  Hand #{self.hand_number}  |  Dealer: {dealer.name}")
        print(f"  Blinds: {self.small_blind}/{self.big_blind}"
              + (f"  Ante: {self.ante}" if self.ante else ""))
        print(sep)

    def _post_antes(self) -> None:
        if not self.ante:
            return
        print("\n  [Antes]")
        for p in self.players:
            if p.chips > 0:
                paid              = min(self.ante, p.chips)
                p.chips          -= paid
                p.total_invested += paid
                if p.chips == 0:
                    p.is_all_in = True
                print(f"    {p.name} posts ante {paid}")

    def _post_blinds(self) -> int:
        """Post SB and BB, return the bb player index."""
        n = len(self.players)
        if n == 2:                           # heads-up: dealer = SB
            sb_idx = self.dealer_pos
            bb_idx = (self.dealer_pos + 1) % n
        else:
            sb_idx = (self.dealer_pos + 1) % n
            bb_idx = (self.dealer_pos + 2) % n

        sb_p, bb_p = self.players[sb_idx], self.players[bb_idx]

        print("\n  [Blinds]")
        sb_paid = sb_p.bet(self.small_blind)
        bb_paid = bb_p.bet(self.big_blind)
        print(f"    {sb_p.name} posts SB {sb_paid}")
        print(f"    {bb_p.name} posts BB {bb_paid}")

        self._street_bet  = bb_paid
        self._min_raise   = self.big_blind
        return bb_idx

    def _deal_hole_cards(self) -> None:
        print()
        for p in self.players:
            p.hole_cards = self.deck.deal(2)
            if p.is_human:
                print(f"  >> {p.name}'s hole cards: {cards_str(p.hole_cards)}")

    # ─────────────────────────────────────────────────────────────────────────
    # Betting round
    # ─────────────────────────────────────────────────────────────────────────

    def _betting_round(
        self, start_pos: int, preflop: bool, bb_pos: int = -1
    ) -> None:
        n = len(self.players)

        if not preflop:
            for p in self.players:
                p.current_bet = 0
            self._street_bet = 0
            self._min_raise  = self.big_blind

        # Build initial action queue
        queue: List[int] = []
        for i in range(n):
            idx = (start_pos + i) % n
            p   = self.players[idx]
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

            action, amount = self._get_action(p, idx)

            if action == "fold":
                p.is_folded = True
                print(f"    {p.name} folds")
                if self._active_count() == 1:
                    break

            elif action == "check":
                print(f"    {p.name} checks")

            elif action == "call":
                to_call = min(self._street_bet - p.current_bet, p.chips)
                p.bet(to_call)
                suffix = " (all-in)" if p.is_all_in else ""
                print(f"    {p.name} calls {to_call}{suffix}")

            elif action in ("bet", "raise"):
                # amount = desired total bet for this street
                extra = amount - p.current_bet
                p.bet(extra)
                actual_total      = p.current_bet
                increment         = actual_total - self._street_bet
                self._min_raise   = max(increment, self.big_blind)
                self._street_bet  = actual_total
                verb   = "bets" if action == "bet" else "raises to"
                suffix = " (all-in)" if p.is_all_in else ""
                print(f"    {p.name} {verb} {actual_total}{suffix}")

                # Re-queue every other active player
                queue = []
                for i in range(1, n):
                    j  = (idx + i) % n
                    pl = self.players[j]
                    if not pl.is_folded and not pl.is_all_in and j != idx:
                        queue.append(j)

        self._print_pot_summary()

    # ─────────────────────────────────────────────────────────────────────────
    # Action decision helpers
    # ─────────────────────────────────────────────────────────────────────────

    def _get_action(
        self, player: Player, idx: int
    ) -> Tuple[str, int]:
        can_check = player.current_bet >= self._street_bet
        to_call   = self._street_bet - player.current_bet

        if player.is_human:
            return self._human_action(player, can_check, to_call)
        else:
            return self._bot_action(player, can_check, to_call)

    # ── human prompt ─────────────────────────────────────────────────────────

    def _human_action(
        self, player: Player, can_check: bool, to_call: int
    ) -> Tuple[str, int]:
        pot_total = sum(p.total_invested for p in self.players)
        board_str = cards_str(self.community_cards) if self.community_cards else "(none)"

        print(f"\n  --- {player.name}'s turn ---")
        print(f"  Stack: {player.chips:,}  |  Pot: {pot_total:,}  |  Board: {board_str}")
        if player.hole_cards:
            print(f"  Hole cards: {cards_str(player.hole_cards)}")

        if can_check:
            options = "[C]heck  [R]aise  [F]old"
        else:
            options = f"[Ca]ll {to_call}  [R]aise  [F]old  [A]ll-in"

        while True:
            raw = input(f"  Action ({options}): ").strip().lower()

            if raw in ("f", "fold"):
                return "fold", 0

            if raw in ("c", "check") and can_check:
                return "check", 0

            if raw in ("ca", "call") and not can_check:
                return "call", 0

            if raw in ("a", "all-in", "allin", "all_in"):
                total = player.current_bet + player.chips
                return "raise", total

            if raw in ("r", "raise", "b", "bet"):
                min_total = self._street_bet + self._min_raise
                max_total = player.current_bet + player.chips
                print(f"  Min raise to: {min_total:,}  |  Max (all-in): {max_total:,}")
                while True:
                    try:
                        val = int(input("  Raise to: ").strip())
                    except ValueError:
                        print("  Enter a number.")
                        continue
                    if val < min_total and val != max_total:
                        print(f"  Must raise to at least {min_total:,} (or go all-in for {max_total:,}).")
                        continue
                    if val > max_total:
                        print(f"  You only have {max_total:,} total.")
                        continue
                    verb = "bet" if self._street_bet == 0 else "raise"
                    return verb, val

            print("  Invalid input, try again.")

    # ── bot decision ─────────────────────────────────────────────────────────

    def _bot_action(
        self, player: Player, can_check: bool, to_call: int
    ) -> Tuple[str, int]:
        pot = max(1, sum(p.total_invested for p in self.players))

        # Evaluate current hand strength
        if self.community_cards:
            score = evaluate(player.hole_cards + self.community_cards)
            # Normalise category (0–8) to 0–1
            strength = score[0] / 8.0 + random.uniform(-0.05, 0.05)
        else:
            strength = preflop_strength(player.hole_cards) + random.uniform(-0.05, 0.05)

        strength = max(0.0, min(1.0, strength))

        # Pot odds (fraction of pot required to call)
        pot_odds = to_call / (pot + to_call) if to_call > 0 else 0.0

        if can_check:
            if strength > 0.70:
                # Build the pot
                raise_to = min(
                    player.current_bet + max(int(pot * 0.6), self.big_blind),
                    player.current_bet + player.chips,
                )
                raise_to = max(raise_to, self._street_bet + self._min_raise)
                return "bet", raise_to
            return "check", 0
        else:
            # Need to call, raise, or fold
            if strength >= 0.80:
                # Raise / re-raise
                raise_to = min(
                    self._street_bet + max(int(pot * 0.75), self._min_raise),
                    player.current_bet + player.chips,
                )
                raise_to = max(raise_to, self._street_bet + self._min_raise)
                return "raise", raise_to
            if strength >= pot_odds + 0.15:
                return "call", 0
            # Fold unless it's a trivially small call
            if to_call <= self.big_blind // 2:
                return "call", 0
            return "fold", 0

    # ─────────────────────────────────────────────────────────────────────────
    # Resolution
    # ─────────────────────────────────────────────────────────────────────────

    def _resolve(self) -> HandResult:
        pots    = _build_pots(self.players)
        awards: List[Tuple[Player, int, str]] = []

        active = [p for p in self.players if not p.is_folded]

        if len(active) == 1:
            # Everyone else folded — winner takes everything
            winner  = active[0]
            total   = sum(pt.amount for pt in pots)
            winner.chips += total
            winner.hands_won += 1
            print(f"\n  {winner.name} wins {total:,} (uncontested)")
            awards.append((winner, total, "uncontested"))
        else:
            print(f"\n  --- SHOWDOWN ---")
            print(f"  Board: {cards_str(self.community_cards)}")
            for p in active:
                score = evaluate(p.hole_cards + self.community_cards)
                print(f"  {p.name}: {cards_str(p.hole_cards)}  →  {hand_name(score)}")

            for i, pot in enumerate(pots):
                label    = "Main pot" if i == 0 else f"Side pot {i}"
                eligible = [p for p in pot.eligible if not p.is_folded]
                if not eligible:
                    eligible = pot.eligible

                # Find winner(s) of this pot
                scores   = [(p, evaluate(p.hole_cards + self.community_cards))
                            for p in eligible]
                best     = max(s for _, s in scores)
                winners  = [p for p, s in scores if s == best]

                share    = pot.amount // len(winners)
                odd_chip = pot.amount % len(winners)  # give to first winner

                for j, w in enumerate(winners):
                    amount = share + (odd_chip if j == 0 else 0)
                    w.chips += amount
                    w.hands_won += 1
                    desc = (
                        f"{label}: {hand_name(best)}"
                        + (f" (split {len(winners)}-way)" if len(winners) > 1 else "")
                    )
                    print(f"  {w.name} wins {amount:,}  [{desc}]")
                    awards.append((w, amount, desc))

        # Mark busted players
        busted = [p for p in self.players if p.chips == 0]
        return HandResult(pot_awards=awards, busted_players=busted)

    # ─────────────────────────────────────────────────────────────────────────
    # Utilities
    # ─────────────────────────────────────────────────────────────────────────

    def _active_count(self) -> int:
        return sum(1 for p in self.players if not p.is_folded)

    def _first_to_act_postflop(self) -> int:
        """Index of first non-folded, non-all-in player left of dealer."""
        n = len(self.players)
        for i in range(1, n + 1):
            idx = (self.dealer_pos + i) % n
            if not self.players[idx].is_folded:
                return idx
        return self.dealer_pos

    def _print_board(self, street: str) -> None:
        print(f"\n  [{street}]  {cards_str(self.community_cards)}")

    def _print_pot_summary(self) -> None:
        total = sum(p.total_invested for p in self.players)
        print(f"  (Pot: {total:,})")

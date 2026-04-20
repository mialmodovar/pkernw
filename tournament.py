"""Tournament loop: blind levels, seat management, and final standings."""

from __future__ import annotations
from typing import List

from config import TournamentConfig, BlindLevel
from player import Player
from hand import HandEngine


class Tournament:
    """Runs a full sit-and-go / freezeout tournament."""

    def __init__(self, config: TournamentConfig) -> None:
        self.config  = config
        self.players = [
            Player(name=name, chips=config.starting_chips, is_human=human)
            for name, human in config.players
        ]
        self._total_players  = len(self.players)
        self._hand_number    = 0
        self._level_index    = 0
        self._hands_in_level = 0
        self._dealer_idx     = 0   # index into active player list
        self._standings: List[Player] = []  # eliminated, in reverse finish order

    # ─────────────────────────────────────────────────────────────────────────
    # Main entry point
    # ─────────────────────────────────────────────────────────────────────────

    def run(self) -> None:
        self._print_banner()

        while len(self._active_players()) > 1:
            active = self._active_players()
            level  = self._current_level()

            self._announce_level_if_changed()

            # Deal and play one hand
            engine = HandEngine(
                players     = active,
                dealer_pos  = self._dealer_idx % len(active),
                small_blind = level.small_blind,
                big_blind   = level.big_blind,
                ante        = level.ante,
                hand_number = self._hand_number + 1,
            )
            result = engine.run()
            self._hand_number    += 1
            self._hands_in_level += 1

            # Print chip counts after hand
            self._print_chip_counts()

            # Eliminate busted players
            for p in result.busted_players:
                if p.chips == 0 and not p.is_eliminated:
                    active_left = len(self._active_players()) - 1
                    p.is_eliminated   = True
                    p.finish_position = active_left + 1
                    self._standings.append(p)
                    print(f"\n  *** {p.name} has been eliminated "
                          f"(finished {self._ordinal(p.finish_position)}) ***")

            # Advance dealer button (skip eliminated)
            self._dealer_idx = self._next_dealer()

            # Advance blind level if duration exhausted
            self._advance_level_if_due()

        winner = self._active_players()[0]
        print(self._final_report(winner))

    # ─────────────────────────────────────────────────────────────────────────
    # Blind / level management
    # ─────────────────────────────────────────────────────────────────────────

    def _current_level(self) -> BlindLevel:
        idx = min(self._level_index, len(self.config.levels) - 1)
        return self.config.levels[idx]

    def _advance_level_if_due(self) -> None:
        level = self._current_level()
        if (
            self._hands_in_level >= level.duration_hands
            and self._level_index < len(self.config.levels) - 1
        ):
            self._level_index    += 1
            self._hands_in_level  = 0

    def _announce_level_if_changed(self) -> None:
        if self._hands_in_level == 0:
            lvl = self._current_level()
            num = self._level_index + 1
            print(f"\n{'═' * 60}")
            print(f"  LEVEL {num}  —  {lvl}")
            print(f"{'═' * 60}")

    # ─────────────────────────────────────────────────────────────────────────
    # Seat / dealer helpers
    # ─────────────────────────────────────────────────────────────────────────

    def _active_players(self) -> List[Player]:
        return [p for p in self.players if not p.is_eliminated]

    def _next_dealer(self) -> int:
        active = self._active_players()
        if not active:
            return 0
        return (self._dealer_idx + 1) % len(active)

    # ─────────────────────────────────────────────────────────────────────────
    # Display
    # ─────────────────────────────────────────────────────────────────────────

    def _print_banner(self) -> None:
        total_chips = sum(p.chips for p in self.players)
        print("\n" + "═" * 60)
        print("  NL HOLD'EM TOURNAMENT")
        print("═" * 60)
        print(f"  Players: {len(self.players)}  |  "
              f"Starting chips: {self.config.starting_chips:,}  |  "
              f"Total chips in play: {total_chips:,}")
        self.config.display_structure()

    def _print_chip_counts(self) -> None:
        active = self._active_players()
        total  = sum(p.chips for p in active)
        lines  = ["", "  Chip counts:"]
        for p in sorted(active, key=lambda x: x.chips, reverse=True):
            pct = p.chips / total * 100 if total else 0
            bar = "█" * int(pct / 5)
            lines.append(f"    {p.name:<16} {p.chips:>8,}  {bar} {pct:.0f}%")
        print("\n".join(lines))

    def _final_report(self, winner: Player) -> str:
        standings = [winner] + list(reversed(self._standings))
        lines = [
            "",
            "═" * 60,
            "  TOURNAMENT COMPLETE",
            "═" * 60,
            f"  Winner: {winner.name}  ({winner.chips:,} chips)",
            "",
            "  Final standings:",
        ]
        for pos, p in enumerate(standings, 1):
            lines.append(f"    {pos:>2}. {p.name}")
        lines += [
            "",
            f"  Total hands played: {self._hand_number}",
            f"  Levels reached:     {self._level_index + 1} / {len(self.config.levels)}",
            "═" * 60,
        ]
        return "\n".join(lines)

    # ─────────────────────────────────────────────────────────────────────────
    # Utilities
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _ordinal(n: int) -> str:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10 if n % 100 not in (11, 12, 13) else 0, "th")
        return f"{n}{suffix}"

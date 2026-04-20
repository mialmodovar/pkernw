#!/usr/bin/env python3
"""Entry point — tournament setup wizard and game launcher."""

from __future__ import annotations
import sys
from typing import List, Tuple

from config import BlindLevel, TournamentConfig, DEFAULT_BLIND_STRUCTURE
from tournament import Tournament


# ─────────────────────────────────────────────────────────────────────────────
# Input helpers
# ─────────────────────────────────────────────────────────────────────────────

def _ask_int(prompt: str, default: int, min_val: int = 1) -> int:
    while True:
        raw = input(f"{prompt} [{default}]: ").strip()
        if raw == "":
            return default
        try:
            val = int(raw)
            if val < min_val:
                print(f"  Must be at least {min_val}.")
                continue
            return val
        except ValueError:
            print("  Please enter a whole number.")


def _ask_yes(prompt: str, default: bool = False) -> bool:
    hint = "Y/n" if default else "y/N"
    while True:
        raw = input(f"{prompt} [{hint}]: ").strip().lower()
        if raw == "":
            return default
        if raw in ("y", "yes"):
            return True
        if raw in ("n", "no"):
            return False
        print("  Please enter y or n.")


# ─────────────────────────────────────────────────────────────────────────────
# Setup sections
# ─────────────────────────────────────────────────────────────────────────────

def _setup_players() -> List[Tuple[str, bool]]:
    """Collect player list (name + human/bot flag)."""
    print("\n─── Players ────────────────────────────────────────────")
    num = _ask_int("  Number of players", default=4, min_val=2)

    players: List[Tuple[str, bool]] = []
    for i in range(1, num + 1):
        default_name = f"Player {i}"
        name = input(f"  Name for seat {i} [{default_name}]: ").strip()
        if not name:
            name = default_name
        is_human = _ask_yes(f"  Is {name} a human player?", default=True)
        players.append((name, is_human))

    return players


def _setup_chips() -> int:
    print("\n─── Starting Chips ──────────────────────────────────────")
    return _ask_int("  Starting chips per player", default=10_000, min_val=100)


def _setup_blind_structure() -> List[BlindLevel]:
    """Let the user choose default structure, quick custom, or full manual."""
    print("\n─── Blind Structure ─────────────────────────────────────")
    print("  1) Use default structure (12 levels)")
    print("  2) Quick custom  (set multiplier + duration)")
    print("  3) Manual entry  (define each level)")

    while True:
        choice = input("  Choice [1]: ").strip()
        if choice in ("", "1"):
            return list(DEFAULT_BLIND_STRUCTURE)
        if choice == "2":
            return _quick_custom_structure()
        if choice == "3":
            return _manual_structure()
        print("  Please enter 1, 2, or 3.")


def _quick_custom_structure() -> List[BlindLevel]:
    """Build a structure from a starting blind + multiplier."""
    print("\n  Quick custom structure")
    starting_bb  = _ask_int("  Starting big blind", default=100, min_val=2)
    multiplier   = _ask_int("  BB multiplier between levels (e.g. 150 = ×1.5)", default=150, min_val=101)
    num_levels   = _ask_int("  Number of levels", default=10, min_val=2)
    duration     = _ask_int("  Hands per level", default=8, min_val=1)
    ante_pct     = _ask_int("  Ante as % of BB starting from level 3 (0 = no ante)", default=25, min_val=0)

    levels: List[BlindLevel] = []
    bb = starting_bb
    for i in range(num_levels):
        sb   = bb // 2
        ante = (bb * ante_pct // 100) if (i >= 2 and ante_pct > 0) else 0
        levels.append(BlindLevel(sb, bb, ante, duration))
        bb = max(bb + 1, bb * multiplier // 100)

    print("\n  Generated structure:")
    for j, lvl in enumerate(levels, 1):
        print(f"    Level {j:>2}: {lvl}")

    return levels


def _manual_structure() -> List[BlindLevel]:
    """Prompt the user to enter each blind level by hand."""
    print("\n  Manual structure entry (leave SB blank to finish)")
    levels: List[BlindLevel] = []
    level_num = 1

    while True:
        print(f"\n  Level {level_num}:")
        raw_sb = input("    Small blind (blank to finish): ").strip()
        if raw_sb == "":
            if len(levels) < 1:
                print("  Need at least one level.")
                continue
            break
        try:
            sb = int(raw_sb)
        except ValueError:
            print("  Enter a number.")
            continue

        bb       = _ask_int("    Big blind",       default=sb * 2,   min_val=sb)
        ante     = _ask_int("    Ante (0 = none)", default=0,         min_val=0)
        duration = _ask_int("    Hands at this level", default=8,    min_val=1)
        levels.append(BlindLevel(sb, bb, ante, duration))
        level_num += 1

    return levels


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    print("╔══════════════════════════════════════════════════════════╗")
    print("║        NL HOLD'EM TOURNAMENT ENGINE  —  setup           ║")
    print("╚══════════════════════════════════════════════════════════╝")

    try:
        players = _setup_players()
        chips   = _setup_chips()
        levels  = _setup_blind_structure()
    except (KeyboardInterrupt, EOFError):
        print("\n\nAborted.")
        sys.exit(0)

    config     = TournamentConfig(players=players, starting_chips=chips, levels=levels)
    tournament = Tournament(config)

    print("\n  Everything ready — good luck!")
    try:
        input("  Press Enter to start the tournament...")
    except (KeyboardInterrupt, EOFError):
        print("\n\nAborted.")
        sys.exit(0)

    try:
        tournament.run()
    except KeyboardInterrupt:
        print("\n\nTournament interrupted.")
        sys.exit(0)


if __name__ == "__main__":
    main()

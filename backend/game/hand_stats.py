"""Preflop statistics mined from recorded hand history.

Definitions, so the numbers mean the same thing everywhere they are shown:

- **Hands**: hands the player was dealt into (they have at least one recorded
  preflop entry, which includes posting a blind or an ante).
- **VPIP**: hands where they voluntarily put money in preflop — a call, bet or
  raise. Blinds and antes are forced, so they do not count.
- **PFR**: hands where they raised preflop.
- **3-bet**: of the hands where they faced a raise before acting, the share in
  which they raised over it. The blinds are not a raise, so the first raise is
  an open and the second is the 3-bet.
- **ATS** (attempt to steal): of the hands where they were first in from a steal
  seat — cutoff, button or small blind — the share in which they raised. Only
  counted at tables of three or more, since there is nothing to steal heads-up.

Percentages are over the opportunities for that statistic, not over all hands,
which is what makes them comparable between players.
"""

from collections import defaultdict

from .models import HandAction

VOLUNTARY = {"call", "bet", "raise"}
FORCED = {"blind", "ante"}
# Cutoff, button and small blind — below three players there is no steal.
MIN_PLAYERS_FOR_STEAL = 3


def _percentage(part, whole):
    return round(part / whole * 100, 1) if whole else 0.0


def _steal_positions(seats_in_hand, dealer_seat):
    """Cutoff, button and small blind, in seat terms, for this hand."""
    # Hands recorded before the seat was stored per action have no reliable
    # position, so no steal can be judged from them.
    known = {seat for seat in seats_in_hand if seat is not None}
    if dealer_seat is None or len(known) < MIN_PLAYERS_FOR_STEAL:
        return set()
    ordered = sorted(known)
    if dealer_seat not in ordered:
        return set()
    button = ordered.index(dealer_seat)
    return {
        ordered[button],                        # button
        ordered[(button - 1) % len(ordered)],   # cutoff
        ordered[(button + 1) % len(ordered)],   # small blind
    }


def compute_player_stats(user_ids):
    """Return {user_id: stats} over every hand those users have played."""
    user_ids = list(user_ids)
    if not user_ids:
        return {}

    # Every preflop entry of every hand any of these users took part in — the
    # other players' actions are needed to know what each user was facing.
    hand_ids = set(
        HandAction.objects.filter(player__user_id__in=user_ids, street="preflop")
        .values_list("hand_id", flat=True)
    )
    if not hand_ids:
        return {user_id: _empty() for user_id in user_ids}

    rows = list(
        HandAction.objects.filter(hand_id__in=hand_ids, street="preflop")
        .order_by("hand_id", "id")
        .values("hand_id", "player__user_id", "player__seat_at_table", "seat", "action", "hand__dealer_seat")
    )

    by_hand = defaultdict(list)
    for row in rows:
        by_hand[row["hand_id"]].append(row)

    tally = {user_id: _empty() for user_id in user_ids}
    wanted = set(user_ids)

    for actions in by_hand.values():
        dealer_seat = actions[0]["hand__dealer_seat"]
        # Older rows predate the per-hand seat, so fall back to the current one.
        seat_of = {a["player__user_id"]: (a["seat"] if a["seat"] is not None else a["player__seat_at_table"])
                   for a in actions}
        steal_seats = _steal_positions(set(seat_of.values()), dealer_seat)

        seen = set()
        raises_before = 0
        opened = False  # anyone has voluntarily entered the pot
        faced_raise = {}
        first_in = {}

        for entry in actions:
            user_id = entry["player__user_id"]
            action = entry["action"]

            if user_id not in seen and action not in FORCED:
                # State of the world at this player's first real decision.
                seen.add(user_id)
                faced_raise[user_id] = raises_before > 0
                first_in[user_id] = not opened

            if action == "raise":
                raises_before += 1
                opened = True
            elif action in VOLUNTARY:
                opened = True

        for user_id, seat in seat_of.items():
            if user_id not in wanted:
                continue
            stats = tally[user_id]
            stats["hands"] += 1

            mine = [a["action"] for a in actions if a["player__user_id"] == user_id]
            if any(a in VOLUNTARY for a in mine):
                stats["vpip"] += 1
            if "raise" in mine:
                stats["pfr"] += 1

            if faced_raise.get(user_id):
                stats["three_bet_chances"] += 1
                if "raise" in mine:
                    stats["three_bet"] += 1

            if first_in.get(user_id) and seat in steal_seats:
                stats["ats_chances"] += 1
                if "raise" in mine:
                    stats["ats"] += 1

    return {user_id: _as_percentages(counts) for user_id, counts in tally.items()}


def _empty():
    return {
        "hands": 0, "vpip": 0, "pfr": 0,
        "three_bet": 0, "three_bet_chances": 0,
        "ats": 0, "ats_chances": 0,
    }


def _as_percentages(counts):
    return {
        "hands": counts["hands"],
        "vpip_pct": _percentage(counts["vpip"], counts["hands"]),
        "pfr_pct": _percentage(counts["pfr"], counts["hands"]),
        "three_bet_pct": _percentage(counts["three_bet"], counts["three_bet_chances"]),
        "three_bet_chances": counts["three_bet_chances"],
        "ats_pct": _percentage(counts["ats"], counts["ats_chances"]),
        "ats_chances": counts["ats_chances"],
    }

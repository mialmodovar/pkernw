"""Statistics mined from recorded hand history.

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
- **Fold / call / 4-bet vs a 3-bet**: of the hands where the pot was raised
  twice before their decision, what they did with it. The three shares are over
  the same opportunities, so they read as a breakdown of one decision.
- **Fold / call vs a 4-bet**: the same, one raise deeper.
- **Saw flop**: of the hands they were dealt, the share where they were still
  in and acting on the flop.
- **C-bet**: of the flops they saw as the last preflop raiser, the share where
  they bet first.
- **Fold to c-bet**: of the flops where they faced that bet, the share folded.
- **Aggression**: of their postflop bets, raises and calls, the share that were
  bets or raises. A share rather than the usual bets-per-call ratio, so that a
  player who has never called still has a readable number.
- **Bad beats**: showdowns they lost holding three of a kind or better. Not the
  jackpot definition — nobody here is drawing to aces full — and not "was a
  favourite and lost", which would need the equity at the time and is not
  recorded. It is the count of the hands people actually talk about afterwards.

Percentages are over the opportunities for that statistic, not over all hands,
which is what makes them comparable between players.

Opportunities are counted from recorded actions, so a player who was already
all-in has no decision to make and is not counted as having passed one up.
"""

from collections import defaultdict

from .engine.evaluator import THREE_OF_A_KIND
from .models import Hand, HandAction

# Strong enough that losing with it is a story. Trips rather than the full
# house a casino's jackpot wants: this is a home game, and a counter that never
# moves is not a counter.
BAD_BEAT_FROM = THREE_OF_A_KIND

VOLUNTARY = {"call", "bet", "raise"}
FORCED = {"blind", "ante"}
AGGRESSIVE = {"bet", "raise"}
POSTFLOP_STREETS = ("flop", "turn", "river")
# Cutoff, button and small blind — below three players there is no steal.
MIN_PLAYERS_FOR_STEAL = 3
# Raises in the pot before a decision: one is an open, two is a 3-bet facing
# them, three is a 4-bet.
FACING_THREE_BET = 2
FACING_FOUR_BET = 3


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


def compute_player_stats(user_ids, formats=None):
    """Return {user_id: stats} over every hand those users have played.

    `formats` narrows it to one kind of game — a three-handed Spin n Go and a
    nine-handed tournament are different games and averaging them together
    describes neither. None means all of them, which is what everything asking
    about a player at a table wants.
    """
    user_ids = list(user_ids)
    if not user_ids:
        return {}

    # Every entry of every hand any of these users took part in — the other
    # players' actions are needed to know what each user was facing.
    played = HandAction.objects.filter(player__user_id__in=user_ids, street="preflop")
    if formats is not None:
        played = played.filter(hand__tournament__format__in=formats)
    hand_ids = set(played.values_list("hand_id", flat=True))
    if not hand_ids:
        return {user_id: _empty() for user_id in user_ids}

    rows = list(
        HandAction.objects.filter(hand_id__in=hand_ids)
        .order_by("hand_id", "id")
        .values("hand_id", "player__user_id", "player__seat_at_table", "seat", "street", "action", "hand__dealer_seat")
    )

    by_hand = defaultdict(list)
    for row in rows:
        by_hand[row["hand_id"]].append(row)

    tally = {user_id: _empty() for user_id in user_ids}
    wanted = set(user_ids)
    _count_bad_beats(hand_ids, by_hand, tally, wanted)

    for actions in by_hand.values():
        preflop = [a for a in actions if a["street"] == "preflop"]
        if not preflop:
            continue
        _count_preflop(preflop, tally, wanted)
        _count_postflop(preflop, actions, tally, wanted)

    return {user_id: _as_percentages(counts) for user_id, counts in tally.items()}


def _count_preflop(actions, tally, wanted):
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
    # The first decision each player took against a pot raised two (or three)
    # times: how they answered a 3-bet, and a 4-bet.
    vs_three_bet = {}
    vs_four_bet = {}

    for entry in actions:
        user_id = entry["player__user_id"]
        action = entry["action"]

        if action not in FORCED:
            if user_id not in seen:
                # State of the world at this player's first real decision.
                seen.add(user_id)
                faced_raise[user_id] = raises_before > 0
                first_in[user_id] = not opened
            if raises_before >= FACING_FOUR_BET:
                vs_four_bet.setdefault(user_id, action)
            elif raises_before == FACING_THREE_BET:
                vs_three_bet.setdefault(user_id, action)

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

        answer = vs_three_bet.get(user_id)
        if answer:
            stats["vs_three_bet_chances"] += 1
            if answer == "fold":
                stats["fold_to_three_bet"] += 1
            elif answer == "call":
                stats["call_three_bet"] += 1
            elif answer == "raise":
                stats["four_bet"] += 1

        answer = vs_four_bet.get(user_id)
        if answer:
            stats["vs_four_bet_chances"] += 1
            if answer == "fold":
                stats["fold_to_four_bet"] += 1
            elif answer == "call":
                stats["call_four_bet"] += 1


def _count_postflop(preflop, actions, tally, wanted):
    """Saw-flop, c-bet, fold-to-c-bet and aggression, from one hand."""
    raisers = [a["player__user_id"] for a in preflop if a["action"] == "raise"]
    aggressor = raisers[-1] if raisers else None

    flop = [a for a in actions if a["street"] == "flop"]
    first_flop_action = {}
    for entry in flop:
        first_flop_action.setdefault(entry["player__user_id"], entry["action"])

    # A continuation bet is the preflop raiser betting the flop out of turn to
    # nobody — that is, before anyone else has bet into them.
    cbet_index = None
    if aggressor is not None:
        for index, entry in enumerate(flop):
            if entry["player__user_id"] != aggressor:
                if entry["action"] in AGGRESSIVE:
                    break  # somebody else took the betting lead first
                continue
            if entry["action"] in ("bet", "check"):
                cbet_index = index if entry["action"] == "bet" else None
                if aggressor in wanted:
                    stats = tally[aggressor]
                    stats["cbet_chances"] += 1
                    if entry["action"] == "bet":
                        stats["cbet"] += 1
            break

    if cbet_index is not None:
        # Everyone who had to answer that bet, judged on their first reply.
        answered = set()
        for entry in flop[cbet_index + 1:]:
            user_id = entry["player__user_id"]
            if user_id == aggressor or user_id in answered:
                continue
            answered.add(user_id)
            if user_id in wanted:
                tally[user_id]["fold_to_cbet_chances"] += 1
                if entry["action"] == "fold":
                    tally[user_id]["fold_to_cbet"] += 1

    for user_id in {a["player__user_id"] for a in flop} & wanted:
        tally[user_id]["saw_flop"] += 1

    for entry in actions:
        if entry["street"] not in POSTFLOP_STREETS:
            continue
        user_id = entry["player__user_id"]
        if user_id not in wanted:
            continue
        if entry["action"] in AGGRESSIVE:
            tally[user_id]["postflop_aggressive"] += 1
        elif entry["action"] == "call":
            tally[user_id]["postflop_calls"] += 1


def _count_bad_beats(hand_ids, by_hand, tally, wanted):
    """Showdowns these players lost while holding a big hand.

    Read from the hand's stored result rather than from its actions: who turned
    what over, and who was paid, are both written down when the hand ends. The
    seat is the seat as it was for that hand, which is also what the recorded
    actions carry — a player's seat moves when tables rebalance, so nothing
    here may look at where they are sitting now.
    """
    results = Hand.objects.filter(id__in=hand_ids).values_list("id", "result")
    for hand_id, result in results:
        showdown = (result or {}).get("showdown") or []
        # One entry means everybody else folded: there was no showdown, and
        # winning a pot uncontested is not a beat of any kind.
        if len(showdown) < 2:
            continue
        paid = {award.get("seat") for award in (result or {}).get("awards") or []}
        # Seats belong to the hand, so the mapping comes from the hand's own
        # recorded actions.
        user_by_seat = {
            entry["seat"]: entry["player__user_id"]
            for entry in by_hand.get(hand_id, [])
            if entry["seat"] is not None
        }
        for entry in showdown:
            user_id = user_by_seat.get(entry.get("seat"))
            if user_id not in wanted or entry.get("seat") in paid:
                continue
            score = entry.get("score") or []
            if score and score[0] >= BAD_BEAT_FROM:
                tally[user_id]["bad_beats"] += 1


def _empty():
    return {
        "hands": 0, "vpip": 0, "pfr": 0,
        "three_bet": 0, "three_bet_chances": 0,
        "ats": 0, "ats_chances": 0,
        "fold_to_three_bet": 0, "call_three_bet": 0, "four_bet": 0, "vs_three_bet_chances": 0,
        "fold_to_four_bet": 0, "call_four_bet": 0, "vs_four_bet_chances": 0,
        "saw_flop": 0,
        "cbet": 0, "cbet_chances": 0,
        "fold_to_cbet": 0, "fold_to_cbet_chances": 0,
        "postflop_aggressive": 0, "postflop_calls": 0,
        "bad_beats": 0,
    }


def _as_percentages(counts):
    return {
        "hands": counts["hands"],
        "bad_beats": counts["bad_beats"],
        "vpip_pct": _percentage(counts["vpip"], counts["hands"]),
        "pfr_pct": _percentage(counts["pfr"], counts["hands"]),
        "three_bet_pct": _percentage(counts["three_bet"], counts["three_bet_chances"]),
        "three_bet_chances": counts["three_bet_chances"],
        "ats_pct": _percentage(counts["ats"], counts["ats_chances"]),
        "ats_chances": counts["ats_chances"],
        "fold_to_three_bet_pct": _percentage(counts["fold_to_three_bet"], counts["vs_three_bet_chances"]),
        "call_three_bet_pct": _percentage(counts["call_three_bet"], counts["vs_three_bet_chances"]),
        "four_bet_pct": _percentage(counts["four_bet"], counts["vs_three_bet_chances"]),
        "vs_three_bet_chances": counts["vs_three_bet_chances"],
        "fold_to_four_bet_pct": _percentage(counts["fold_to_four_bet"], counts["vs_four_bet_chances"]),
        "call_four_bet_pct": _percentage(counts["call_four_bet"], counts["vs_four_bet_chances"]),
        "vs_four_bet_chances": counts["vs_four_bet_chances"],
        "saw_flop_pct": _percentage(counts["saw_flop"], counts["hands"]),
        "cbet_pct": _percentage(counts["cbet"], counts["cbet_chances"]),
        "cbet_chances": counts["cbet_chances"],
        "fold_to_cbet_pct": _percentage(counts["fold_to_cbet"], counts["fold_to_cbet_chances"]),
        "fold_to_cbet_chances": counts["fold_to_cbet_chances"],
        "aggression_pct": _percentage(
            counts["postflop_aggressive"],
            counts["postflop_aggressive"] + counts["postflop_calls"],
        ),
        "postflop_actions": counts["postflop_aggressive"] + counts["postflop_calls"],
    }

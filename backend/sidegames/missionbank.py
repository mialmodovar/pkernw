"""Paying a mission, once.

The two halves of missions.py and missiontally.py meet here, along with the one
thing that has to be careful: a reward is coins, and coins paid twice are coins
invented. Every guard against that is a database row rather than a check —
`select_for_update` on nothing would be no guard at all, since the first claim
may not exist yet, so it is the unique constraint on (user, mission, period)
that decides, and the transaction that rolls the payment back when it loses.
"""

from django.db import IntegrityError, transaction
from django.utils import timezone

from .economy import grant
from .missions import DAILY, WEEKLY, board, clean_key, period_key, progress_of, window
from .missiontally import counts_for
from .models import MissionClaim


def _both_windows(user, when):
    """Today's tally and this week's, which is two queries and no more."""
    day_start, day_end = window(DAILY, when)
    week_start, week_end = window(WEEKLY, when)
    return counts_for(user, day_start, day_end), counts_for(user, week_start, week_end)


def _claimed_periods(user):
    return set(MissionClaim.objects.filter(user=user).values_list("mission", "period"))


def mission_board(user, when=None):
    """Every mission, with this player's progress and what they have taken."""
    at = when or timezone.now()
    daily, weekly = _both_windows(user, at)
    return board(daily, weekly, _claimed_periods(user), at)


def claim_mission(user, key, when=None):
    """Pay a finished mission. Returns (wallet, coins), or a string saying why not.

    The progress is recounted here rather than trusted from whatever the client
    last drew: the board it is looking at may be minutes old, and a mission is
    money.
    """
    mission = clean_key(key)
    if mission is None:
        return "No such mission."

    at = when or timezone.now()
    daily, weekly = _both_windows(user, at)
    counts = daily if mission["period"] == DAILY else weekly
    if progress_of(mission, counts) < mission["target"]:
        return "Not finished yet."

    period = period_key(mission["period"], at)
    try:
        with transaction.atomic():
            # The row first. If this is a second tap it raises, the transaction
            # unwinds, and the coins that would have been granted below never
            # existed — which is the ordering that matters.
            MissionClaim.objects.create(
                user=user, mission=mission["key"], period=period, coins=mission["coins"],
            )
            wallet = grant(
                user, mission["coins"], "mission",
                memo=f"mission:{mission['key']}:{period}",
            )
    except IntegrityError:
        return "Already claimed."

    return wallet, mission["coins"]


__all__ = ["claim_mission", "mission_board", "DAILY", "WEEKLY"]

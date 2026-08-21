from django.contrib.auth import get_user_model
from django.db.models import Min, Q, Sum
from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from game.besthand import best_of
from game.hand_stats import compute_player_stats
from game.models import Hand, HandAction
from tournaments.models import LedgerEntry, TournamentPlayer

from .avatars import avatar_url
from .naming import shown_name
from .models import AvatarImage, Profile
from .watching import presence

User = get_user_model()


# Which Tournament.format rows each answer covers. A Spin n Go, a Sit n Go and
# somebody's Friday night are three different games — three-handed for five
# minutes, six-handed for fifteen, and nine-handed for an evening — and a single
# average across all of them describes none of them.
STAT_SCOPES = {
    "all": None,
    "tournaments": ("standard",),
    "spingo": ("spingo",),
    "sitngo": ("sitngo",),
}
DEFAULT_SCOPE = "all"


def clean_scope(value) -> str:
    """One of ours, or everything. Nothing else reaches a query."""
    text = str(value or "").strip()
    return text if text in STAT_SCOPES else DEFAULT_SCOPE


def player_summary(user, scope=DEFAULT_SCOPE):
    """The record one player has, whoever is asking.

    Shared by "my stats" and by looking somebody up, so the two can never
    disagree about what a cash or a best finish is.
    """
    formats = STAT_SCOPES[clean_scope(scope)]

    tps = TournamentPlayer.objects.filter(user=user).select_related("tournament")
    if formats is not None:
        tps = tps.filter(tournament__format__in=formats)

    tournaments_played = tps.count()
    best_finish = tps.exclude(finish_position__isnull=True).aggregate(Min("finish_position"))["finish_position__min"]
    total_rebuys = tps.aggregate(Sum("rebuy_count"))["rebuy_count__sum"] or 0
    cashes = sum(
        1 for tp in tps
        if tp.finish_position and tp.tournament.payout_structure
        and tp.finish_position <= len(tp.tournament.payout_structure)
    )
    # In the money, out of the nights that actually finished. Counting a
    # tournament still in play against you would make the number drop every
    # time you sat down and climb again when you busted.
    completed = sum(1 for tp in tps if tp.finish_position)

    # What they have taken home, placings and bounties together. Not net —
    # what a buy-in cost is the settlement ledger's business, and it has a
    # panel of its own.
    won = LedgerEntry.objects.filter(user=user)
    if formats is not None:
        won = won.filter(tournament__format__in=formats)
    winnings_cents = won.aggregate(Sum("prize_cents"))["prize_cents__sum"] or 0

    # Preflop reads come from the shared miner, so the lobby and the table can
    # never disagree about what VPIP means.
    preflop = compute_player_stats([user.id], formats=formats).get(user.id, {})

    return {
        "scope": clean_scope(scope),
        "tournaments_played": tournaments_played,
        "best_finish": best_finish,
        "cashes": cashes,
        "tournaments_completed": completed,
        "itm_pct": round(cashes * 100 / completed) if completed else 0,
        "winnings_cents": winnings_cents,
        "best_hand": best_showdown_hand(user, formats=formats),
        "total_rebuys": total_rebuys,
        "hands_played": preflop.get("hands", 0),
        # Everything the miner knows, so a player can read the same numbers
        # about themselves that the table shows about everyone else.
        **preflop,
    }


def best_showdown_hand(user, formats=None):
    """The best hand this player has ever turned over.

    Only hands that reached a showdown, which is the only place a hand is
    written down at all — a monster that everyone folded to was never seen and
    is not on record anywhere.

    Two queries: which seat they were in for each of those hands, then the
    hands themselves. The seat has to come from the actions because a player's
    seat_at_table moves when tables rebalance, so the seat they showed down in
    is not the seat they are in now.
    """
    shown = HandAction.objects.filter(
        player__user=user, hand__status="complete", hand__result__has_key="showdown",
    )
    if formats is not None:
        shown = shown.filter(hand__tournament__format__in=formats)

    seats = {}
    for hand_id, seat in shown.values_list("hand_id", "seat"):
        seats.setdefault(hand_id, seat)

    if not seats:
        return None

    mine = []
    for hand in (
        Hand.objects
        .filter(id__in=seats.keys())
        .select_related("tournament")
        .only("id", "hand_number", "community_cards", "result", "started_at",
              "tournament__id", "tournament__name")
    ):
        seat = seats.get(hand.id)
        entry = next(
            (one for one in (hand.result or {}).get("showdown", []) if one.get("seat") == seat),
            None,
        )
        if entry:
            mine.append({**entry, "_hand": hand})

    best = best_of(mine)
    if best is None:
        return None

    hand = best["_hand"]
    return {
        "hand_id": hand.id,
        "hand_number": hand.hand_number,
        "seat": best.get("seat"),
        "name": best.get("hand_name"),
        "cards": best.get("cards") or [],
        "best_cards": best.get("best_cards") or [],
        "community_cards": hand.community_cards or [],
        "tournament_id": hand.tournament_id,
        "tournament_name": hand.tournament.name,
        "played_at": hand.started_at,
    }


def recent_results(user, limit=5):
    """The last few nights, newest first."""
    tps = (
        TournamentPlayer.objects
        .filter(user=user, tournament__status="finished")
        .select_related("tournament")
        .order_by("-tournament__created_at")[:limit]
    )
    prizes = dict(
        LedgerEntry.objects
        .filter(user=user, tournament__in=[tp.tournament_id for tp in tps])
        .values_list("tournament_id", "prize_cents")
    )
    return [
        {
            "tournament_id": tp.tournament_id,
            "name": tp.tournament.name,
            "played_at": tp.tournament.created_at,
            "finish_position": tp.finish_position,
            "entrants": tp.tournament.players.count(),
            "prize_cents": prizes.get(tp.tournament_id, 0),
        }
        for tp in tps
    ]


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def my_stats(request):
    # ?game=all|tournaments|spingo|sitngo. Anything else reads as all, because
    # a stats panel is not worth a 400.
    return Response(player_summary(request.user, request.query_params.get("game")))


def shared_clubs(viewer, user):
    """The clubs of theirs this viewer is allowed to know about.

    A public club is public. A private one is only mentioned to somebody
    already in it — otherwise a profile card would announce the existence of
    every private club its owner has ever joined, which is the one thing
    private means.
    """
    from clubs.models import Club

    return [
        {"name": club.name, "slug": club.slug, "emoji": club.emoji}
        for club in Club.objects
        .filter(memberships__user=user)
        .filter(Q(is_public=True) | Q(memberships__user=viewer))
        .distinct()
        .order_by("name")
    ]


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def player_profile(request, username):
    """Somebody else's record: the same figures, plus their last few nights."""
    user = get_object_or_404(User, username=username)
    profile, _ = Profile.objects.get_or_create(user=user)
    stamp = (
        AvatarImage.objects.filter(user_id=user.id).values_list("updated_at", flat=True).first()
    )
    return Response({
        "username": user.username,
        "display_name": shown_name(user.username, profile.display_name),
        "avatar_emoji": profile.avatar_emoji,
        "avatar_url": avatar_url(user.id, stamp),
        "is_watched": request.user.watching.filter(watched=user).exists(),
        # Where they are right now, so the card can offer to take you there
        # rather than only say how they did last month.
        **presence([user.id])[user.id],
        "clubs": shared_clubs(request.user, user),
        "stats": player_summary(user),
        "recent": recent_results(user),
    })

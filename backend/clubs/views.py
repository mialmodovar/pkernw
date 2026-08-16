"""Clubs, their leagues, their seasons, and the tables those seasons produce.

Function views with @api_view, like tournaments/views.py, and the same idiom
for authority: fetch, then check, then act.
"""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import Club, League, Membership, Season
from .permissions import is_club_owner, is_club_staff, role_in
from .scoring import club_standings, normalize_scheme, standings
from .serializers import (
    ClubDetailSerializer,
    ClubListSerializer,
    ClubWriteSerializer,
    LeagueSerializer,
    SeasonSerializer,
)

REFUSED = status.HTTP_403_FORBIDDEN


def _staff_only(user, club):
    """None when they may organise, or the response refusing them."""
    if is_club_staff(user, club):
        return None
    return Response({"error": "Only club staff can do that."}, status=REFUSED)


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def clubs(request):
    if request.method == "POST":
        serializer = ClubWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        club = Club.objects.create(created_by=request.user, **serializer.validated_data)
        # Whoever opens a club runs it, and is in it — a club with no members
        # is not a thing anybody wants to have made by accident.
        Membership.objects.create(club=club, user=request.user, role=Membership.OWNER)
        return Response(
            ClubDetailSerializer(club, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    # Yours, plus anything open to join. A private club you are not in is not
    # listed at all: it is found with its code or not at all.
    visible = Club.objects.filter(
        Q(is_public=True) | Q(memberships__user=request.user)
    ).distinct()
    return Response(ClubListSerializer(visible, many=True, context={"request": request}).data)


@api_view(["GET", "PATCH"])
@permission_classes([permissions.IsAuthenticated])
def club_detail(request, slug):
    club = get_object_or_404(Club, slug=slug)

    if request.method == "PATCH":
        refusal = _staff_only(request.user, club)
        if refusal:
            return refusal
        serializer = ClubWriteSerializer(club, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

    if not club.is_public and role_in(request.user, club) is None and not request.user.is_staff:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    return Response(ClubDetailSerializer(club, context={"request": request}).data)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def club_leaderboard(request, slug):
    """The club's all-time table, across every league and season it has run."""
    club = get_object_or_404(Club, slug=slug)
    if not club.is_public and role_in(request.user, club) is None:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
    return Response({"rows": club_standings(club)})


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def club_tournaments(request, slug):
    """What the club has run, newest first.

    Finished nights with their winner, and whatever is coming up — the history
    and the diary are the same list read from opposite ends.
    """
    club = get_object_or_404(Club, slug=slug)
    if not club.is_public and role_in(request.user, club) is None:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    tournaments = (
        club.tournaments
        .select_related("season__league")
        .prefetch_related("players__user")
        .order_by("-created_at")[:25]
    )

    rows = []
    for tournament in tournaments:
        seats = list(tournament.players.all())
        winner = next((seat for seat in seats if seat.finish_position == 1), None)
        rows.append({
            "id": tournament.id,
            "name": tournament.name,
            "status": tournament.status,
            "played_at": tournament.started_at or tournament.created_at,
            "entrants": len(seats),
            "league_name": tournament.season.league.name if tournament.season_id else None,
            "winner": winner.user.username if winner else None,
        })
    return Response(rows)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def join_by_code(request):
    code = str(request.data.get("code") or "").strip().upper()
    club = Club.objects.filter(invite_code__iexact=code).first()
    if not code or club is None:
        return Response({"error": "No club with that code."}, status=status.HTTP_404_NOT_FOUND)
    Membership.objects.get_or_create(club=club, user=request.user)
    return Response(ClubDetailSerializer(club, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def join_club(request, slug):
    club = get_object_or_404(Club, slug=slug)
    if not club.is_public:
        return Response(
            {"error": "This club is private — you need its invite code."},
            status=REFUSED,
        )
    Membership.objects.get_or_create(club=club, user=request.user)
    return Response(ClubDetailSerializer(club, context={"request": request}).data)


@api_view(["DELETE"])
@permission_classes([permissions.IsAuthenticated])
def leave_club(request, slug):
    club = get_object_or_404(Club, slug=slug)
    membership = club.memberships.filter(user=request.user).first()
    if membership is None:
        return Response(status=status.HTTP_204_NO_CONTENT)
    if membership.role == Membership.OWNER and club.memberships.count() > 1:
        # A club with members and no owner is one nobody can run.
        return Response(
            {"error": "Make somebody else the owner before you leave."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    membership.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["PATCH", "DELETE"])
@permission_classes([permissions.IsAuthenticated])
def member(request, slug, username):
    """Promote, demote, hand over, or remove. Owners only."""
    club = get_object_or_404(Club, slug=slug)
    if not is_club_owner(request.user, club):
        return Response({"error": "Only the club owner can do that."}, status=REFUSED)

    membership = get_object_or_404(club.memberships, user__username__iexact=username)

    if request.method == "DELETE":
        if membership.role == Membership.OWNER:
            return Response(
                {"error": "Hand the club over before removing the owner."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    role = str(request.data.get("role") or "").strip()
    if role not in dict(Membership.ROLE_CHOICES):
        return Response({"error": "Unknown role."}, status=status.HTTP_400_BAD_REQUEST)

    if role == Membership.OWNER:
        # Handing over rather than adding a second owner: one club, one person
        # who can hand it on again.
        club.memberships.filter(role=Membership.OWNER).update(role=Membership.STAFF)
    membership.role = role
    membership.save(update_fields=["role"])
    return Response(ClubDetailSerializer(club, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def create_league(request, slug):
    club = get_object_or_404(Club, slug=slug)
    refusal = _staff_only(request.user, club)
    if refusal:
        return refusal

    name = str(request.data.get("name") or "").strip()
    if len(name) < 2:
        return Response({"error": "Give the league a name."}, status=status.HTTP_400_BAD_REQUEST)

    league = League.objects.create(
        club=club,
        name=name[:60],
        emoji=str(request.data.get("emoji") or "\U0001F3C6")[:8],
        description=str(request.data.get("description") or "")[:200],
    )
    # A league with no season has nowhere to put a result, so it opens with one.
    Season.objects.create(
        league=league,
        name=str(request.data.get("season_name") or "Season 1")[:60],
        scoring=normalize_scheme(request.data.get("scoring")),
    )
    return Response(LeagueSerializer(league).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def league_standings(request, league_id):
    league = get_object_or_404(League.objects.select_related("club"), pk=league_id)
    if not league.club.is_public and role_in(request.user, league.club) is None:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    season_id = request.query_params.get("season")
    season = (
        get_object_or_404(league.seasons, pk=season_id) if season_id
        else league.open_season or league.seasons.first()
    )
    if season is None:
        return Response({"error": "This league has no seasons."}, status=status.HTTP_404_NOT_FOUND)

    return Response({
        "league": LeagueSerializer(league).data,
        "club": {"name": league.club.name, "slug": league.club.slug, "emoji": league.club.emoji},
        "season": SeasonSerializer(season).data,
        "rows": standings(season),
    })


@api_view(["PATCH"])
@permission_classes([permissions.IsAuthenticated])
def season_detail(request, season_id):
    season = get_object_or_404(Season.objects.select_related("league__club"), pk=season_id)
    refusal = _staff_only(request.user, season.league.club)
    if refusal:
        return refusal
    if not season.is_open:
        # A closed season is a record of what happened under the rules it was
        # played under. Editing those rules would restate a finished table.
        return Response(
            {"error": "That season is closed."}, status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = SeasonSerializer(season, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def next_season(request, league_id):
    """Close what is running and open the next, carrying the rules forward."""
    league = get_object_or_404(League.objects.select_related("club"), pk=league_id)
    refusal = _staff_only(request.user, league.club)
    if refusal:
        return refusal

    current = league.open_season
    if current is not None:
        current.closed_at = timezone.now()
        current.save(update_fields=["closed_at"])

    season = Season.objects.create(
        league=league,
        name=str(request.data.get("name") or "").strip()[:60] or f"Season {league.seasons.count() + 1}",
        # Copied, not referenced: last season stays scored the way it was played.
        scoring=normalize_scheme(current.scoring if current else None),
        prizes=(current.prizes if current else []),
    )
    return Response(SeasonSerializer(season).data, status=status.HTTP_201_CREATED)

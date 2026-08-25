"""What a night is worth on a league table.

Pure functions over plain numbers — no Django, no database — so "how many
points is second place worth" is a question that can be asked and tested
without a tournament existing. Same shape as tournaments/bounties.py.

A scheme is a dict, stored on the season that was played under it:

    {"preset": "placement_ko",
     "placement": [10, 7, 5, 3, 2],   # 1st, 2nd, 3rd ...
     "rest": 1,                        # everybody who finished below that
     "per_knockout": 2,
     "attendance": 1}                  # for turning up at all

Points are integers. A league table people read down a phone screen is not
improved by decimals, and nobody has ever argued about a half point they liked.
"""

PRESETS = {
    # Where you came, and nothing else. The classic home-game table.
    "placement_only": {
        "preset": "placement_only",
        "placement": [10, 7, 5, 3, 2],
        "rest": 1,
        "per_knockout": 0,
        "attendance": 0,
    },
    # Rewards busting people as well as outlasting them, which is the reason
    # to play a knockout format in the first place.
    "placement_ko": {
        "preset": "placement_ko",
        "placement": [10, 7, 5, 3, 2],
        "rest": 1,
        "per_knockout": 2,
        "attendance": 1,
    },
}

DEFAULT_PRESET = "placement_ko"


def normalize_scheme(scheme):
    """Fill in whatever a stored or submitted scheme is missing.

    A scheme read back from an old row, or typed by hand, must never be able to
    crash a table that people are looking at — so every field falls back rather
    than raising, and a preset nobody recognises becomes the default.
    """
    base = dict(PRESETS.get((scheme or {}).get("preset"), PRESETS[DEFAULT_PRESET]))
    if not isinstance(scheme, dict):
        return base

    placement = scheme.get("placement")
    if isinstance(placement, list) and placement:
        base["placement"] = [_whole(value) for value in placement[:10]]
    for field in ("rest", "per_knockout", "attendance"):
        if field in scheme:
            base[field] = _whole(scheme[field])
    # A scheme whose numbers no longer match the preset it names is a custom
    # one, whatever it says — and the editor shows it as such.
    named = PRESETS.get(scheme.get("preset"))
    base["preset"] = scheme.get("preset") if named is None else (
        scheme["preset"] if _same_numbers(base, named) else "custom"
    )
    if base["preset"] not in PRESETS:
        base["preset"] = "custom"
    return base


def _whole(value):
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _same_numbers(left, right):
    return all(left.get(field) == right.get(field)
               for field in ("placement", "rest", "per_knockout", "attendance"))


def points_for(result, scheme):
    """One player's night.

    `result` is `{"finish_position": int|None, "knockouts": int}`. A player with
    no finish position did not finish the tournament — they are still seated, or
    it never ended — and scores nothing at all rather than scoring as last.
    """
    scheme = normalize_scheme(scheme)
    finish = (result or {}).get("finish_position")
    if not finish or finish < 1:
        return 0

    placement = scheme["placement"]
    points = placement[finish - 1] if finish <= len(placement) else scheme["rest"]
    points += scheme["attendance"]
    points += scheme["per_knockout"] * max(0, (result or {}).get("knockouts") or 0)
    return points


def standings(season):
    """The table, worked out from the results rather than kept alongside them.

    Read fresh every time. A season is a few hundred rows, which is the scale
    accounts/stats.py already aggregates per request, and a stored points column
    is a column that can disagree with the tournaments underneath it.
    """
    # Imported here so this module stays importable without Django configured,
    # which is what makes the arithmetic above testable on its own.
    from accounts.naming import shown_name
    from tournaments.models import LedgerEntry, TournamentPlayer

    scheme = normalize_scheme(season.scoring)
    seats = (
        TournamentPlayer.objects
        .filter(tournament__season=season, tournament__status="finished")
        .select_related("user", "user__profile", "tournament")
    )

    ledger = dict(
        LedgerEntry.objects
        .filter(tournament__season=season)
        .values_list("user_id", "prize_cents")
    )
    stakes = dict(
        LedgerEntry.objects
        .filter(tournament__season=season)
        .values_list("user_id", "stake_cents")
    )

    rows = {}
    for seat in seats:
        row = rows.setdefault(seat.user_id, {
            "username": seat.user.username,
            # What to put in front of other players, the same way every other
            # list in the app decides it.
            "display_name": shown_name(
                seat.user.username, getattr(getattr(seat.user, "profile", None), "display_name", ""),
            ),
            "points": 0,
            "played": 0,
            "wins": 0,
            "cashes": 0,
            "knockouts": 0,
            "net_cents": 0,
        })
        row["played"] += 1
        row["points"] += points_for(
            {"finish_position": seat.finish_position, "knockouts": seat.knockouts},
            scheme,
        )
        row["knockouts"] += seat.knockouts or 0
        if seat.finish_position == 1:
            row["wins"] += 1
        paid = len(seat.tournament.payout_structure or [])
        if seat.finish_position and paid and seat.finish_position <= paid:
            row["cashes"] += 1

    for user_id, row in rows.items():
        row["net_cents"] = ledger.get(user_id, 0) - stakes.get(user_id, 0)

    # Points first, then who actually won nights — two players level on points
    # are not level if one of them keeps winning.
    return sorted(
        rows.values(),
        key=lambda row: (-row["points"], -row["wins"], -row["knockouts"], row["username"]),
    )


def club_standings(club):
    """Every night the club has ever run, added up.

    A season table answers "who is winning right now"; this answers "who is the
    best player in this club", which is a different question and the one people
    argue about.

    Every night, and that is the point of it: this used to add up the seasons,
    so a club's own table only knew about games somebody had thought to attach
    to a league. Most home games are not a league — they are Thursday — and
    those nights were played at the club, counted for nothing, and left the
    table saying a club with fifty nights behind it had never played.

    A night in a season is still scored under that season's rules, because that
    is what those rules were for. A night with no season is scored under the
    default scheme, which is the one a league starts with — so the two kinds of
    night are comparable rather than one of them being worth more for having
    paperwork.
    """
    from accounts.naming import shown_name
    from tournaments.models import LedgerEntry, TournamentPlayer

    seats = (
        TournamentPlayer.objects
        .filter(tournament__club=club, tournament__status="finished")
        .select_related("user", "user__profile", "tournament", "tournament__season")
    )
    # One query for the money rather than one per night. Both halves of it: what
    # a player took out of the club and what they put in.
    ledger = (
        LedgerEntry.objects
        .filter(tournament__club=club)
        .values_list("user_id", "prize_cents", "stake_cents")
    )
    net = {}
    for user_id, prize, stake in ledger:
        net[user_id] = net.get(user_id, 0) + (prize or 0) - (stake or 0)

    # Cached per season, since a club with one league has one scheme and this
    # would otherwise normalise it once per seat.
    schemes = {}

    rows = {}
    seasons_seen = {}
    for seat in seats:
        season = seat.tournament.season
        key = season.id if season else None
        if key not in schemes:
            schemes[key] = normalize_scheme(season.scoring if season else None)

        row = rows.setdefault(seat.user_id, {
            "username": seat.user.username,
            "display_name": shown_name(
                seat.user.username,
                getattr(getattr(seat.user, "profile", None), "display_name", ""),
            ),
            "points": 0,
            "played": 0,
            "wins": 0,
            "cashes": 0,
            "knockouts": 0,
            "net_cents": 0,
            "seasons": 0,
        })
        row["played"] += 1
        row["points"] += points_for(
            {"finish_position": seat.finish_position, "knockouts": seat.knockouts},
            schemes[key],
        )
        row["knockouts"] += seat.knockouts or 0
        if seat.finish_position == 1:
            row["wins"] += 1
        paid = len(seat.tournament.payout_structure or [])
        if seat.finish_position and paid and seat.finish_position <= paid:
            row["cashes"] += 1
        if season is not None:
            seasons_seen.setdefault(seat.user_id, set()).add(season.id)

    for user_id, row in rows.items():
        row["net_cents"] = net.get(user_id, 0)
        # Seasons played, which is what it always meant: a night outside a
        # league is a night, not a season, and counting it as one would make
        # this column say a club runs more leagues than it does.
        row["seasons"] = len(seasons_seen.get(user_id, ()))

    return sorted(
        rows.values(),
        key=lambda row: (-row["points"], -row["wins"], -row["knockouts"], row["username"]),
    )

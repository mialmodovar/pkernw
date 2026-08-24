"""Keeping the payout structure in step with the field.

A share of the field is an intention; the structure is what it comes to, and
what it comes to changes every time somebody registers or gives their seat up.
So it is recomputed at those moments rather than at creation — which is where it
used to be worked out, from the player cap, once and forever.

Recomputed only while registration is open. After that the structure is what the
night is being played for, and a field that grows by a late arrival cannot move
the money somebody has already busted out of.
"""

from .payouts import structure_for


def registration_is_open(tournament) -> bool:
    """Whether anybody can still join, and so whether the field can still grow.

    The lobby, always. A running tournament only while late registration is —
    which the live engine is the only thing that knows, so this asks it.
    """
    if tournament.status == "lobby":
        return True
    from game.consumers import late_registration_open

    return late_registration_open(tournament)


def field_size(tournament) -> int:
    """How many have registered. Rebuys are not entries: buying back in is the
    same player again, and the places paid follow the field rather than the
    money."""
    return tournament.players.count()


def refresh_payouts(tournament, *, save=True) -> bool:
    """Recompute the structure from the field. True when it changed.

    Does nothing at all for a tournament whose structure was written out by
    hand, which is every tournament made before shares existed.
    """
    share = tournament.payout_share_pct or 0
    if share <= 0 or not registration_is_open(tournament):
        return False

    structure = structure_for(field_size(tournament), share)
    if structure == tournament.payout_structure:
        return False

    tournament.payout_structure = structure
    if save:
        tournament.save(update_fields=["payout_structure"])
    return True

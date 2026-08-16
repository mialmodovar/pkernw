"""Who may do what inside a club.

A ladder, not a set of flags: an owner can do anything staff can. Site staff
(`is_staff`) sit above all of it — they run the installation, not a community —
and the superuser sits above them, whatever their other flags say.
"""

from .models import Membership


def _runs_the_place(user):
    """Site staff, or the superuser. Neither is a member of anything."""
    if not user or not user.is_authenticated:
        return False
    # A superuser is normally staff as well, but the flags are separate and a
    # superuser with the staff box unticked still owns the installation.
    return bool(user.is_staff or user.is_superuser)


def role_in(user, club):
    """`owner`, `staff`, `member`, or None for somebody who is not in it."""
    if not user or not user.is_authenticated or club is None:
        return None
    membership = club.memberships.filter(user=user).first()
    return membership.role if membership else None


def is_member(user, club):
    return role_in(user, club) is not None


def is_club_staff(user, club):
    """May organise: create tournaments, run leagues, edit the club."""
    if _runs_the_place(user):
        return True
    return role_in(user, club) in (Membership.OWNER, Membership.STAFF)


def is_club_owner(user, club):
    """May change who else is staff, and hand the club over."""
    if _runs_the_place(user):
        return True
    return role_in(user, club) == Membership.OWNER


def staffs_any_club(user):
    """Used by the tournament-creation gate, which runs before any club is
    named — the specific club is checked when the payload is validated."""
    if not user or not user.is_authenticated:
        return False
    return Membership.objects.filter(
        user=user, role__in=[Membership.OWNER, Membership.STAFF],
    ).exists()

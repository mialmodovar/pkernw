"""Who may do what inside a club.

A ladder, not a set of flags: an owner can do anything staff can, and staff
anything a member can. Above all of it, and only there, sits the superuser.

`is_staff` is deliberately NOT on that ladder. Staff is a job — it opens
tournaments — and it is handed out to everybody who hosts a game, which is most
of the room. Treating it as "runs the installation" gave every host the
organiser's controls over every other club: a table of staff accounts could all
edit and pause a club night that was none of theirs. Whoever administers the
installation is the superuser, and that is one account.
"""

from .models import Membership


def _owns_the_installation(user):
    """The superuser, who is a member of nothing and may do anything.

    Not `is_staff`: see the note at the top of this file. A superuser normally
    has the staff box ticked as well, but the flags are separate and it is this
    one that means ownership.
    """
    if not user or not user.is_authenticated:
        return False
    return bool(user.is_superuser)


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
    if _owns_the_installation(user):
        return True
    return role_in(user, club) in (Membership.OWNER, Membership.STAFF)


def is_club_owner(user, club):
    """May change who else is staff, and hand the club over."""
    if _owns_the_installation(user):
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

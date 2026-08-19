from rest_framework import permissions


def is_superuser(user):
    """The account that owns the installation.

    Kept apart from `is_staff` on purpose. Staff is a job — it opens
    tournaments and runs clubs — while a superuser is whoever administers the
    whole thing, and there is no room above them to appeal to when a night goes
    wrong at two in the morning. They get the host's controls everywhere.
    """
    return bool(user and user.is_authenticated and user.is_superuser)


def can_manage_tournament(user, tournament):
    """Whether this person may run this tournament: start, pause, resume, skip
    a level, edit it, delete it.

    Three ways in. Whoever created it, obviously. Anybody who helps run the club
    whose night it is — staff or owner of THAT club — because a co-organiser
    should be able to start the game when the host is stuck in traffic. And the
    superuser, over anything at all, including a tournament with no club behind
    it.

    Being `is_staff` is not one of the three. Staff is what lets you open a
    tournament of your own; it used to reach through `is_club_staff` into every
    club on the installation, which meant every host could edit and pause
    everybody else's club night. See the note in clubs/permissions.py.
    """
    if tournament is None or not (user and user.is_authenticated):
        return False
    # Nobody runs a Spin n Go. The host column points at whoever sat down first
    # because the database needs it to point somewhere, and that must not hand
    # them a pause button over two strangers' game — or a delete button over a
    # prize pool three people paid into. Not even the superuser: there is
    # nothing to intervene in that outliving the format's five minutes.
    if tournament.format == "spingo":
        return False
    if is_superuser(user):
        return True
    if tournament.host_id == user.id:
        return True
    # Imported here rather than at the top: clubs imports from tournaments in
    # places, and this is the edge that would close the loop.
    from clubs.permissions import is_club_staff

    return bool(tournament.club_id and is_club_staff(user, tournament.club))


class StaffCreatesTournaments(permissions.BasePermission):
    """Anyone signed in can browse and join; only staff can open a tournament.

    Running a tournament means setting stakes and blind structures and, with the
    debt ledger, real money between people — so it is deliberately not something
    every registered account can do. Staff is granted in the Django admin by a
    superuser.
    """

    message = "Only staff can create tournaments."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        # Site staff run the installation; club staff run their own community.
        # Which club is being organised for is not visible here, so this only
        # asks whether they organise anywhere — the serializer checks that the
        # club in the payload is one of theirs.
        from clubs.permissions import staffs_any_club

        # A superuser whose staff flag has been turned off is still the person
        # who owns the installation, and saying no to them here would be a
        # lock they hold the key to.
        if is_superuser(request.user):
            return True
        return bool(request.user.is_staff) or staffs_any_club(request.user)

from rest_framework import permissions


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

        return bool(request.user.is_staff) or staffs_any_club(request.user)

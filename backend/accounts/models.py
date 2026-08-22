from django.conf import settings
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    avatar_emoji = models.CharField(max_length=8, default="🃏")

    # What other players read. Blank means "use the username", which is what
    # every account started with — see accounts/naming.py. Deliberately NOT the
    # username itself: that keys the hand history, the ledger and every stats
    # lookup, and renaming it would quietly rewrite who won last April.
    display_name = models.CharField(max_length=24, blank=True, default="")

    # How this player wants the app skinned: {"preset": "burgundy", "accent": "#8a1c2b"}.
    # Deliberately a blob rather than columns — the set of tokens a preset can
    # move is a frontend concern, and it will grow. The server only cares that
    # the preset is one it knows and the accent is a colour (see the serializer);
    # an empty dict means "whatever the frontend calls default".
    theme = models.JSONField(default=dict, blank=True)

    # How this player wants a table to read: {"show_bb": true}. Kept on the
    # account rather than in the browser, because "chips or blinds" is a way of
    # thinking about a stack and not a property of the machine you happen to be
    # sitting at — set it once and every table, on every device, reads that way.
    # A blob for the same reason the theme is one: what a table can be asked to
    # show is a frontend concern and will grow.
    preferences = models.JSONField(default=dict, blank=True)

    # When this player last had the app open, written when their last socket
    # closes. Kept in the database and not only in memory (see presence.py)
    # because it decides whether somebody's seat is given up on their behalf:
    # a restart empties the in-memory record, and without this every absent
    # registration would be safe until the player came back and left again —
    # which is exactly the case the sweep exists for.
    last_seen = models.DateTimeField(null=True, blank=True)

    # How somebody gets back in when they have forgotten their password. Hashed
    # like a password, because that is exactly what it is — see
    # accounts/recovery.py for why this app has one at all rather than sending
    # an email. Blank for accounts made before it existed; they can generate one
    # from their settings whenever they like.
    recovery_code_hash = models.CharField(max_length=128, blank=True, default="")

    def __str__(self):
        return f"{self.user.username}'s profile"


class Watch(models.Model):
    """One player keeping an eye on another.

    Deliberately one-directional and unannounced: watching somebody is a note
    to yourself about whose results you care about, not a request they have to
    accept or a thing they are told about. The only person who ever sees your
    list is you.
    """

    watcher = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="watching",
    )
    watched = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="watchers",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("watcher", "watched")]
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.watcher.username} watches {self.watched.username}"


class AvatarImage(models.Model):
    """A picture a player uploaded, instead of one of the emoji.

    Held in the database rather than on disk. The container's filesystem is
    wiped on every deploy — the same reason settings.py refuses to fall back to
    SQLite — and an avatar that silently disappears on a Tuesday is worse than
    one that costs a few kilobytes of row. It is a table of its own so that the
    bytes are only ever loaded by the view that serves them: every other read of
    a profile, including the one behind every hand of poker, stays cheap.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="avatar_image",
    )
    data = models.BinaryField()
    # Sniffed from the bytes on upload, never taken from the request — see
    # accounts/avatars.py.
    content_type = models.CharField(max_length=32)
    # Doubles as the cache-busting stamp in the avatar's URL.
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s avatar"

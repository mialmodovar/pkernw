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

    # The ring drawn around this player's face, bought with coins. Blank is the
    # plain one everybody starts with. Kept on the profile rather than in the
    # theme blob beside it, because a theme is how *you* see the app and this is
    # how everybody else sees you — it travels with every seat payload.
    avatar_border = models.CharField(max_length=16, blank=True, default="")

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

    # The other way back in: a Google account vouching for who somebody is.
    # Blank for everybody who has not connected one, which is every account
    # made before this existed.
    #
    # The `sub` claim rather than the email address, because that is what
    # Google means by "the same account next time" — an address can change
    # hands and be renamed, and matching on one would eventually hand somebody
    # a seat that was not theirs. Unique among the accounts that have one, so
    # one Google identity can never be two accounts here.
    google_sub = models.CharField(max_length=64, blank=True, default="")
    # Kept only to show whose it is: "connected as ana@example.com" is the
    # whole of what anybody needs to see about it.
    google_email = models.CharField(max_length=254, blank=True, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["google_sub"],
                condition=~models.Q(google_sub=""),
                name="one_account_per_google_identity",
            ),
        ]

    def __str__(self):
        return f"{self.user.username}'s profile"


class Friendship(models.Model):
    """Two players who play together, and the asking that got them there.

    This replaces watching, which was one-directional and unannounced: a note to
    yourself about whose results you cared about. That was the right shape for a
    list of faces and the wrong one for everything anybody actually wanted from
    it — you could not see whether they had you on their list, and there was
    nothing between you to compare. A friendship is agreed, so both sides know,
    and both sides get the same list.

    One row per pair, in the direction it was asked in, which is the whole of
    the model: `requester` asked, `addressee` was asked, and the status says
    whether they have said yes. Nothing is stored twice, so nothing can
    disagree with itself — and every read has to look for the pair in both
    directions, which is what accounts/friends.py is for.
    """

    PENDING = "pending"
    ACCEPTED = "accepted"
    STATUSES = [(PENDING, "Asked"), (ACCEPTED, "Friends")]

    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="friendships_sent",
    )
    addressee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="friendships_received",
    )
    status = models.CharField(max_length=8, choices=STATUSES, default=PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    # When they said yes. Null while it is still an ask, which is also how
    # "friends since" is answered without a second field.
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("requester", "addressee")]
        ordering = ["created_at"]

    def __str__(self):
        joiner = "is friends with" if self.status == self.ACCEPTED else "asked"
        return f"{self.requester.username} {joiner} {self.addressee.username}"


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

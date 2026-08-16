"""Clubs, the leagues they run, and the seasons those leagues run in.

Three levels, because they are three different things and collapsing them left
"who hosts this league?" with no better answer than "whoever typed it in":

* A **club** is the community. People join it; it has an owner and staff.
* A **league** is a competition the club runs. A club can have more than one —
  a Sunday league and a turbo series among the same people.
* A **season** is one run of a league. Closing it freezes a table that people
  played for, which is why the scoring lives here rather than on the league:
  changing the rules for next season must not rewrite last season's result.
"""

import secrets

from django.conf import settings
from django.db import models
from django.utils.text import slugify

# No 0/O or 1/I/L: an invite code gets read aloud and typed by somebody else.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6


def generate_invite_code():
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


class Club(models.Model):
    """A group of people who play together."""

    name = models.CharField(max_length=60)
    slug = models.SlugField(max_length=70, unique=True)
    emoji = models.CharField(max_length=8, default="\U0001F3B4")
    description = models.CharField(max_length=200, blank=True)
    # Public clubs are browsable and join instantly. Private ones are found
    # only by their code, which every club has either way — a public club
    # still wants a link to send somebody.
    is_public = models.BooleanField(default=True)
    invite_code = models.CharField(max_length=12, unique=True, default=generate_invite_code)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="clubs_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self._unique_slug()
        super().save(*args, **kwargs)

    def _unique_slug(self):
        base = slugify(self.name)[:60] or "club"
        slug = base
        suffix = 2
        while Club.objects.filter(slug=slug).exclude(pk=self.pk).exists():
            slug = f"{base}-{suffix}"
            suffix += 1
        return slug

    def __str__(self):
        return self.name


class Membership(models.Model):
    """Somebody's place in a club.

    Roles are a ladder rather than a set: an owner can do anything staff can,
    and staff anything a member can. `is_staff_role` is the question almost
    every caller actually has.
    """

    OWNER = "owner"
    STAFF = "staff"
    MEMBER = "member"
    ROLE_CHOICES = [(OWNER, "Owner"), (STAFF, "Staff"), (MEMBER, "Member")]

    club = models.ForeignKey(Club, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="club_memberships",
    )
    role = models.CharField(max_length=6, choices=ROLE_CHOICES, default=MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("club", "user")]
        ordering = ["joined_at"]

    @property
    def is_staff_role(self):
        return self.role in (self.OWNER, self.STAFF)

    def __str__(self):
        return f"{self.user.username} in {self.club.name} ({self.role})"


class League(models.Model):
    """A competition a club runs, over and over, season by season."""

    club = models.ForeignKey(Club, on_delete=models.CASCADE, related_name="leagues")
    name = models.CharField(max_length=60)
    emoji = models.CharField(max_length=8, default="\U0001F3C6")
    description = models.CharField(max_length=200, blank=True)
    # Kept rather than deleted: a league that is over still has seasons whose
    # tables people care about.
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    @property
    def open_season(self):
        return self.seasons.filter(closed_at__isnull=True).first()

    def __str__(self):
        return f"{self.club.name} · {self.name}"


def default_scoring():
    # Imported here rather than at module scope: scoring.py is deliberately
    # free of Django, and importing it from a model at import time would drag
    # the dependency the wrong way round.
    from .scoring import PRESETS

    return dict(PRESETS["placement_ko"])


class Season(models.Model):
    """One run of a league, and the rules it was run under.

    At most one open season per league. The scoring is a copy rather than a
    reference, so a league can change how it scores next season without
    silently restating a table people already played for.
    """

    league = models.ForeignKey(League, on_delete=models.CASCADE, related_name="seasons")
    name = models.CharField(max_length=60)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    scoring = models.JSONField(default=default_scoring)
    # What the club says it will pay the winners. Declared only: the app never
    # records anybody owing it, unlike the tournament ledger.
    prizes = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_open(self):
        return self.closed_at is None

    def __str__(self):
        return f"{self.league.name} · {self.name}"

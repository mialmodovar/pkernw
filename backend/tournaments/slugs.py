"""The readable half of a tournament's address.

A link to a night should say which night it is. "/tournament/42" says nothing to
the person you are sending it to, and it is the thing they see before they
decide whether to open it.

Nobody configures this: the slug comes off the name, and if the name changes the
slug changes with it — which would break every link already in a chat if the old
one stopped working, so it does not. Every slug a tournament has ever had is
kept, and the old ones lead to the new one.

The rules are here rather than on the model because "the name changed enough to
be a different address" is a judgement with edges: renaming "Friday" to "Friday
night" is a new slug, and a slug that already ends in a number is not one that
grew a suffix.
"""

import re

from django.utils.text import slugify

# Long enough for a name somebody would actually type, short enough to paste.
MAX_LENGTH = 60
FALLBACK = "tournament"

# A slug that has been given a number to keep it unique: "friday-night-2". The
# number is this file's doing, not part of anybody's name, so it does not count
# as a difference when deciding whether a rename needs a new slug.
SUFFIXED = re.compile(r"^(?P<base>.+)-(?P<number>\d+)$")


def base_slug(name) -> str:
    """What a name comes to, before anything is done about collisions."""
    return slugify(name or "")[:MAX_LENGTH] or FALLBACK


def unique_slug(name, taken) -> str:
    """A slug for this name that nobody else is using.

    `taken` is every slug already spoken for — the ones in use and the ones
    retired, because a retired slug still leads somewhere and handing it to a
    second tournament would send those links to the wrong night.
    """
    base = base_slug(name)
    held = set(taken or ())
    if base not in held:
        return base
    for suffix in range(2, 1000):
        candidate = f"{base[:MAX_LENGTH - len(str(suffix)) - 1]}-{suffix}"
        if candidate not in held:
            return candidate
    return f"{base[:MAX_LENGTH - 9]}-{abs(hash(name)) % 100000}"


def still_fits(slug, name) -> bool:
    """Whether the slug a tournament has still describes the name it has.

    True for the slug the name makes, and for that slug with a number on the
    end — which is this file's own doing and not a difference in the name.
    """
    if not slug:
        return False
    base = base_slug(name)
    if slug == base:
        return True
    match = SUFFIXED.match(slug)
    return bool(match) and match.group("base") == base


def looks_like_id(key) -> bool:
    """Whether a URL is using the number rather than the name.

    Every link ever handed out is a number, and they all still work — this is
    how the two are told apart.
    """
    return bool(re.fullmatch(r"\d+", str(key or "")))

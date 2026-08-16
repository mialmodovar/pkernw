"""A player's knockout finishers: what plays, and what it sounds like.

One finisher was one GIF, stored on the profile as `finisher_gif_id`. Playing
the same clip every single time is funny twice, so a player can now keep a few
and the table picks between them — and each one carries a sound, because a GIF
landing in silence is half a joke.

A finisher is a Giphy id and a sound name, both of them names rather than
addresses. See giphy.py for why the id never travels as a URL; the sound is the
same idea, a key into a fixed set the client synthesises, so nothing here can
point a table at a file somebody else chose.
"""

from .giphy import clean_gif_id

# How many a player may keep. Three is enough for the rotation to be a surprise
# and few enough that choosing them stays a decision rather than a library.
MAX_FINISHERS = 3

# The stings the client can play, by name. Adding one means teaching
# frontend/src/components/game/sounds.js the same name; anything unrecognised
# arrives as silence rather than as somebody else's sound.
FINISHER_SOUNDS = ("none", "airhorn", "boom", "fanfare", "sting", "slam")

DEFAULT_SOUND = "none"


def clean_sound(value):
    """The sound if it is one of ours, otherwise silence."""
    text = str(value or "").strip().lower()
    return text if text in FINISHER_SOUNDS else DEFAULT_SOUND


def clean_finisher(entry):
    """One {gif_id, sound}, or None if there is no usable GIF in it."""
    if isinstance(entry, str):
        entry = {"gif_id": entry}
    if not isinstance(entry, dict):
        return None
    gif_id = clean_gif_id(entry.get("gif_id"))
    if gif_id is None:
        return None
    return {"gif_id": gif_id, "sound": clean_sound(entry.get("sound"))}


def finisher_list(theme):
    """Everything this player has chosen, cleaned, capped and de-duplicated.

    Reads the new list and falls back to the single id that came before it, so
    a profile saved by an older client keeps its finisher without a migration —
    the stored blob is rewritten in the new shape the next time they save.
    """
    theme = theme or {}
    raw = theme.get("finishers")
    if not isinstance(raw, list):
        raw = []
    cleaned = []
    seen = set()
    for entry in raw:
        finisher = clean_finisher(entry)
        # The same clip twice would only weight the dice towards itself.
        if finisher and finisher["gif_id"] not in seen:
            seen.add(finisher["gif_id"])
            cleaned.append(finisher)
        if len(cleaned) >= MAX_FINISHERS:
            break
    if cleaned:
        return cleaned
    legacy = clean_finisher(theme.get("finisher_gif_id"))
    return [legacy] if legacy else []


def pick_finisher(finishers, chooser):
    """One of them, or None. `chooser` picks from a list — the caller's random.

    Handed in rather than reached for so a test can say which one it wants and
    the engine stays as predictable as everything else in it.
    """
    if not finishers:
        return None
    return chooser(finishers)

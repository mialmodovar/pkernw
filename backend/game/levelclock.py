"""Reading a blind schedule as a clock.

Pure arithmetic over the level list, with no Django and no engine behind it, so
it can be tested the way tournaments/bounties.py is: by handing it a schedule
and checking the number that comes back.
"""

from typing import Optional


def seconds_until_level_ends(
    levels: list,
    level_index: int,
    elapsed_seconds: float,
    target_blind_level: int,
) -> Optional[int]:
    """How long until the level numbered `target_blind_level` finishes.

    Counts what is left of the level being played plus every level between it
    and the target, breaks included — a twenty-minute break in the way is
    twenty more minutes of late registration, whatever else it is.

    None when the question has no answer in seconds: the target is already
    behind us, the schedule runs out before reaching it, or a level counted in
    hands stands in the way and nobody knows how long hands take.
    """
    if target_blind_level <= 0 or level_index < 0 or level_index >= len(levels):
        return None

    played = sum(1 for level in levels[: level_index + 1] if not level.get("is_break"))
    if played > target_blind_level:
        return None

    total = 0.0
    for index in range(level_index, len(levels)):
        level = levels[index]
        minutes = level.get("duration_minutes")
        if not minutes:
            return None

        seconds = minutes * 60
        if index == level_index:
            seconds = max(0.0, seconds - max(0.0, elapsed_seconds))
        total += seconds

        if not level.get("is_break"):
            number = sum(1 for one in levels[: index + 1] if not one.get("is_break"))
            if number >= target_blind_level:
                return int(total)

    # The schedule ended before the target level did, which means the target
    # does not exist. Saying nothing beats inventing a deadline.
    return None

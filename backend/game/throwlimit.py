"""How often somebody may throw something at somebody else.

A throw lands on another player's screen: it moves, it makes a noise, and now
it leaves a mess over the felt they are reading. Three in a row is a joke and
ten in a row is a way of stopping somebody playing, and the difference between
the two is entirely a question of rate.

So: throw as much as you like, up to a burst. Spend the burst and the arm is
tired for ten seconds. It is deliberately not a flat cooldown on every throw —
answering a tomato with a tomato is the whole point of the feature, and a rule
that made you wait ten seconds to do it would kill the thing it protects.

Pure, and tested. The window arithmetic is the sort of thing that looks obvious
and is off by one throw, and the failure is invisible until somebody is being
buried in rubber chickens.
"""

# How many may go in quick succession before the arm gets tired.
BURST = 3

# What counts as "in a row": three throws spread over a minute is a table
# having fun, three in six seconds is somebody leaning on a button.
BURST_WINDOW_SECONDS = 6.0

# How long the wait is once the burst is spent.
COOLDOWN_SECONDS = 10.0


def check(recent, now):
    """Whether this throw is allowed, and what to remember afterwards.

    `recent` is the timestamps of this player's last few throws, oldest first,
    as monotonic seconds. Returns (allowed, kept, cooling_for):

      allowed      whether to let this one go
      kept         the timestamps to hold on to for next time
      cooling_for  seconds until they may throw again, 0 when they may now

    The rejected throw is not recorded. Otherwise leaning on the button would
    keep pushing the cooldown out in front of itself, and a ten-second wait
    would become a wait for as long as somebody kept clicking — punishing
    impatience rather than spam.
    """
    kept = [at for at in recent if now - at <= max(BURST_WINDOW_SECONDS, COOLDOWN_SECONDS)]

    # Already tired: the burst was spent, and the clock runs from the throw
    # that spent it.
    burst = [at for at in kept if now - at <= BURST_WINDOW_SECONDS]
    if len(burst) >= BURST:
        since_last = now - kept[-1]
        if since_last < COOLDOWN_SECONDS:
            return False, kept, round(COOLDOWN_SECONDS - since_last, 2)
        # The wait is over. What went before it is history, not credit.
        return True, [now], 0

    return True, [*kept, now], 0

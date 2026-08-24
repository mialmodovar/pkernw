"""How many places pay, and what each of them is worth.

A host does not decide "eleven places, and the eighth of them gets 4%". They
decide "the top fifth get paid", and the split follows. So the tournament keeps
the share and this works out the rest — which is also the only way the answer
can be right, because the share is a fact about the night and the number of
places is a fact about who turned up.

That is the bug this exists to fix: the places were worked out once, from the
player *cap*, at the moment the tournament was created. Twenty per cent of a cap
of a hundred is twenty paid places, and a tournament that five people register
for pays twenty of them. The field is what turned up, and it is not known until
registration closes.

The arithmetic is a port of the form's own — frontend/src/components/lobby/
payoutCurve.js — because the two have to agree: the form shows what the split
will be and this is what it actually becomes.
"""

# Shares are whole percentages, so a hundred places is the most that can each be
# paid something. Beyond that the tail rounds to nothing, and a paid place worth
# nothing is not a paid place.
MAX_PAID_PLACES = 100

# The share of the field that pays, as most tournaments run it. A fifth is about
# what a live event pays and what a home game settles on.
DEFAULT_SHARE_PCT = 20


def clean_share(value) -> int:
    """A share of the field, or 0 for a structure that was written out by hand."""
    try:
        share = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, min(100, share))


def places_paid(field_size, share_pct) -> int:
    """How many places pay, given a field and a share of it. Always at least one.

    Never more than the field: a tournament of three cannot pay four people, and
    a share that says so is a share applied to a number that has not happened
    yet.
    """
    field = max(1, int(field_size or 0))
    share = clean_share(share_pct)
    places = round((field * share) / 100)
    return max(1, min(field, MAX_PAID_PLACES, places))


def _ordinal(place: int) -> str:
    if 11 <= place % 100 <= 13:
        return f"{place}th"
    return f"{place}{ {1: 'st', 2: 'nd', 3: 'rd'}.get(place % 10, 'th') }"


def payout_curve(places):
    """The split itself: steep at the top, flattening out down the places.

    A decay rather than a table of hand-written structures, so it answers for any
    number of places — and largest-remainder rounding so the percentages total
    exactly 100, which is what the serializer insists on.
    """
    count = max(1, min(MAX_PAID_PLACES, int(places or 1)))
    if count == 1:
        return [{"place": 1, "label": "1st", "percentage": 100}]

    # A whole percent to every paid place before the curve gets a look at the
    # rest. Without this the tail of a deep structure floors to zero — twenty
    # places is fine, sixty is not — and a place paid nothing is a place that
    # is not paid.
    floor_share = 1
    spread = 100 - floor_share * count

    weights = [1 / (index + 1) ** 0.8 for index in range(count)]
    total = sum(weights)

    exact = [floor_share + (weight / total) * spread for weight in weights]
    shares = [int(value) for value in exact]
    short = 100 - sum(shares)
    # The parts of a percent go to whoever the flooring cost most, in order.
    order = sorted(range(count), key=lambda index: exact[index] - shares[index], reverse=True)
    for index in order:
        if short <= 0:
            break
        shares[index] += 1
        short -= 1

    return [
        {"place": index + 1, "label": _ordinal(index + 1), "percentage": share}
        for index, share in enumerate(shares)
    ]


def structure_for(field_size, share_pct):
    """The payout structure a share of this field comes to."""
    return payout_curve(places_paid(field_size, share_pct))

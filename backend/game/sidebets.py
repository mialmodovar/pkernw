"""Side bets: the game the folded players get to play.

No chips ride on these. A side bet is a call, made out loud, on who takes the
pot you have just got out of — and the only thing anybody remembers afterwards
is whether you were right, so that is all this keeps.

Pure arithmetic over dictionaries, with no engine behind it, in the shape of
bounties.py and levelclock.py.
"""


def settle(bets: dict, winner_user_ids) -> list:
    """Who called it right.

    `bets` maps a bettor's user id to the id of the player they backed. A pick
    who folded after the bet was placed is simply wrong, which is the risk of
    calling it early and the reason calling it early is worth anything.
    """
    winners = set(winner_user_ids)
    return [
        {"user_id": bettor, "on_user_id": pick, "correct": pick in winners}
        for bettor, pick in bets.items()
    ]


def updated_records(records: dict, results: list) -> dict:
    """The running tally after this hand.

    A new dict rather than an edit in place: the old one may already be on its
    way out to a client, and a record that changes underneath a broadcast is a
    bug nobody finds twice.
    """
    out = {user_id: dict(record) for user_id, record in records.items()}
    for result in results:
        record = out.setdefault(result["user_id"], {"right": 0, "called": 0})
        record["called"] += 1
        if result["correct"]:
            record["right"] += 1
    return out


def record_for(records: dict, user_id: int) -> dict:
    """Someone's tally, including the nothing that a first-timer has."""
    return dict(records.get(user_id) or {"right": 0, "called": 0})

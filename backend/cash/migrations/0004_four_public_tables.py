"""One public table at each rung, named the way people name a cash game.

Two was enough to prove a lobby is not empty; it was not enough to be a lobby.
The point of a ladder is that somebody who has won a few hundred coins at 1/2
has somewhere to take them, and a rung with no table on it is a rung nobody can
stand on.

They are named by their blinds because that is what a cash table is called
everywhere outside this codebase — "micro" and "low" are how the code groups
them, not how anybody asks for one.
"""

from django.db import migrations

# The old names, and what they are called now.
RENAMED = (("Micro 8-max", "1/2 8-max"), ("Low 8-max", "2/5 8-max"))

# (name, stake, seats). Eight seats: a full ring without the two chairs that
# are always the last to fill.
PUBLIC_TABLES = (
    ("1/2 8-max", "micro", 8),
    ("2/5 8-max", "low", 8),
    ("5/10 8-max", "mid", 8),
    ("10/20 8-max", "high", 8),
)


def open_them(apps, schema_editor):
    CashTable = apps.get_model("cash", "CashTable")
    for was, now in RENAMED:
        CashTable.objects.filter(club__isnull=True, name=was).update(name=now)
    for name, stake, seats in PUBLIC_TABLES:
        CashTable.objects.get_or_create(
            name=name,
            club=None,
            defaults={
                "stake": stake,
                "seat_count": seats,
                # The house tables run the ordinary game. A bomb pot every ten
                # hands is a house rule, and a house rule belongs in somebody's
                # club rather than on the app's own felt.
                "run_it_twice": False,
                "bomb_pot_every": 0,
                "is_open": True,
            },
        )


def close_them(apps, schema_editor):
    CashTable = apps.get_model("cash", "CashTable")
    # Only the two this migration added; the other two are 0002's to remove,
    # under the names it gave them.
    CashTable.objects.filter(
        club__isnull=True, name__in=["5/10 8-max", "10/20 8-max"],
    ).delete()
    for was, now in RENAMED:
        CashTable.objects.filter(club__isnull=True, name=now).update(name=was)


class Migration(migrations.Migration):

    dependencies = [("cash", "0003_alter_cashtable_seat_count")]

    operations = [migrations.RunPython(open_them, close_them)]

"""The tables the app runs itself.

A cash lobby with nothing in it is a cash lobby nobody comes back to: somebody
has to be first, and nobody wants to be first at an empty room they also had to
open. So the app keeps two of its own, at the two stakes the daily coins
actually reach — a table you can sit at with what you have is the only kind that
fills.

A migration rather than a fixture because these are part of the app rather than
part of a dataset: an install with no tables is an install with no cash game.
Written so it can run twice without opening four of them.
"""

from django.db import migrations

# (name, stake, seats). Eight seats: a full ring without the two chairs that
# are always the last to fill.
PUBLIC_TABLES = (
    ("Micro 8-max", "micro", 8),
    ("Low 8-max", "low", 8),
)


def open_them(apps, schema_editor):
    CashTable = apps.get_model("cash", "CashTable")
    for name, stake, seats in PUBLIC_TABLES:
        CashTable.objects.get_or_create(
            name=name,
            club=None,
            defaults={
                "stake": stake,
                "seat_count": seats,
                # The house tables run the ordinary game. Anybody who wants a
                # bomb pot every ten hands can open one in their club, which is
                # where a house rule belongs.
                "run_it_twice": False,
                "bomb_pot_every": 0,
                "is_open": True,
            },
        )


def close_them(apps, schema_editor):
    CashTable = apps.get_model("cash", "CashTable")
    CashTable.objects.filter(
        club__isnull=True, name__in=[name for name, _stake, _seats in PUBLIC_TABLES],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [("cash", "0001_initial")]

    operations = [migrations.RunPython(open_them, close_them)]

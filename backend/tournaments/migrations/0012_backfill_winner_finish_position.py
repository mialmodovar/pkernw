from django.db import migrations


def backfill_winners(apps, schema_editor):
    """Record first place for tournaments that finished before it was tracked.

    Busted players always got a finish position on the way out, but the last
    player standing never did, so finished tournaments had no recorded winner.
    In a finished tournament exactly one player should be left un-eliminated —
    that's the winner. Anything ambiguous is left alone.
    """
    Tournament = apps.get_model("tournaments", "Tournament")

    for tournament in Tournament.objects.filter(status="finished"):
        if tournament.players.filter(finish_position=1).exists():
            continue
        candidates = list(tournament.players.filter(is_eliminated=False))
        if len(candidates) != 1:
            continue
        winner = candidates[0]
        winner.finish_position = 1
        winner.save(update_fields=["finish_position"])


class Migration(migrations.Migration):

    dependencies = [
        ("tournaments", "0011_tournament_rabbit_hunting_auto_remove"),
    ]

    operations = [
        # Reversing would mean deleting real results, so this is one-way.
        migrations.RunPython(backfill_winners, migrations.RunPython.noop),
    ]

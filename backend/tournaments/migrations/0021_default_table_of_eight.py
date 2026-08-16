from django.db import migrations, models


class Migration(migrations.Migration):
    """The default seating for a new tournament, not a change to existing ones:
    a default only ever applies to rows created after it."""

    dependencies = [
        ('tournaments', '0020_tournament_finished_at_tournament_started_at'),
    ]

    operations = [
        migrations.AlterField(
            model_name='tournament',
            name='players_per_table',
            field=models.IntegerField(default=8),
        ),
    ]

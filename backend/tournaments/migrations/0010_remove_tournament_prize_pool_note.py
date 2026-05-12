from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("tournaments", "0009_tournament_paused_status"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="tournament",
            name="prize_pool_note",
        ),
    ]

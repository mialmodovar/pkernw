from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tournaments", "0010_remove_tournament_prize_pool_note"),
    ]

    operations = [
        migrations.AddField(
            model_name="tournament",
            name="rabbit_hunting_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="tournament",
            name="auto_remove_offline_seconds",
            field=models.IntegerField(default=0),
        ),
    ]

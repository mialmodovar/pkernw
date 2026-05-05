from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tournaments", "0006_tournament_scheduled_start_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="tournament",
            name="time_bank_seconds",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="tournament",
            name="time_bank_refill_rule",
            field=models.CharField(
                choices=[
                    ("none", "No refill"),
                    ("hands", "Every N hands"),
                    ("blind_level", "At blind level"),
                ],
                default="none",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="tournament",
            name="time_bank_refill_every_hands",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="tournament",
            name="time_bank_refill_level",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="tournamentplayer",
            name="time_bank_seconds_remaining",
            field=models.IntegerField(default=0),
        ),
    ]

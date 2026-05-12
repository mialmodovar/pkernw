from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tournaments", "0008_prize_pool_payout_structure"),
    ]

    operations = [
        migrations.AlterField(
            model_name="tournament",
            name="status",
            field=models.CharField(
                choices=[
                    ("lobby", "Lobby"),
                    ("running", "Running"),
                    ("paused", "Paused"),
                    ("finished", "Finished"),
                ],
                default="lobby",
                max_length=10,
            ),
        ),
    ]

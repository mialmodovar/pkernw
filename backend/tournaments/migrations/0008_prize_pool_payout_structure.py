from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tournaments", "0007_time_bank_configuration"),
    ]

    operations = [
        migrations.AddField(
            model_name="tournament",
            name="prize_pool_note",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="tournament",
            name="payout_structure",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

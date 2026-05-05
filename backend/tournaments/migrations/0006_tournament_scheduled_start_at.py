from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tournaments", "0005_tournamenttable_tournamentplayer_table_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="tournament",
            name="scheduled_start_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]

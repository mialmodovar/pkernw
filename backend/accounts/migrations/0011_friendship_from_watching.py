"""Watching becomes friendship, carrying every existing list across.

Nobody loses anybody. A pair who had each other on their watch lists plainly
already agreed, whether or not they were ever asked, so they come out of this as
friends. A one-way watch becomes the ask it always was — the watcher has asked,
and the other side now gets to say yes, which is the thing watching could never
do.

The old watch rows go with the model: they say nothing the friendships do not,
and leaving a dead table behind is how two sources of truth start.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.utils import timezone


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0010_profile_google_email_profile_google_sub_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    def carry_the_watch_lists_over(apps, schema_editor):
        Watch = apps.get_model("accounts", "Watch")
        Friendship = apps.get_model("accounts", "Friendship")
        now = timezone.now()

        watches = list(Watch.objects.values_list("watcher_id", "watched_id", "created_at"))
        pairs = {(watcher, watched) for watcher, watched, _at in watches}
        done = set()
        rows = []
        for watcher, watched, at in watches:
            key = frozenset((watcher, watched))
            if watcher == watched or key in done:
                continue
            done.add(key)
            mutual = (watched, watcher) in pairs
            rows.append(Friendship(
                requester_id=watcher,
                addressee_id=watched,
                status="accepted" if mutual else "pending",
                # Both sides watching is an agreement that predates this
                # migration; dating it now would be a lie about a friendship
                # somebody has had for months.
                accepted_at=(at or now) if mutual else None,
            ))
        Friendship.objects.bulk_create(rows, ignore_conflicts=True)

    def back_to_watch_lists(apps, schema_editor):
        """Every friendship was at least a watch, and an agreed one was two."""
        Watch = apps.get_model("accounts", "Watch")
        Friendship = apps.get_model("accounts", "Friendship")
        rows = []
        for requester, addressee, status in Friendship.objects.values_list(
            "requester_id", "addressee_id", "status",
        ):
            rows.append(Watch(watcher_id=requester, watched_id=addressee))
            if status == "accepted":
                rows.append(Watch(watcher_id=addressee, watched_id=requester))
        Watch.objects.bulk_create(rows, ignore_conflicts=True)

    operations = [
        migrations.CreateModel(
            name='Friendship',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('pending', 'Asked'), ('accepted', 'Friends')], default='pending', max_length=8)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('accepted_at', models.DateTimeField(blank=True, null=True)),
                ('addressee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='friendships_received', to=settings.AUTH_USER_MODEL)),
                ('requester', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='friendships_sent', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['created_at'],
                'unique_together': {('requester', 'addressee')},
            },
        ),
        migrations.RunPython(carry_the_watch_lists_over, back_to_watch_lists),
        migrations.DeleteModel(
            name='Watch',
        ),
    ]

"""Addresses for the nights that already exist.

Every tournament made before this has a number and no name in its link. They
keep the number — every link ever handed out still works — and gain the readable
one, which is what gets shared from here on.
"""

from django.db import migrations
from django.utils.text import slugify


def name_them(apps, schema_editor):
    Tournament = apps.get_model("tournaments", "Tournament")
    TournamentSlug = apps.get_model("tournaments", "TournamentSlug")

    taken = set()
    for tournament in Tournament.objects.all().order_by("id"):
        base = slugify(tournament.name or "")[:60] or "tournament"
        slug = base
        suffix = 2
        while slug in taken:
            slug = f"{base[:60 - len(str(suffix)) - 1]}-{suffix}"
            suffix += 1
        taken.add(slug)
        tournament.slug = slug
        tournament.save(update_fields=["slug"])
        TournamentSlug.objects.get_or_create(
            slug=slug, defaults={"tournament": tournament},
        )


def forget_them(apps, schema_editor):
    apps.get_model("tournaments", "TournamentSlug").objects.all().delete()
    apps.get_model("tournaments", "Tournament").objects.all().update(slug=None)


class Migration(migrations.Migration):

    dependencies = [("tournaments", "0033_tournament_slug_tournamentslug")]

    operations = [migrations.RunPython(name_them, forget_them)]

"""Wipe what has been played, keep who plays.

Every tournament, hand, seat and settled debt goes; accounts, profiles,
pictures, clubs, leagues and coin balances stay exactly as they are. For
starting a season over, or clearing out the mess a few months of testing leaves
behind, without asking anybody to sign up again.

Deliberately a command rather than a page in the admin: this is not something
to do by accident, and the confirmation it asks for is the point.

    python manage.py purge_history                 # says what it would delete
    python manage.py purge_history --yes           # actually deletes it
    python manage.py purge_history --before 2026-01-01 --yes
"""

from datetime import datetime, time

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from game.models import Hand, HandAction
from tournaments.models import (
    BlindLevel,
    LedgerEntry,
    Settlement,
    Tournament,
    TournamentPlayer,
    TournamentTable,
)


class Command(BaseCommand):
    help = "Delete tournament history — tournaments, hands and the debt ledger — keeping every account."

    def add_arguments(self, parser):
        parser.add_argument(
            "--yes", action="store_true",
            help="Actually delete. Without it this only reports what would go.",
        )
        parser.add_argument(
            "--before", metavar="YYYY-MM-DD",
            help="Only tournaments created before this date. Everything since is left alone.",
        )
        parser.add_argument(
            "--keep-settlements", action="store_true",
            help=(
                "Leave the settlement records. Rarely what you want: a payment "
                "with no debt behind it reads as money owed the other way."
            ),
        )
        parser.add_argument(
            "--force", action="store_true",
            help="Delete even while a tournament is running. It will break that table.",
        )

    def handle(self, *args, **options):
        cutoff = self._cutoff(options.get("before"))
        tournaments = Tournament.objects.all()
        if cutoff is not None:
            tournaments = tournaments.filter(created_at__lt=cutoff)

        live = tournaments.filter(status__in=("running", "paused"))
        if live.exists() and not options["force"]:
            raise CommandError(
                f"{live.count()} tournament(s) are running or paused. The engine holds "
                "them in memory and deleting their rows will break the table underneath "
                "the players. Finish them, or pass --force if you mean it."
            )

        ids = list(tournaments.values_list("id", flat=True))
        counts = self._counts(ids, options["keep_settlements"])

        self.stdout.write(self.style.MIGRATE_HEADING(
            "Would delete" if not options["yes"] else "Deleting",
        ))
        for label, number in counts.items():
            self.stdout.write(f"  {number:>7}  {label}")
        self.stdout.write(self.style.MIGRATE_HEADING("Keeping untouched"))
        for label, number in self._kept().items():
            self.stdout.write(f"  {number:>7}  {label}")

        if not options["yes"]:
            self.stdout.write("")
            self.stdout.write("Nothing was deleted. Run it again with --yes to go ahead.")
            return

        with transaction.atomic():
            # Hands hang off tournaments and actions off hands, so the cascade
            # would take them anyway — deleted first and explicitly because a
            # cascade of a hundred thousand rows through the ORM is slow and
            # silent, and this way the count above is the count that happened.
            HandAction.objects.filter(hand__tournament_id__in=ids).delete()
            Hand.objects.filter(tournament_id__in=ids).delete()
            if not options["keep_settlements"]:
                # No tournament FK on these, so nothing would cascade. Left
                # behind they are payments against debts that no longer exist,
                # which the balances read as credit in the other direction.
                Settlement.objects.all().delete()
            Tournament.objects.filter(id__in=ids).delete()

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"Done. {len(ids)} tournament(s) gone; every account is still there."
        ))
        self.stdout.write(
            "Player statistics are counted from the hands, so they now read zero. "
            "Coin balances and unlocks were not touched."
        )

    def _cutoff(self, text):
        if not text:
            return None
        try:
            day = datetime.strptime(text, "%Y-%m-%d")
        except ValueError:
            raise CommandError("--before wants a date like 2026-01-01.")
        return timezone.make_aware(datetime.combine(day, time.min))

    def _counts(self, ids, keep_settlements):
        return {
            "tournaments": len(ids),
            "seats (TournamentPlayer)": TournamentPlayer.objects.filter(tournament_id__in=ids).count(),
            "tables": TournamentTable.objects.filter(tournament_id__in=ids).count(),
            "blind levels": BlindLevel.objects.filter(tournament_id__in=ids).count(),
            "hands": Hand.objects.filter(tournament_id__in=ids).count(),
            "hand actions": HandAction.objects.filter(hand__tournament_id__in=ids).count(),
            "ledger entries": LedgerEntry.objects.filter(tournament_id__in=ids).count(),
            "settlements": 0 if keep_settlements else Settlement.objects.count(),
        }

    def _kept(self):
        from django.contrib.auth import get_user_model

        from accounts.models import AvatarImage, Profile, Watch
        from clubs.models import Club, League, Membership, Season
        from sidegames.models import Unlock, Wallet

        return {
            "accounts": get_user_model().objects.count(),
            "profiles": Profile.objects.count(),
            "avatars": AvatarImage.objects.count(),
            "watch entries": Watch.objects.count(),
            "clubs": Club.objects.count(),
            "memberships": Membership.objects.count(),
            "leagues": League.objects.count(),
            "seasons": Season.objects.count(),
            "coin wallets": Wallet.objects.count(),
            "unlocked items": Unlock.objects.count(),
        }

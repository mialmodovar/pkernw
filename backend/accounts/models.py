from django.conf import settings
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    avatar_emoji = models.CharField(max_length=8, default="🃏")

    def __str__(self):
        return f"{self.user.username}'s profile"

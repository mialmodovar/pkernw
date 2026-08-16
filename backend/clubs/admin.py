from django.contrib import admin

from .models import Club, League, Membership, Season

admin.site.register([Club, Membership, League, Season])

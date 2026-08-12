from django.contrib import admin
from django.urls import path, include, re_path

from .spa import SpaView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/tournaments/", include("tournaments.urls")),
    path("api/tournaments/", include("game.urls")),
    path("api/ledger/", include("tournaments.ledger_urls")),
    # Last: anything not claimed above belongs to the client-side router.
    re_path(r"^(?!api/|admin/|ws/|static/).*$", SpaView.as_view(), name="spa"),
]

from django.urls import path

from .ledger_views import my_ledger, record_settlement

urlpatterns = [
    path("me/", my_ledger, name="ledger-me"),
    path("settlements/", record_settlement, name="ledger-settle"),
]

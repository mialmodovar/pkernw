from django.urls import path

from .views import buy, claim, shop, wallet

urlpatterns = [
    path("wallet/", wallet, name="coin-wallet"),
    path("claim/", claim, name="coin-claim"),
    path("shop/", shop, name="coin-shop"),
    path("shop/buy/", buy, name="coin-buy"),
]

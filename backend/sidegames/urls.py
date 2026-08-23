from django.urls import path

from .views import buy, claim, claim_mission_reward, missions, shop, wallet, wear_border

urlpatterns = [
    path("wallet/", wallet, name="coin-wallet"),
    path("claim/", claim, name="coin-claim"),
    path("shop/", shop, name="coin-shop"),
    path("shop/buy/", buy, name="coin-buy"),
    path("shop/border/", wear_border, name="coin-wear-border"),
    path("missions/", missions, name="coin-missions"),
    path("missions/claim/", claim_mission_reward, name="coin-mission-claim"),
]

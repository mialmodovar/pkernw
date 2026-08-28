from django.urls import path

from .blackjack_views import (
    blackjack_deal,
    blackjack_double,
    blackjack_hit,
    blackjack_round,
    blackjack_split,
    blackjack_stand,
)
from .views import buy, claim, claim_mission_reward, missions, shop, wallet, wear_border

urlpatterns = [
    path("wallet/", wallet, name="coin-wallet"),
    path("claim/", claim, name="coin-claim"),
    path("shop/", shop, name="coin-shop"),
    path("shop/buy/", buy, name="coin-buy"),
    path("shop/border/", wear_border, name="coin-wear-border"),
    path("missions/", missions, name="coin-missions"),
    path("missions/claim/", claim_mission_reward, name="coin-mission-claim"),
    # One path per thing a player can press, rather than one endpoint taking an
    # "action" field: the round is a conversation and each of these is a
    # different sentence in it, with a different reason to be refused.
    path("blackjack/round/", blackjack_round, name="blackjack-round"),
    path("blackjack/deal/", blackjack_deal, name="blackjack-deal"),
    path("blackjack/hit/", blackjack_hit, name="blackjack-hit"),
    path("blackjack/stand/", blackjack_stand, name="blackjack-stand"),
    path("blackjack/double/", blackjack_double, name="blackjack-double"),
    path("blackjack/split/", blackjack_split, name="blackjack-split"),
]

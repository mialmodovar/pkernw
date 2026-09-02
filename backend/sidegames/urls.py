from django.urls import path

from .blackjacktable_views import (
    blackjack_table,
    blackjack_table_act,
    blackjack_table_plan,
    blackjack_table_bet,
    blackjack_table_leave,
    blackjack_table_join,
)
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
    # The shared table. Under the same prefix as the solo game because it is
    # the same game and the same coins; the segment is what tells them apart.
    path("blackjack/table/", blackjack_table, name="blackjack-table"),
    path("blackjack/table/join/", blackjack_table_join, name="blackjack-table-join"),
    path("blackjack/table/leave/", blackjack_table_leave, name="blackjack-table-leave"),
    path("blackjack/table/bet/", blackjack_table_bet, name="blackjack-table-bet"),
    path("blackjack/table/act/", blackjack_table_act, name="blackjack-table-act"),
    path("blackjack/table/plan/", blackjack_table_plan, name="blackjack-table-plan"),
]

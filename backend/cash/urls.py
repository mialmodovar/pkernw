from django.urls import path

from .views import add_chips, close_table, leave, lobby, open_table, sit, sit_out, table_detail

urlpatterns = [
    path("", lobby, name="cash-lobby"),
    path("open/", open_table, name="cash-open"),
    path("<int:pk>/", table_detail, name="cash-table"),
    path("<int:pk>/sit/", sit, name="cash-sit"),
    path("<int:pk>/chips/", add_chips, name="cash-add-chips"),
    path("<int:pk>/sit-out/", sit_out, name="cash-sit-out"),
    path("<int:pk>/leave/", leave, name="cash-leave"),
    path("<int:pk>/close/", close_table, name="cash-close"),
]

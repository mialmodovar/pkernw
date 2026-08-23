from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = 'accounts'


# A setting that cannot work, said at startup rather than discovered from a
# Google error page that names no origin. See accounts/googleauth.py.
from django.core.checks import Warning as CheckWarning, register  # noqa: E402


@register()
def google_client_id_shape(app_configs, **kwargs):
    from . import googleauth

    complaint = googleauth.client_id_looks_wrong()
    return [CheckWarning(complaint, id="accounts.W001")] if complaint else []

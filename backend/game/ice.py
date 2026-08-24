"""Where two cameras at the same table go to find each other.

STUN tells a browser what its own address looks like from outside, which is
enough for most pairs of players sitting at home. It is no use at all to
somebody on mobile data: carriers put every phone behind carrier-grade NAT,
which is symmetric, and two symmetric NATs cannot be introduced to each other
by description alone. That pair needs a relay — a TURN server — with the
traffic actually passing through it.

Which is why this is a setting and an endpoint rather than a constant in the
browser bundle: a relay can be added, moved or taken away without a frontend
release, and a table of people at home carries on working with none.

The credential goes to the browser, because that is where it is used. It is a
short-lived shared secret for a media relay, not an account: treat it as public
and rotate it rather than hiding it, which is what every WebRTC app does.
"""

from django.conf import settings

# Google's public STUN, which is what this app has always used. Two of them so
# one being unreachable is not the end of it.
STUN_URLS = ("stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302")


def ice_servers(urls=None, username=None, credential=None):
    """The ICE server list, as the browser wants it.

    STUN first and always. A relay is added only when one is configured — an
    entry with no credentials would be an entry every browser wastes time
    failing against.
    """
    urls = list(urls if urls is not None else getattr(settings, "TURN_URLS", []) or [])
    username = username if username is not None else getattr(settings, "TURN_USERNAME", "")
    credential = credential if credential is not None else getattr(settings, "TURN_CREDENTIAL", "")

    servers = [{"urls": list(STUN_URLS)}]
    if urls and username and credential:
        servers.append({"urls": urls, "username": username, "credential": credential})
    return servers


def has_relay(servers):
    """Whether that list can get a pair of symmetric NATs talking."""
    return any(one.get("username") for one in servers)

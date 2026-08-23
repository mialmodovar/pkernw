"""Signing in with Google, and tying it to an account that already exists.

This app has never sent an email and still does not — see recovery.py for why.
What it lacked was any way back into an account for somebody who did not keep
the recovery code, and the cheapest honest answer is to let Google vouch for
who they are: no mail provider, no domain, nothing to keep alive, and a
verified address arrives as a side effect.

Two things happen here and they are deliberately separate:

  * signing in, which finds the account this Google identity already owns, or
    makes one;
  * linking, which attaches a Google identity to an account that was made the
    old way, from inside that account.

Linking is only ever done by somebody already signed in. There is no email on
the old accounts to match against, and matching on anything softer — a name, a
similar username — would be a way to claim somebody else's seat.

The identity is the `sub` claim, never the email address. An email can change
hands and be renamed; `sub` is Google's stable id for one account and is what
it means to be the same person next time.

No new dependency: the token is a signed JWT, and PyJWT is already here as the
thing that mints this app's own. The signature is checked against Google's
published keys, which is what makes any of this trustworthy — an unverified ID
token is a string somebody typed.
"""

import re

from django.conf import settings

# Both spellings Google uses for itself in the `iss` claim, which it documents
# and which are not interchangeable to a string comparison.
ISSUERS = ("https://accounts.google.com", "accounts.google.com")

# Where the public keys live. Fetched and cached by PyJWKClient rather than
# pinned: Google rotates them, and a pinned key is an outage with a date on it.
CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"

# What a generated username may contain. Django's own validator allows more,
# but a username that arrived from somebody's email address should not be the
# place this app learns that.
SAFE = re.compile(r"[^a-z0-9._-]+")
MAX_USERNAME = 20
FALLBACK_USERNAME = "player"


def client_id() -> str:
    """The OAuth client this app accepts tokens for, or "" when there is none.

    Blank switches the whole feature off, on both ends: the endpoints refuse
    and the login page draws no button. An app with no Google project
    configured has to keep working, which is every developer's first run of it.
    """
    return getattr(settings, "GOOGLE_CLIENT_ID", "") or ""


def configured() -> bool:
    return bool(client_id())


def clean_claims(claims, audience, issuers=ISSUERS):
    """The parts of a verified token this app uses, or a string saying why not.

    Signature checking is somebody else's job (see `verify`); this is the rest
    of it, and it is the half that is worth reading. The audience check is what
    stops a token minted for another application being replayed at this one,
    and the email check is what stops an address Google has not confirmed being
    treated as proof of anything.
    """
    claims = claims or {}
    if claims.get("iss") not in issuers:
        return "That token was not issued by Google."
    if not audience or claims.get("aud") != audience:
        return "That token was issued for a different application."
    subject = str(claims.get("sub") or "").strip()
    if not subject:
        return "That token names no account."
    email = str(claims.get("email") or "").strip().lower()
    # A Google account with an unverified address is one Google itself will not
    # vouch for, and vouching is the entire reason this exists.
    if not email or not claims.get("email_verified"):
        return "That Google account has no confirmed email address."
    return {
        "sub": subject,
        "email": email,
        "name": str(claims.get("name") or "").strip(),
    }


def verify(credential, audience=None, decoder=None):
    """A Google ID token, checked, as the claims this app cares about.

    Returns the same shape as clean_claims, including its error strings. The
    decoder is injectable so the tests can exercise everything here without
    Google's keys or a network — what they cannot exercise is the signature
    check itself, which is the one part that is somebody else's code.
    """
    audience = audience or client_id()
    if not audience:
        return "Signing in with Google is not set up here."
    if not credential:
        return "No Google token was sent."

    try:
        claims = (decoder or _decode)(credential, audience)
    except Exception:
        # Expired, tampered with, signed by nobody, or not a JWT at all. The
        # reason is Google's business and not the caller's: a login endpoint
        # that explains exactly why a token failed is a login endpoint that
        # helps somebody guess.
        return "That Google sign-in could not be verified."
    return clean_claims(claims, audience)


def _decode(credential, audience):
    """The signature check, against Google's published keys."""
    import jwt

    key = jwt.PyJWKClient(CERTS_URL).get_signing_key_from_jwt(credential)
    return jwt.decode(
        credential,
        key.key,
        algorithms=["RS256"],
        audience=audience,
        issuer=list(ISSUERS),
    )


def username_for(email, name, taken=()):
    """A username for somebody arriving without one.

    From the email rather than the display name, because it has to be unique
    and an address already is. Then made safe, cut short, and numbered if the
    obvious one has gone — which is the whole of what a username is here, since
    what people actually read is the display name beside it.
    """
    base = SAFE.sub("", str(email or "").split("@")[0].lower())[:MAX_USERNAME].strip("._-")
    if not base:
        base = SAFE.sub("", str(name or "").lower().replace(" ", ""))[:MAX_USERNAME]
    base = base or FALLBACK_USERNAME
    taken = set(taken)
    if base not in taken:
        return base
    for suffix in range(2, 1000):
        candidate = f"{base[:MAX_USERNAME - len(str(suffix))]}{suffix}"
        if candidate not in taken:
            return candidate
    return f"{FALLBACK_USERNAME}{len(taken) + 1}"


def display_name_for(name, email):
    """What to call them on the felt until they say otherwise."""
    shown = str(name or "").strip()
    return shown or str(email or "").split("@")[0]

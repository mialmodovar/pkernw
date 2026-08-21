"""Getting back into an account without an email address.

This app sends no email and has no intention of starting: it is a poker game for
a group of friends, and the price of "forgot my password" should not be a mail
provider. So an account gets a recovery code when it is made — sixteen
characters, shown once — and that code is the thing that lets somebody set a new
password.

The code is stored the way a password is stored: hashed, never in the clear. A
database that leaks recovery codes is a database that leaks accounts, and the
whole point of the code is that it is as good as the password.

It is spelled in the same alphabet as a club invite code, for the same reason:
somebody is going to write this down on paper and read it back later, and 0 and
O are the same character to anybody doing that.
"""

import secrets

from django.contrib.auth.hashers import check_password, make_password

# No 0/O or 1/I/L. See the club invite codes, which learned this first.
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
GROUP = 4
GROUPS = 4


def new_code() -> str:
    """A fresh recovery code, in groups: ABCD-EFGH-JKMN-PQRS.

    Sixteen characters out of thirty-one is about eighty bits, which is far more
    than a password anybody would choose and cheap to generate. The dashes are
    for reading it back off a bit of paper and are ignored on the way in.
    """
    letters = "".join(secrets.choice(ALPHABET) for _ in range(GROUP * GROUPS))
    return "-".join(letters[index:index + GROUP] for index in range(0, len(letters), GROUP))


def normalize(code) -> str:
    """What was typed, as what was generated.

    Dashes, spaces and case are all things that happen to a code between being
    written down and being typed back in, and none of them are the code.
    """
    return "".join(str(code or "").split()).replace("-", "").upper()


def hash_code(code: str) -> str:
    return make_password(normalize(code))


def code_matches(code, hashed) -> bool:
    """Whether this code opens that hash. False for an account with no code."""
    if not hashed or not normalize(code):
        return False
    return check_password(normalize(code), hashed)

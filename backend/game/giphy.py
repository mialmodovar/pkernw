"""What counts as a GIF around here.

A GIF is only ever its Giphy id — never a URL. The client picks one, the server
checks the shape of the id, and whoever receives it builds the CDN address
themselves. That is the whole security story of the feature: nobody can put an
arbitrary image, from an arbitrary host, on somebody else's screen inside the
table's own chrome, and no request ever leaves for a host we did not choose.

Ids are short and alphanumeric (Giphy also uses - and _). Anything else is not
an id, and is dropped rather than corrected.
"""

import re

GIF_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def clean_gif_id(value):
    """The id if it looks like one, otherwise None."""
    if not value:
        return None
    text = str(value).strip()
    return text if GIF_ID_PATTERN.match(text) else None

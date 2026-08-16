"""Uploaded avatars: what counts as one, and where it is read from.

Kept apart from the models so the game side can build an avatar URL from a
player record without importing the accounts models it does not otherwise need.
"""

# Small on purpose. The browser crops and re-encodes to a square before it
# uploads (see frontend avatarImage.js), so a legitimate upload lands well
# inside this; the ceiling is here for everything that does not come from our
# own page.
AVATAR_MAX_BYTES = 512 * 1024

# Magic numbers, not the browser's Content-Type: the declared type is under the
# uploader's control and the bytes are not. Vector formats are deliberately
# absent — an SVG is a document that can carry script, and it would be served
# from our own origin.
_SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)

ACCEPTED_LABEL = "PNG, JPEG, GIF or WebP"


def sniff_image_type(raw: bytes):
    """The content type these bytes really are, or None if they are not an
    image we accept."""
    for signature, content_type in _SIGNATURES:
        if raw.startswith(signature):
            return content_type
    # WebP is a RIFF container: "RIFF" <4-byte length> "WEBP".
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    return None


def avatar_url(user_id, updated_at):
    """Where this user's uploaded avatar can be read, or None if they have not
    uploaded one.

    The stamp is what makes replacing a picture take effect: the bytes are
    cached hard by the URL, so a new upload has to be a new URL.

    In milliseconds rather than seconds. The bytes are served `immutable` for a
    year, so two uploads that happened to land in the same second would share a
    URL and the second picture would never be seen — by anyone who had already
    loaded the first, for as long as their cache held it.
    """
    if not user_id or updated_at is None:
        return None
    return f"/api/auth/avatar/{user_id}/?v={int(updated_at.timestamp() * 1000)}"

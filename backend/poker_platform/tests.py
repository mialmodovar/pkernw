"""Every path the app asks for is a path the server answers.

Django mounts the coin app at /api/coins/ while the app itself is called
sidegames, and nothing on either side makes that gap visible: the missions panel
asked for /api/sidegames/missions/, got a 404, swallowed it the way every poll
in the client swallows a failure, and drew nothing at all. The feature looked
like it had never been deployed, on a server where it was running perfectly.

So the client's own source is read here and every URL it calls is put through
the real resolver. It is a strange-looking test and it is the only place the two
halves of a wrong URL can meet before a player does.
"""

import re
from pathlib import Path

from django.test import SimpleTestCase
from django.urls import Resolver404, resolve

FRONTEND = Path(__file__).resolve().parent.parent.parent / "frontend" / "src"

# api.get("/coins/wallet/"), api.post(`${COINS}/missions/claim/`, …
CALL = re.compile(r"""api\.(?:get|post|patch|put|delete)\(\s*(["'`])([^"'`]+)\1""")

# And any string that is plainly one of these paths, wherever it is written.
# A client that keeps its URLs in a lookup table — see ADMIN_PATHS in GamePage —
# hands `api.post` a variable, and a check that only read the call site would
# quietly stop covering exactly the paths somebody took the trouble to name.
#
# Two things separate an API path from one of the client's own routes, which
# share these prefixes and are not the server's business at all: an API path
# ends in a slash, every one of them, and it never contains a `:name` segment —
# that is React Router's syntax, not Django's. A call written without its
# trailing slash is missed here, and is a redirect rather than a 404, which is
# the failure this test is not about.
LITERAL = re.compile(
    r"""(["'`])(/(?:auth|clubs|coins|ledger|tournaments)/[^"'`\s:]*/)\1""",
)

# The constants the client builds those paths from, so a template literal can be
# resolved rather than skipped. Read from the same file the client reads.
CONSTANT = re.compile(r"""export const (\w+) = "([^"]+)";""")

# Stand-ins for the parts of a path that are filled in at runtime.
PLACEHOLDER = re.compile(r"\$\{[^}]*\}")


def api_paths():
    """Every URL the client calls, with its constants and ids filled in."""
    constants = dict(CONSTANT.findall((FRONTEND / "api" / "paths.js").read_text()))

    found = set()
    for source in [*FRONTEND.rglob("*.js"), *FRONTEND.rglob("*.jsx")]:
        if source.name.endswith(".test.js"):
            continue
        text = source.read_text()
        for _quote, path in [*CALL.findall(text), *LITERAL.findall(text)]:
            for name, value in constants.items():
                path = path.replace(f"${{{name}}}", value)
            # Anything still interpolated is an id or a name; any value will do,
            # since what is being checked is that the route exists at all.
            path = PLACEHOLDER.sub("1", path)
            if path.startswith("/"):
                found.add(path)
    return sorted(found)


class EveryClientPathResolvesTests(SimpleTestCase):
    def test_the_client_asks_for_nothing_the_server_does_not_serve(self):
        unresolved = []
        for path in api_paths():
            try:
                resolve(f"/api{path}")
            except Resolver404:
                unresolved.append(path)

        self.assertEqual(
            unresolved, [],
            "The client calls these and the server has no route for them. "
            "A 404 here is a feature that silently does nothing.",
        )

    def test_it_is_actually_reading_the_client(self):
        """A regex that matched nothing would pass the test above forever."""
        paths = api_paths()

        self.assertGreater(len(paths), 20)
        self.assertIn("/coins/missions/", paths)
        self.assertIn("/coins/wallet/", paths)

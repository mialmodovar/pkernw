"""Serves the compiled frontend from the same origin as the API.

The client calls `/api` relatively and opens its websocket on the current host,
so serving both from one place keeps that working with no CORS and no proxy in
front. Whitenoise handles the hashed asset files; this handles every other path,
which belongs to the client-side router.
"""

from django.conf import settings
from django.http import FileResponse, HttpResponseNotFound
from django.views import View


class SpaView(View):
    def get(self, request, *args, **kwargs):
        index = settings.FRONTEND_DIST / "index.html"
        if not index.exists():
            return HttpResponseNotFound(
                "Frontend build not found. Run `npm run build` and copy dist/ to "
                f"{settings.FRONTEND_DIST}, or run the Vite dev server instead."
            )
        # Not cached: the HTML names the hashed asset files, so a stale copy
        # would point at bundles that no longer exist after a deploy.
        response = FileResponse(index.open("rb"), content_type="text/html")
        response["Cache-Control"] = "no-store"
        return response

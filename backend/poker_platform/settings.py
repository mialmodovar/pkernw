"""Django settings for poker_platform project."""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent


def _env_list(name, default):
    raw = os.environ.get(name)
    return [item.strip() for item in raw.split(",") if item.strip()] if raw else default


# Everything below falls back to the old development values, so running the
# project locally needs no environment at all. A deployment sets these.
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-u!rm*@fajrlno_f%2+7_fq9m79(6#$jgxd*7_v14-b_dr!%eyj",
)

DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() == "true"

ALLOWED_HOSTS = _env_list("DJANGO_ALLOWED_HOSTS", ["*"])
CSRF_TRUSTED_ORIGINS = _env_list("DJANGO_CSRF_TRUSTED_ORIGINS", [])

# Railway (and similar) publish the public hostname, so the deployment works
# without having to remember to set it by hand.
_platform_domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN")
if _platform_domain:
    if _platform_domain not in ALLOWED_HOSTS and "*" not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_platform_domain)
    origin = f"https://{_platform_domain}"
    if origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(origin)

# ── Apps ──────────────────────────────────────────────────────────────────

INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "corsheaders",
    # Local
    "accounts",
    "tournaments",
    "game",
    "clubs",
    "sidegames",
    "cash",
]

# ── Middleware ─────────────────────────────────────────────────────────────

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "poker_platform.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "poker_platform.wsgi.application"
ASGI_APPLICATION = "poker_platform.asgi.application"

# ── Database ──────────────────────────────────────────────────────────────

def _database_from_url(url):
    """Parse the single connection URL that managed Postgres add-ons provide."""
    from urllib.parse import unquote, urlparse

    parsed = urlparse(url)
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": parsed.path.lstrip("/"),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "",
        "PORT": str(parsed.port or 5432),
        "CONN_MAX_AGE": 60,
    }


if os.environ.get("DATABASE_URL"):
    DATABASES = {"default": _database_from_url(os.environ["DATABASE_URL"])}
elif os.environ.get("POSTGRES_DB"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ["POSTGRES_DB"],
            "USER": os.environ.get("POSTGRES_USER", "poker"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
            "HOST": os.environ.get("POSTGRES_HOST", "db"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": 60,
        }
    }
elif DEBUG:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    # Refuse rather than fall back. A container's SQLite file is wiped on every
    # deploy, and losing tournament results and balances silently is worse than
    # failing to boot.
    raise ImproperlyConfigured(
        "No database configured. Set DATABASE_URL (or the POSTGRES_* variables) "
        "when DJANGO_DEBUG is false — a SQLite file inside the container would "
        "be discarded on the next deploy."
    )

# ── Auth ──────────────────────────────────────────────────────────────────

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

# ── DRF ───────────────────────────────────────────────────────────────────

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=2),
    # A month, and rotated on every refresh, so somebody who opens the app at
    # all inside a month is never asked to log in again. Seven days sounds like
    # a long session until you have been signed out mid-week for the third time;
    # this is a home poker game, not a bank.
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    # Each refresh hands back a new one, so an active player's window keeps
    # moving rather than expiring a month after they first logged in.
    "ROTATE_REFRESH_TOKENS": True,
}

# ── Channels ──────────────────────────────────────────────────────────────

if os.environ.get("REDIS_URL"):
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [os.environ["REDIS_URL"]]},
        },
    }
else:
    # Single process only — the tournament engine also keeps per-tournament
    # state in memory, so this project must run as ONE web process for now.
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        },
    }

# ── CORS (dev) ────────────────────────────────────────────────────────────

CORS_ALLOWED_ORIGINS = _env_list("DJANGO_CORS_ORIGINS", [])
CORS_ALLOW_ALL_ORIGINS = not CORS_ALLOWED_ORIGINS

# ── i18n / static ────────────────────────────────────────────────────────

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# The compiled frontend, copied in by the Docker build. Served from this same
# origin so the client's relative /api calls and same-host websocket keep
# working with no CORS and no proxy in front.
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", BASE_DIR / "frontend_dist"))
if FRONTEND_DIST.exists():
    WHITENOISE_ROOT = FRONTEND_DIST
    WHITENOISE_INDEX_FILE = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

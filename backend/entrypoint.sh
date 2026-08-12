#!/bin/sh
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput

# One process, deliberately: the tournament engine holds per-tournament state in
# memory, so a second worker would run a second engine for the same tournament.
exec daphne -b 0.0.0.0 -p "${PORT:-8000}" poker_platform.asgi:application

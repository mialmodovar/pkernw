# pkernw

A private, multiplayer No-Limit Hold'em tournament table: a Django/Channels
backend running the game engine, and a React table that players sit at in the
browser, with cameras and chat.

- `backend/` — Django, Django REST Framework and Channels. The tournament
  engine lives in [backend/game/engine/](backend/game/engine/).
- `frontend/` — React, Vite, Tailwind and Zustand.

## Running it locally

Two processes: Django on port 8000 and Vite on port 3000. Vite proxies `/api`
and `/ws` to Django, so **the app is <http://localhost:3000>** — opening port
8000 gets you the API, not the table.

### Backend

```sh
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser      # first run only — staff can host tournaments
python manage.py runserver            # Daphne serves it: HTTP and websockets on :8000
```

With no `POSTGRES_*` or `DATABASE_URL` set, `DJANGO_DEBUG` defaults to true and
the database is a local SQLite file. With no `REDIS_URL`, channels run in
memory. Both are fine for one machine — and the engine keeps per-tournament
state in memory, so this must run as a **single process** either way.

### Frontend

```sh
cd frontend
npm install
npm run dev                           # http://localhost:3000
```

Node 20 or newer. (Vite and Vitest both fail to start on Node 16.)

## Tests

```sh
cd backend && python manage.py test   # the engine, the stats miner, the ledger
cd frontend && npm test               # hand reads and profile thresholds
npm run lint
```

## The layout sandbox

`/dev/table` renders the real game page against mock data, with a panel of
knobs for player counts, cards, showdowns and cameras — the way to look at
table layout without dealing yourself a hand. Staff accounts only.

## Production shape

```sh
cp .env.example .env                  # fill in the secret, hosts and password
docker compose up -d --build          # http://localhost:8080
```

Daphne serves the API and the compiled frontend from one container against
Postgres — [backend/entrypoint.sh](backend/entrypoint.sh) migrates, collects
static files and starts it. Deployed the same way from
[railway.json](railway.json). Keep it at one replica: a second instance would
run a second engine for the same tournament and the two would fight over the
players.

## Refreshing dev with production data

```sh
./scripts/sync-prod-db-to-dev.sh
```

Replaces the `dev` environment's Postgres with a copy of production's, dumping
dev's current contents to `.db-dumps/` first. Needs the Railway CLI (logged in)
and `brew install postgresql@18` — the servers run 18 and pg_dump refuses a
server newer than itself.

Railway's databases listen only on their own private network, so the script
opens a public TCP proxy on each one, copies the data, and deletes both proxies
on the way out — including when a step fails. A proxy you set up by hand is
reused and left alone. `railway connect --tunnel-only` would avoid the proxies
altogether, but its SSH tunnel times out here.

The dump carries production's schema as well as its rows, so dev comes back on
whatever migration production has applied — behind dev's own code whenever a
migration has not shipped yet, and a column dev's code expects but does not find
makes those queries fail rather than degrade. So the sync ends by deploying dev,
since [backend/entrypoint.sh](backend/entrypoint.sh) migrates on boot. It also
clears dev's sessions and rotates dev's `DJANGO_SECRET_KEY`: user ids now belong
to production's accounts, and a token left in your browser would still verify
and log you in as whoever holds that id.

#!/usr/bin/env bash
#
# Copy the production Postgres data into the dev Postgres, on Railway.
#
#   ./scripts/sync-prod-db-to-dev.sh          # asks before touching dev
#   ./scripts/sync-prod-db-to-dev.sh --yes    # no prompt
#   ./scripts/sync-prod-db-to-dev.sh --keep-dumps
#   ./scripts/sync-prod-db-to-dev.sh --keep-logins
#   ./scripts/sync-prod-db-to-dev.sh --no-deploy
#
# Run it from anywhere; paths are resolved from the script's own location.
#
# Railway's databases listen only on each environment's private network, so to
# reach them from here the script opens a public TCP proxy on each Postgres,
# copies the data, and deletes both proxies again on the way out — including
# when something fails part way. A proxy you had already set up by hand is used
# as-is and never deleted. (`railway connect --tunnel-only` would avoid the
# proxies entirely, but its SSH tunnel times out on this machine.)
#
# Dev is REPLACED, not merged: its public schema is dropped and rebuilt from the
# production dump. Dev's previous contents are dumped to .db-dumps/ first.
#
# Because auth_user is replaced too, a user id comes to mean a different person,
# and a JWT already sitting in your browser's localStorage would still verify —
# it would just log you in as whoever now holds that id. So the sync ends by
# clearing dev's sessions and rotating dev's DJANGO_SECRET_KEY, which makes every
# pre-sync token fail and sends the frontend back to the login page. Skip that
# with --keep-logins.
#
# The dump also carries production's SCHEMA, which leaves dev at whatever
# migration production has applied — behind dev's own code whenever a migration
# has not shipped to production yet. A missing column is not a quiet difference:
# the tournament list filters on `format`, so before 0024 reached production a
# synced dev listed no tournaments at all. The script therefore finishes by
# deploying dev, because backend/entrypoint.sh runs `manage.py migrate` on boot.
# --no-deploy skips it and leaves dev on production's schema.
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_SERVICE="${DB_SERVICE:-Postgres}"
PROD_ENV="${PROD_ENV:-production}"
DEV_ENV="${DEV_ENV:-dev}"
APP_SERVICE="${APP_SERVICE:-pkernw-app}"
DB_PORT=5432
DUMP_DIR="${DUMP_DIR:-$PROJECT_DIR/.db-dumps}"

# Railway runs Postgres 18 and pg_dump refuses a server newer than itself, so
# prefer the v18 client over whatever happens to be first on PATH.
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@18/bin}"

ASSUME_YES=0
KEEP_DUMPS=0
KEEP_LOGINS=0
NO_DEPLOY=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    --keep-dumps) KEEP_DUMPS=1 ;;
    --keep-logins) KEEP_LOGINS=1 ;;
    --no-deploy) NO_DEPLOY=1 ;;
    -h|--help) sed -n '3,36p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# All progress goes to stderr, so the helpers below can return values on stdout.
log()  { printf '\033[1;34m==>\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

for tool in pg_dump pg_restore psql; do
  [ -x "$PG_BIN/$tool" ] || die "missing $PG_BIN/$tool — install with: brew install postgresql@18"
done
command -v railway >/dev/null || die "the railway CLI is not installed"
command -v python3 >/dev/null || die "python3 is required"
railway whoami >/dev/null 2>&1 || die "not logged in — run: railway login"

WORK_DIR="$(mktemp -d)"
# Proxies this run created, one "environment proxy-id" per line. Kept in a file
# rather than an array because these must be closed even if the code that
# created them ever runs in a subshell, where an array append would be lost.
# Proxies that already existed are deliberately absent, so cleanup leaves them.
CREATED_PROXIES="$WORK_DIR/created-proxies"
: > "$CREATED_PROXIES"

cleanup() {
  local status=$?
  local envname proxy_id
  while read -r envname proxy_id; do
    [ -n "$proxy_id" ] || continue
    log "closing the temporary $envname proxy"
    railway tcp-proxy delete "$proxy_id" --service "$DB_SERVICE" \
      --environment "$envname" --yes >/dev/null 2>&1 \
      || warn "could not delete the $envname proxy ($proxy_id) — remove it in the Railway dashboard"
  done < "$CREATED_PROXIES"
  rm -rf "$WORK_DIR"
  return $status
}
trap cleanup EXIT

# Reuse an existing proxy on the DB port, otherwise create one and mark it for
# deletion. Sets PROXY_ENDPOINT to host:port.
# Usage: ensure_proxy <environment>
ensure_proxy() {
  local envname="$1" endpoint="" created="" proxy_id=""
  PROXY_ENDPOINT=""

  endpoint="$(railway tcp-proxy list --service "$DB_SERVICE" --environment "$envname" --json 2>/dev/null \
    | APP_PORT="$DB_PORT" python3 "$WORK_DIR/proxy.py" endpoint || true)"
  if [ -n "$endpoint" ]; then
    log "reusing the existing $envname proxy at $endpoint"
    PROXY_ENDPOINT="$endpoint"
    return 0
  fi

  log "opening a temporary public proxy on the $envname database"
  created="$(railway tcp-proxy create --port "$DB_PORT" --service "$DB_SERVICE" \
    --environment "$envname" --json 2>&1)" \
    || die "could not create a TCP proxy for $envname: $created"

  endpoint="$(printf '%s' "$created" | APP_PORT="$DB_PORT" python3 "$WORK_DIR/proxy.py" endpoint)"
  proxy_id="$(printf '%s' "$created" | APP_PORT="$DB_PORT" python3 "$WORK_DIR/proxy.py" id)"
  [ -n "$endpoint" ] && [ -n "$proxy_id" ] || die "could not read the new $envname proxy details"

  printf '%s %s\n' "$envname" "$proxy_id" >> "$CREATED_PROXIES"
  PROXY_ENDPOINT="$endpoint"
}

# Take the service's own DATABASE_URL and swap in the proxy host:port. The
# credentials are the same either way.
# Usage: db_url_for <environment> <host:port>
db_url_for() {
  local envname="$1" hostport="$2"
  railway variables --service "$DB_SERVICE" --environment "$envname" --json 2>/dev/null \
    | HOSTPORT="$hostport" python3 "$WORK_DIR/url.py"
}

# Usage: wait_for_db <label> <url>
wait_for_db() {
  local label="$1" url="$2" waited=0
  until "$PG_BIN/psql" "$url" -Atc 'select 1' >/dev/null 2>&1; do
    waited=$((waited + 2))
    [ "$waited" -lt 90 ] || die "the $label database never became reachable through its proxy"
    sleep 2
  done
}

cat > "$WORK_DIR/proxy.py" <<'PY'
import json, os, sys

want = sys.argv[1]
app_port = int(os.environ["APP_PORT"])
data = json.load(sys.stdin)
# `create` returns a single {"proxy": {...}}; `list` returns {"proxies": [...]}.
proxies = data.get("proxies") or ([data["proxy"]] if data.get("proxy") else [])
for p in proxies:
    if int(p.get("applicationPort", 0)) != app_port:
        continue
    if want == "id":
        print(p["id"])
    else:
        print(p.get("endpoint") or f"{p['domain']}:{p['proxyPort']}")
    break
PY

cat > "$WORK_DIR/url.py" <<'PY'
import json, os, sys, urllib.parse as up

data = json.load(sys.stdin)
if "DATABASE_URL" not in data:
    sys.exit("this service has no DATABASE_URL")
u = up.urlparse(data["DATABASE_URL"])
user = u.username or "postgres"
pw = up.quote(u.password or "", safe="")
db = u.path.lstrip("/") or "railway"
print("postgresql://" + user + ":" + pw + "@" + os.environ["HOSTPORT"] + "/" + db)
PY

# The proxy terminates at Postgres itself, which offers TLS with a certificate
# naming the internal host — so encrypt, but do not demand a matching name.
export PGSSLMODE="${PGSSLMODE:-prefer}"
export PGCONNECT_TIMEOUT=30

mkdir -p "$DUMP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
PROD_DUMP="$DUMP_DIR/prod-$STAMP.dump"
DEV_BACKUP="$DUMP_DIR/dev-before-$STAMP.dump"

ensure_proxy "$PROD_ENV"; PROD_ENDPOINT="$PROXY_ENDPOINT"
ensure_proxy "$DEV_ENV";  DEV_ENDPOINT="$PROXY_ENDPOINT"
PROD_URL="$(db_url_for "$PROD_ENV" "$PROD_ENDPOINT")"
DEV_URL="$(db_url_for "$DEV_ENV" "$DEV_ENDPOINT")"

log "waiting for both databases to answer"
wait_for_db "$PROD_ENV" "$PROD_URL"
wait_for_db "$DEV_ENV" "$DEV_URL"

prod_size="$("$PG_BIN/psql" "$PROD_URL" -Atc 'select pg_size_pretty(pg_database_size(current_database()))')"
dev_tables="$("$PG_BIN/psql" "$DEV_URL" -Atc "select count(*) from information_schema.tables where table_schema='public'")"
log "production is $prod_size; dev currently has $dev_tables table(s) in public"

if [ "$ASSUME_YES" -ne 1 ]; then
  printf '\nThis REPLACES the dev database with production data. Type "yes" to continue: ' >&2
  read -r reply
  [ "$reply" = "yes" ] || die "aborted"
fi

# --no-owner/--no-privileges: dev need not have prod's roles, and ownership
# carries nothing worth moving between environments.
log "dumping production -> $PROD_DUMP"
"$PG_BIN/pg_dump" "$PROD_URL" --format=custom --no-owner --no-privileges --file "$PROD_DUMP"

log "backing up current dev -> $DEV_BACKUP"
"$PG_BIN/pg_dump" "$DEV_URL" --format=custom --no-owner --no-privileges --file "$DEV_BACKUP"

# Anything still connected to dev — the dev app, an open GUI — would fight the
# schema drop, so close those sessions first.
log "closing other connections to the dev database"
"$PG_BIN/psql" "$DEV_URL" -Atc \
  "select pg_terminate_backend(pid) from pg_stat_activity
    where datname = current_database() and pid <> pg_backend_pid()" >/dev/null

log "resetting the dev schema"
"$PG_BIN/psql" "$DEV_URL" -v ON_ERROR_STOP=1 -q \
  -c 'drop schema if exists public cascade' \
  -c 'create schema public' \
  -c 'grant all on schema public to public'

log "restoring production data into dev"
"$PG_BIN/pg_restore" --dbname "$DEV_URL" --no-owner --no-privileges \
  --single-transaction "$PROD_DUMP"

restored="$("$PG_BIN/psql" "$DEV_URL" -Atc "select count(*) from information_schema.tables where table_schema='public'")"
log "dev now has $restored table(s) in public"

# Production's rows now occupy dev's user ids, so any credential minted before
# this sync identifies the wrong person. Dropping sessions and replacing the
# signing key makes every pre-sync token fail to verify; the frontend's 401
# handler then clears its tokens and redirects to the login page.
SECRET_ROTATED=0
if [ "$KEEP_LOGINS" -ne 1 ]; then
  log "clearing sessions copied over from production"
  "$PG_BIN/psql" "$DEV_URL" -v ON_ERROR_STOP=1 -q -c "do \$\$ begin
      if to_regclass('public.django_session') is not null then
        truncate table django_session;
      end if;
    end \$\$;" \
    || warn "could not clear django_session"

  log "rotating dev's DJANGO_SECRET_KEY so pre-sync logins stop working"
  # --stdin keeps the new secret out of the process list.
  if python3 -c 'import secrets; print(secrets.token_urlsafe(50))' \
      | railway variable set DJANGO_SECRET_KEY --stdin \
          --service "$APP_SERVICE" --environment "$DEV_ENV" >/dev/null 2>&1; then
    SECRET_ROTATED=1
  else
    warn "could not rotate DJANGO_SECRET_KEY on $APP_SERVICE/$DEV_ENV — old logins"
    warn "may still work as the wrong person. Clear localStorage for the dev site,"
    warn "or change that variable in the Railway dashboard."
  fi
fi

if [ "$KEEP_DUMPS" -ne 1 ]; then
  rm -f "$PROD_DUMP"
  log "removed the production dump; dev's pre-sync backup is kept at $DEV_BACKUP"
else
  log "dumps kept in $DUMP_DIR"
fi

# This step is not optional housekeeping: the dump carries production's schema,
# so dev is left at whatever migration production has applied. Anything dev's
# code expects but production has not migrated yet is now a missing column, and
# queries touching it fail outright — the tournament list, for one, filters on
# `format`. backend/entrypoint.sh runs `manage.py migrate` on every boot, so a
# deploy brings the schema back up to the code. It also drops the connections
# the app still holds to the pre-sync database.
if [ "$NO_DEPLOY" -eq 1 ]; then
  warn "skipping the dev deploy — dev is on production's schema until you run:"
  warn "  railway redeploy --service $APP_SERVICE --environment $DEV_ENV --yes"
  warn "Until then, anything needing a migration production lacks will error."
elif [ "$SECRET_ROTATED" -eq 1 ]; then
  # Setting the variable already triggered a deploy, which migrates on boot.
  log "done — dev is redeploying, which applies any pending migrations"
  log "log in again once it is up (the old tokens no longer work)"
else
  log "redeploying dev so entrypoint.sh applies any pending migrations"
  if railway redeploy --service "$APP_SERVICE" --environment "$DEV_ENV" --yes >/dev/null 2>&1; then
    log "done — dev is redeploying"
  else
    warn "could not redeploy $APP_SERVICE/$DEV_ENV — run this yourself, or dev"
    warn "stays on production's schema:"
    warn "  railway redeploy --service $APP_SERVICE --environment $DEV_ENV --yes"
  fi
fi

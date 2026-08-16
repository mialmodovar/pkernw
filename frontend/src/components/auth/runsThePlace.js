/**
 * Whether this account runs the installation rather than plays on it.
 *
 * Two flags, and they are separate on purpose: staff is a job — opening
 * tournaments, running clubs — and a superuser is whoever administers the whole
 * thing. A superuser normally has both, but the staff box can be unticked, and
 * a lock the superuser cannot open is not a lock, it is a bug.
 *
 * The server asks the same question in clubs/permissions.py; this is only about
 * which buttons to draw, and every endpoint behind them checks for itself.
 */
export function runsThePlace(user) {
  return Boolean(user?.is_staff || user?.is_superuser);
}

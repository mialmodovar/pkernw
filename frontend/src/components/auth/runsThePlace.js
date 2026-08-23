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

/**
 * Whether any of these clubs is one you help organise.
 *
 * `my_role` comes off the club payload, and the two roles that mean "organises"
 * are the same two the server checks in clubs/permissions.py.
 */
export function organisesForAClub(clubs) {
  return (clubs || []).some(
    (club) => club?.my_role === "owner" || club?.my_role === "staff",
  );
}

/**
 * The clubs you could open a game for, out of the ones you are in.
 *
 * The same two roles as above, kept beside them so "organises" is one answer
 * rather than two that drift. A picker built from every club you are a member
 * of would offer people rooms the server will refuse them.
 */
export function clubsYouOrganise(clubs) {
  return (clubs || []).filter(
    (club) => club?.my_role === "owner" || club?.my_role === "staff",
  );
}

/**
 * Whether this person may open a tournament.
 *
 * Two ways in, matching StaffCreatesTournaments on the server: site staff, who
 * run the installation, and anybody who is staff or owner of a club, who runs
 * their own community's nights. Club staff was the case the create page used to
 * miss — it asked runsThePlace alone, so an owner of a club was shown the
 * button on the lobby, allowed through by the server, and then told "Staff
 * only" by the page in between.
 */
export function opensTournaments(user, clubs) {
  return runsThePlace(user) || organisesForAClub(clubs);
}

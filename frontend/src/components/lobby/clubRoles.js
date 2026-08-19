/**
 * Who may do what to whom inside a club, as the page needs to know it.
 *
 * The server is the authority — see clubs/permissions.py, where the same ladder
 * is enforced — and this decides which buttons are worth drawing. A button the
 * server would refuse is worse than a missing one: it reads as permission.
 *
 * Two questions come off the club payload rather than off the role, because the
 * superuser has no role and may still do everything: `can_manage` is "may
 * organise" and `can_own` is "may decide who else organises".
 */

export const ROLE_LABEL = { owner: "Owner", staff: "Staff", member: "Member" };

/** What a role lets somebody do, in the one line the members list has room for. */
export const ROLE_BLURB = {
  owner: "Runs the club. Can staff it, edit it and close it.",
  staff: "Opens tournaments and runs the leagues.",
  member: "Plays, and appears in the tables.",
};

/**
 * The buttons to offer against one member.
 *
 * Nothing at all unless you may own the club: staffing people is the owner's
 * job, and the endpoint says so. Nothing against the owner either — there is one
 * owner, and the way to replace them is to hand the club to somebody else, which
 * is an action on that person's row rather than on theirs.
 */
export function memberActions(member, { canOwn = false, myUsername = null } = {}) {
  if (!canOwn || !member) return [];
  if (member.role === "owner") return [];

  const who = member.display_name || member.username;
  const actions = [];

  if (member.role === "member") {
    actions.push({ kind: "role", role: "staff", label: "Make staff" });
  } else {
    actions.push({ kind: "role", role: "member", label: "Make member" });
  }

  actions.push({
    kind: "role",
    role: "owner",
    label: "Hand over",
    confirm: `Hand the club over to ${who}? They become the owner and you become staff. `
      + "Only they can hand it back.",
  });

  // Removing yourself is leaving, which has its own button and its own rules.
  if (member.username !== myUsername) {
    actions.push({
      kind: "remove",
      label: "Remove",
      danger: true,
      confirm: `Remove ${who} from the club? Their results stay in the tables they played in.`,
    });
  }

  return actions;
}

/** Whether the reader is in the club at all. */
export function isMember(club) {
  return Boolean(club?.my_role);
}

/**
 * Whether the reader can walk out, and why not when they cannot.
 *
 * An owner cannot leave people behind with nobody to run the club — the server
 * refuses it — so the button says what to do instead rather than failing.
 */
export function leaveState(club) {
  if (!isMember(club)) return { can: false, reason: null };
  if (club.my_role === "owner" && (club.member_count || 0) > 1) {
    return { can: false, reason: "Hand the club over to somebody else first." };
  }
  return { can: true, reason: null };
}

/** What being public or private actually means, said in one line. */
export function privacyBlurb(isPublic) {
  return isPublic
    ? "Anyone can find this club and join it."
    : "Found only with the invite code. It will not be listed.";
}

/**
 * Whether a typed confirmation matches what deleting this club requires.
 *
 * The club's slug, which is what the server checks too. Case and stray spaces
 * forgiven: this is a speed bump against deleting the wrong thing, not a
 * password.
 */
export function deleteConfirmed(club, typed) {
  if (!club?.slug) return false;
  return String(typed || "").trim().toLowerCase() === club.slug.toLowerCase();
}

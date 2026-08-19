import { describe, expect, it } from "vitest";

import {
  ROLE_LABEL, deleteConfirmed, leaveState, memberActions, privacyBlurb,
} from "./clubRoles";

const owner = { username: "ana", role: "owner" };
const staff = { username: "bea", role: "staff" };
const plain = { username: "caio", role: "member", display_name: "Caio S" };

describe("memberActions", () => {
  it("offers nothing to somebody who does not run the club", () => {
    expect(memberActions(plain, { canOwn: false })).toEqual([]);
  });

  it("offers nothing against the owner — you hand the club over instead", () => {
    expect(memberActions(owner, { canOwn: true })).toEqual([]);
  });

  it("promotes a member and demotes a staffer", () => {
    expect(memberActions(plain, { canOwn: true })[0]).toMatchObject({ role: "staff", label: "Make staff" });
    expect(memberActions(staff, { canOwn: true })[0]).toMatchObject({ role: "member", label: "Make member" });
  });

  it("always offers the handover, and names who it is going to", () => {
    const handover = memberActions(plain, { canOwn: true }).find((one) => one.role === "owner");
    expect(handover.label).toBe("Hand over");
    expect(handover.confirm).toContain("Caio S");
  });

  it("marks removal as the dangerous one, and says what survives it", () => {
    const remove = memberActions(plain, { canOwn: true }).find((one) => one.kind === "remove");
    expect(remove.danger).toBe(true);
    expect(remove.confirm).toContain("results stay");
  });

  it("does not offer to remove yourself — that is leaving", () => {
    const actions = memberActions(plain, { canOwn: true, myUsername: "caio" });
    expect(actions.some((one) => one.kind === "remove")).toBe(false);
  });
});

describe("leaveState", () => {
  it("lets a member walk out", () => {
    expect(leaveState({ my_role: "member", member_count: 4 })).toMatchObject({ can: true });
  });

  it("stops an owner stranding the club, and says what to do", () => {
    const state = leaveState({ my_role: "owner", member_count: 3 });
    expect(state.can).toBe(false);
    expect(state.reason).toContain("Hand the club over");
  });

  it("lets the last person out, owner or not", () => {
    expect(leaveState({ my_role: "owner", member_count: 1 })).toMatchObject({ can: true });
  });

  it("offers nothing to somebody who is not in it", () => {
    expect(leaveState({ my_role: null })).toMatchObject({ can: false, reason: null });
  });
});

describe("privacyBlurb", () => {
  it("says what each setting does rather than naming it", () => {
    expect(privacyBlurb(true)).toContain("find this club");
    expect(privacyBlurb(false)).toContain("invite code");
  });
});

describe("deleteConfirmed", () => {
  const club = { slug: "quinta-poker" };

  it("takes the slug, forgiving case and spaces", () => {
    expect(deleteConfirmed(club, "quinta-poker")).toBe(true);
    expect(deleteConfirmed(club, "  Quinta-Poker ")).toBe(true);
  });

  it("refuses anything else, including the club's name", () => {
    expect(deleteConfirmed(club, "Quinta Poker")).toBe(false);
    expect(deleteConfirmed(club, "")).toBe(false);
    expect(deleteConfirmed(club, "delete")).toBe(false);
  });
});

describe("ROLE_LABEL", () => {
  it("has a printable name for every role the server sends", () => {
    expect(Object.keys(ROLE_LABEL).sort()).toEqual(["member", "owner", "staff"]);
  });
});

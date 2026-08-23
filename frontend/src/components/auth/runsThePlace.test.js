import { describe, expect, it } from "vitest";

import {
  clubsYouOrganise, opensTournaments, organisesForAClub, runsThePlace,
} from "./runsThePlace";

describe("runsThePlace", () => {
  it("is site staff and the superuser, and nobody else", () => {
    expect(runsThePlace({ is_staff: true })).toBe(true);
    expect(runsThePlace({ is_superuser: true })).toBe(true);
    expect(runsThePlace({})).toBe(false);
    expect(runsThePlace(null)).toBe(false);
  });
});

describe("organisesForAClub", () => {
  it("is true for staff and for the owner", () => {
    expect(organisesForAClub([{ my_role: "staff" }])).toBe(true);
    expect(organisesForAClub([{ my_role: "member" }, { my_role: "owner" }])).toBe(true);
  });

  it("is false for somebody who only plays there", () => {
    expect(organisesForAClub([{ my_role: "member" }, { my_role: null }])).toBe(false);
  });

  it("survives clubs that have not loaded", () => {
    expect(organisesForAClub(undefined)).toBe(false);
    expect(organisesForAClub([])).toBe(false);
  });
});

describe("opensTournaments", () => {
  it("lets a club owner open one, which is the bug this fixes", () => {
    expect(opensTournaments({ is_staff: false }, [{ my_role: "staff" }])).toBe(true);
  });

  it("lets site staff open one with no club at all", () => {
    expect(opensTournaments({ is_staff: true }, [])).toBe(true);
  });

  it("refuses a player who neither runs the place nor organises anywhere", () => {
    expect(opensTournaments({}, [{ my_role: "member" }])).toBe(false);
  });
});

describe("clubsYouOrganise", () => {
  const clubs = [
    { slug: "quinta", my_role: "owner" },
    { slug: "casa", my_role: "member" },
    { slug: "liga", my_role: "staff" },
    { slug: "outra", my_role: null },
  ];

  it("is the ones you could actually open a game for", () => {
    expect(clubsYouOrganise(clubs).map((one) => one.slug)).toEqual(["quinta", "liga"]);
  });

  it("offers nothing to somebody who only plays", () => {
    expect(clubsYouOrganise([{ my_role: "member" }])).toEqual([]);
  });

  it("has nothing to say about a list that never loaded", () => {
    expect(clubsYouOrganise(null)).toEqual([]);
  });
});

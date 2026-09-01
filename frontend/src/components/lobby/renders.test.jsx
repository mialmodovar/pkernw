/**
 * That the lobby's rows and its panel strip actually draw.
 *
 * Everything else in this suite is pure logic, which is the right shape for a
 * rule worth stating — but it left the two biggest components in the lobby with
 * no cover at all, and both were rewritten at once: a card that had grown into
 * three ragged flex lines, and a strip of icons that did not say what they
 * opened. A crash in either is a white screen where the games should be, and
 * neither eslint nor the build would have said a word about it.
 *
 * Rendered to a string rather than to a document, so this needs no jsdom: it is
 * a smoke test for "does it throw", not a test of what it looks like.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import PanelStrip from "./PanelStrip";
import TournamentBrowser from "./TournamentBrowser";
import TournamentCard from "./TournamentCard";
import { SIDE_PANELS } from "./sidePanels";

const base = {
  id: 1, name: "Sexta-feira Freezeout", status: "lobby",
  player_count: 23, max_players: 100, players_per_table: 9,
  buy_in_cents: 2000, buy_in_coins: 0, bounty_mode: "none", bounty_cents: 0,
  registered: [{ username: "a", display_name: "Ana" }, { username: "b", display_name: "Bo" }],
  payout_structure: [50, 30, 20], host_name: "dan", host_display_name: "Dan",
  scheduled_start_at: new Date(Date.now() + 3600e3).toISOString(),
  created_at: new Date().toISOString(),
};

const CASES = {
  "lobby, plain": base,
  "club PKO, running, late reg": {
    ...base, status: "running", is_joined: true, late_registration_open: true,
    late_reg_level: 12, late_registration_seconds_left: 500,
    bounty_mode: "progressive", bounty_cents: 500,
    club_emoji: "🐷", club_name: "Paga Porco", league_name: "Liga de Inverno",
    started_at: new Date(Date.now() - 6120e3).toISOString(), can_manage: true,
  },
  "finished, I won": {
    ...base, status: "finished", my_finish_position: 1, winner_name: "Dan",
    started_at: new Date(Date.now() - 9000e3).toISOString(),
    finished_at: new Date().toISOString(),
  },
  "finished, no position, no winner": { ...base, status: "finished" },
  "free, coins, full, paused": {
    ...base, status: "paused", buy_in_cents: 0, buy_in_coins: 500,
    player_count: 100, can_manage: true, my_finish_position: 3, my_rebuy_count: 0,
  },
};

describe("renders without throwing", () => {
  for (const [label, tournament] of Object.entries(CASES)) {
    it(`TournamentCard — ${label}`, () => {
      const html = renderToStaticMarkup(
        <TournamentCard tournament={tournament}
          onJoin={() => {}} onOpen={() => {}} onOpenTable={() => {}}
          onQuit={() => {}} onDelete={() => {}} onEdit={() => {}} onRebuy={() => {}} />,
      );
      expect(html).toContain(tournament.name);
    });
  }

  it("TournamentBrowser with a mixed list", () => {
    const html = renderToStaticMarkup(
      <TournamentBrowser tournaments={Object.values(CASES)}
        onJoin={() => {}} onOpen={() => {}} onOpenTable={() => {}}
        onQuit={() => {}} onDelete={() => {}} onEdit={() => {}} onRebuy={() => {}} />,
    );
    expect(html).toContain("Sexta-feira");
  });

  it("PanelStrip prints a word under every icon", () => {
    // The whole point of the strip rewrite: six bare glyphs, three of which
    // meant something else entirely, now each carry their own name. If a label
    // ever goes missing again this is what says so.
    const html = renderToStaticMarkup(
      <MemoryRouter><PanelStrip onClubsLoaded={() => {}} /></MemoryRouter>,
    );
    for (const one of SIDE_PANELS) {
      expect(html, `no "${one.label}" in the strip`).toContain(`>${one.label}<`);
    }
    // And still one button per panel, closed, with nothing opened by default.
    expect(html.match(/<button/g)).toHaveLength(SIDE_PANELS.length);
  });
});

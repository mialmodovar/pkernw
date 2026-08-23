/**
 * The three numbers a stats panel is worth at a glance.
 *
 * The panel used to open with four tiles, two meters and a replay button — a
 * quarter of the sidebar spent on a record nobody was reading right then. This
 * is what survives the collapse: how much you have played, how often it paid,
 * and what it came to. Everything else is a click away.
 *
 * Pure, so the row can be checked without a browser, and so the rounding of a
 * rate nobody has qualified for yet is decided once.
 */

import { formatEuros } from "../game/formatMoney";

/**
 * The compact row, as [{key, label, value, title}].
 *
 * `title` is the long form, since a collapsed panel has room for a number and
 * not for the sentence that qualifies it.
 */
export function summaryRow(stats, scope = "all") {
  if (!stats) return [];
  const played = stats.tournaments_played || 0;
  const cashes = stats.cashes || 0;
  const completed = stats.tournaments_completed || 0;

  return [
    {
      key: "played",
      label: scope === "all" ? "Games" : "Played",
      value: String(played),
      title: `${played} played`,
    },
    {
      key: "cashes",
      // The rate is the fact, not the count: a cash in four is a different
      // player from a cash in forty. It only appears once something has
      // actually finished, because "0% in the money" before your first
      // tournament ends is a judgement rather than a statistic.
      label: "Cashes",
      value: completed > 0 ? `${cashes} · ${stats.itm_pct}%` : String(cashes),
      title: completed > 0 ? `${cashes} cashes, ${stats.itm_pct}% in the money` : `${cashes} cashes`,
    },
    {
      key: "winnings",
      label: "Won",
      value: formatEuros(stats.winnings_cents || 0),
      title: "Everything you have taken home, before what the nights cost",
    },
  ];
}

/** Whether there is enough hand data for the meters to mean anything. */
export function hasHandReads(stats) {
  return (stats?.hands_played || 0) > 0;
}

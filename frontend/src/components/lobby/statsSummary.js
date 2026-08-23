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
  if (stats.kind === "cash") return cashRow(stats);
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

/**
 * The same glance, for a cash record.
 *
 * Nothing above applies: there is no finish at a cash table, nobody is ever in
 * the money, and "played one" is not a number. Hands, and what they came to —
 * and the second of those is signed, because a cash record that could not say
 * you were down would be a scoreboard rather than a record.
 */
export function cashRow(stats) {
  const hands = stats.hands_played || 0;
  const net = stats.net_coins || 0;
  return [
    { key: "hands", label: "Hands", value: String(hands), title: `${hands} hands dealt to you` },
    {
      key: "net",
      label: "Net",
      value: signedCoins(net),
      title: net >= 0
        ? `${net} coins up across every cash hand you have played`
        : `${Math.abs(net)} coins down across every cash hand you have played`,
    },
    {
      key: "pot",
      label: "Best pot",
      value: String(stats.biggest_pot || 0),
      title: "The largest pot you have taken down",
    },
  ];
}

/** A number that has to be able to be negative, and say so. */
export function signedCoins(coins) {
  const amount = Math.round(coins || 0);
  return amount > 0 ? `+${amount}` : String(amount);
}

/** Whether there is enough hand data for the meters to mean anything. */
export function hasHandReads(stats) {
  return (stats?.hands_played || 0) > 0;
}

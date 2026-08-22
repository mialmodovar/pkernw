/**
 * The missions panel, as arithmetic and copy.
 *
 * The server decides what is finished and what has been paid — it is money, and
 * a client that decided either would be deciding how much it is owed. What is
 * left here is the reading: the order they appear in, the shape of a progress
 * bar, and the one line that says whether there is anything to collect.
 */

/** The two periods, in the order they are shown. Today first: it is today. */
export const PERIODS = [
  { key: "daily", label: "Today", note: "Resets at midnight" },
  { key: "weekly", label: "This week", note: "Resets Monday" },
];

/** The missions of one period, in the order the server sent them. */
export function forPeriod(missions, period) {
  return (missions || []).filter((one) => one.period === period);
}

/** How full a mission's bar is, 0–100. */
export function barPct(mission) {
  const target = Math.max(1, mission?.target || 1);
  return Math.min(100, Math.round(((mission?.progress || 0) / target) * 100));
}

/** "2 / 3", or a tick once it is done. */
export function progressLabel(mission) {
  if (!mission) return "";
  if (mission.claimed) return "claimed";
  if (mission.target === 1) return mission.progress >= 1 ? "done" : "not yet";
  return `${mission.progress} / ${mission.target}`;
}

/**
 * Coins sitting there waiting to be collected.
 *
 * The number the panel leads with, because it is the only part anybody needs
 * to see from across the page: whether to open it at all.
 */
export function unclaimedCoins(missions) {
  return (missions || [])
    .filter((one) => one.claimable)
    .reduce((sum, one) => sum + (one.coins || 0), 0);
}

/** How many are waiting, for the badge. */
export function claimableCount(missions) {
  return (missions || []).filter((one) => one.claimable).length;
}

/**
 * Where a period stands, in one line.
 *
 * Three states worth distinguishing: coins waiting, everything taken, and work
 * still to do. "3 of 3 done" and "180 coins waiting" are different sentences
 * and the difference is whether the player has to do anything.
 */
export function periodSummary(missions, period) {
  const rows = forPeriod(missions, period);
  if (!rows.length) return "";
  const waiting = unclaimedCoins(rows);
  if (waiting > 0) return `${waiting.toLocaleString()} coins waiting`;
  const claimed = rows.filter((one) => one.claimed).length;
  if (claimed === rows.length) return "all taken";
  return `${claimed} of ${rows.length} taken`;
}

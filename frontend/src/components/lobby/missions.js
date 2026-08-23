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
  { key: "daily", label: "Today" },
  { key: "weekly", label: "This week" },
];

/**
 * When a period starts over, said on the reader's clock.
 *
 * The server counts days and weeks in UTC — deliberately, since a day that
 * ended at 03:47 because that is when somebody first logged in is a punishment
 * rather than a reset. But "starts over at midnight" is then a lie to everybody
 * who is not on UTC: in Lisbon in summer these turn over at one in the morning,
 * and a player finishing a mission at half past midnight had already missed it
 * by a day without being told so.
 *
 * So the hour is converted rather than the rule changed. `zone` is only for the
 * tests; left out, it is wherever the browser is.
 */
export function nextReset(period, now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(0, 0, 0, 0);
  if (period === "weekly") {
    // Monday, as the server has it. getUTCDay is Sunday-first, so Sunday is
    // six days from Monday rather than one — and a Monday's next reset is a
    // week away rather than this morning.
    const days = (8 - (next.getUTCDay() || 7)) % 7 || 7;
    next.setUTCDate(next.getUTCDate() + days);
  } else {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

/**
 * The same moment, written the way the reader's own clock writes it.
 *
 * Locale and zone both left to the browser, which is the whole point: the hour
 * is theirs, and whether it is said as 01:00 or 1:00 AM is theirs too.
 */
export function resetNote(period, now = new Date(), zone = undefined) {
  const next = nextReset(period, now);

  const at = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit", minute: "2-digit", timeZone: zone,
  }).format(next);
  if (period !== "weekly") return `Starts over at ${at}`;
  const day = new Intl.DateTimeFormat(undefined, {
    weekday: "long", timeZone: zone,
  }).format(next);
  return `Starts over ${day} at ${at}`;
}

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
  if (waiting > 0) return `${waiting.toLocaleString()} to collect`;
  const claimed = rows.filter((one) => one.claimed).length;
  if (claimed === rows.length) return "all collected";
  return `${claimed} of ${rows.length} collected`;
}

/**
 * The line the panel leads with when it is shut.
 *
 * It is the only thing most people will ever read of this, so it says the one
 * thing worth acting on rather than a score: coins sitting there, or how much
 * is left to play for today.
 */
export function headline(missions) {
  if (!missions?.length) return "";
  const waiting = unclaimedCoins(missions);
  if (waiting > 0) return `${waiting.toLocaleString()} coins to collect`;

  const today = forPeriod(missions, "daily");
  const open = today.filter((one) => !one.claimed);
  if (!open.length) return "Today's are all done — the week's are still on";
  const worth = open.reduce((sum, one) => sum + (one.coins || 0), 0);
  return `${worth.toLocaleString()} coins to play for today`;
}

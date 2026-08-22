/**
 * Where each part of the API lives, written once.
 *
 * Django mounts the coin app at /api/coins/ while the app itself is called
 * sidegames, and that gap is not guessable from either side: the missions panel
 * asked for /api/sidegames/missions/, got a 404, swallowed it the way every
 * poll here swallows a failure, and rendered nothing at all. The feature looked
 * like it had never been deployed.
 *
 * One constant per mount point, so a second caller cannot invent a second
 * spelling of the same thing.
 */

/** The wallet, the shop and the missions. Mounted from sidegames/urls.py. */
export const COINS = "/coins";

/** Accounts: the profile, the theme, presence, the watch list. */
export const AUTH = "/auth";

/** Tournaments, and the instant formats inside them. */
export const TOURNAMENTS = "/tournaments";

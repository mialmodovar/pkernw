/**
 * The one-word read on a player, from how often they enter pots and how often
 * they do it by raising.
 *
 * The thresholds are the usual full-ring ones. They are a starting point for a
 * read, not a verdict, which is why nothing is labelled below a sample where
 * the label would just be describing the cards they were dealt.
 */

// Below this, VPIP and PFR say more about the deck than about the player.
export const PROFILE_MIN_HANDS = 12;

const PROFILES = {
  nit: {
    label: "Nit",
    description: "Enters very few pots and waits for premium hands. Give their bets credit, and steal from them freely.",
  },
  rock: {
    label: "Rock",
    description: "Tight, but enters by calling more than by raising. Rarely bluffs — but rarely pressures you either.",
  },
  tag: {
    label: "TAG",
    description: "Tight and aggressive: few hands, played hard. The standard winning style, and the hardest to exploit.",
  },
  lag: {
    label: "LAG",
    description: "Loose and aggressive: plays a wide range and raises with it. Widen your calling range against them.",
  },
  station: {
    label: "Calling station",
    description: "Plays plenty of hands but seldom raises. Value bet thin and cut out the bluffs.",
  },
  maniac: {
    label: "Maniac",
    description: "Raising constantly with almost anything. Let them bet into your strong hands rather than fighting for the lead.",
  },
  balanced: {
    label: "Balanced",
    description: "No strong tendency either way yet — nothing about their frequencies stands out to exploit.",
  },
};

/**
 * Returns {label, description} once there are enough hands behind it, or null.
 */
export default function playerProfile(stats) {
  const hands = stats?.hands ?? 0;
  if (hands < PROFILE_MIN_HANDS) return null;

  const vpip = stats.vpip_pct ?? 0;
  const pfr = stats.pfr_pct ?? 0;
  // How much of their entering is done by raising rather than calling.
  const aggression = vpip > 0 ? pfr / vpip : 0;

  if (vpip >= 45 && pfr >= 30) return PROFILES.maniac;
  if (vpip < 15 && pfr < 12) return PROFILES.nit;
  if (vpip < 24) return aggression >= 0.5 ? PROFILES.tag : PROFILES.rock;
  if (vpip >= 30 && aggression >= 0.6) return PROFILES.lag;
  if (aggression < 0.4) return PROFILES.station;
  if (aggression >= 0.5) return PROFILES.tag;
  return PROFILES.balanced;
}

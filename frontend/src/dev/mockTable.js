/** Builds a table out of nothing but the sandbox config.
 *
 * Every value here is deterministic — the same config always produces the same
 * table. Randomness would mean a stack or a bet changing width on an unrelated
 * keystroke, which is exactly the kind of movement you are trying to look at.
 */

const NAMES = [
  "Mariana", "Tiago", "Inês", "Rui", "Sofia",
  "Nuno", "Beatriz", "Miguel", "Carolina", "Duarte",
];

// The widest realistic thing a nameplate has to survive.
const LONG_NAMES = [
  "Bartholomeu Vasconcelos", "MariaDoCarmoFigueiredo", "Jean-Baptiste Grenouille",
  "Konstantinos Papadopoulos", "אברהם־יצחק", "Ryūnosuke Akutagawa",
  "Wolfgang von Hohenzollern", "Anastasiya Aleksandrovna", "李小龍・ブルース", "M",
];

const AVATARS = ["🦊", "🐻", "🦅", "🐺", "🐯", "🦉", "🐙", "🦈", "🐍", "🦁"];

// One fixed board, cut to the street. Nothing re-deals as you change knobs.
const BOARD = ["Ah", "Kd", "7c", "2s", "Ts"];

const OPPONENT_HANDS = [
  ["Qh", "Qs"], ["Jc", "Jd"], ["Ac", "Qd"], ["Kh", "Ks"], ["9h", "9d"],
  ["Td", "Th"], ["8s", "7s"], ["Ad", "Js"], ["5c", "5s"], ["Kc", "Qc"],
];

const HAND_NAMES = [
  "Pair of Queens", "Two Pair, Aces and Jacks", "Ace High", "Three of a Kind, Kings",
  "Pair of Nines", "Three of a Kind, Tens", "Straight, Nine High", "Pair of Aces",
  "Pair of Fives", "Flush, King High",
];

export const CHAT_LINES = [
  "nh", "wow", "that's a snap call", "who raises there", "brutal",
  "I had the ace", "one time!", "sigh", "standard", "level up already",
  "gg", "how is that a call", "running like a god", "rigged", "insta-muck",
];

const LONG_CHAT =
  "I genuinely think folding there is a mistake because the pot odds were fine " +
  "and he only ever has two pair or better roughly a quarter of the time, which " +
  "is nowhere near enough to fold";

const EMOJI_CHAT = "😂😂😂🔥🔥💀💀💀🃏🃏♠️♥️♦️♣️🤡🤡🤡";

export const SEAT_STATES = [
  ["active", "In hand"],
  ["folded", "Folded"],
  ["allin", "All in"],
  ["sittingout", "Sitting out"],
  ["disconnected", "Disconnected"],
  ["eliminated", "Eliminated"],
];

const STREET_CARD_COUNT = { preflop: 0, flop: 3, turn: 4, river: 5 };

// Deterministic spread so stacks and bets differ per seat without random.
const vary = (seat, span) => ((seat * 37 + 11) % span);

const STACK_BASE = { short: 6_500, normal: 42_000, deep: 1_450_000 };

export function communityCards(street) {
  return BOARD.slice(0, STREET_CARD_COUNT[street] ?? 0);
}

export function parseCardList(text) {
  return String(text || "")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2);
}

/** The seats, in the shape the game store expects from `game_state`. */
export function buildPlayers(config, heroName) {
  const pool = config.nameStyle === "long" ? LONG_NAMES : NAMES;
  const base = STACK_BASE[config.stackSize] ?? STACK_BASE.normal;
  const count = Math.min(config.playerCount, config.capacity);

  return Array.from({ length: count }, (_, index) => {
    const seat = index;
    const state = config.seatStates[seat] || "active";
    const isHero = seat === config.heroSeat;
    const inHand = state === "active" || state === "allin";

    // A bet only makes sense for someone still contesting the pot.
    const bet = config.showBets && inHand && state !== "allin"
      ? Math.round(config.bigBlind * (1 + vary(seat, 6)))
      : state === "allin" && config.showBets
      ? base
      : 0;

    const name = isHero ? heroName : pool[index % pool.length];

    return {
      seat,
      user_id: 900 + seat,
      name,
      // The real table sends both: a display name to read and a login name to
      // file things under. The sandbox has no accounts, so they are the same
      // string — but the lookups it exercises are keyed on this one.
      username: name,
      avatar: AVATARS[index % AVATARS.length],
      chips: state === "allin" ? 0 : Math.round(base + vary(seat, 17) * base * 0.06),
      bet,
      cards: null,          // face down; the showdown event fills these in
      is_folded: state === "folded",
      is_all_in: state === "allin",
      is_sitting_out: state === "sittingout",
      is_disconnected: state === "disconnected",
      is_eliminated: state === "eliminated",
    };
  });
}

export function buildLevel(config) {
  return {
    blind_level_number: config.levelNumber,
    small_blind: config.smallBlind,
    big_blind: config.bigBlind,
    ante: config.ante,
    duration_minutes: 20,
    remaining_seconds: config.levelRemaining,
    level_index: config.levelNumber - 1,
    is_break: config.onBreak,
    hands_in_level: 12,
    duration_hands: null,
  };
}

/** Stands in for the tournament detail the game page fetches over REST. */
export function buildTournament(config, players, heroName) {
  const levels = Array.from({ length: 12 }, (_, index) => ({
    small_blind: 100 * 2 ** Math.floor(index / 2),
    big_blind: 200 * 2 ** Math.floor(index / 2),
    ante: 25 * 2 ** Math.floor(index / 2),
    duration_minutes: 20,
    is_break: index === 5,
  }));

  return {
    id: "sandbox",
    name: "Layout Sandbox",
    host_name: config.hostControls ? heroName : "somebody-else",
    status: config.finished ? "finished" : config.paused ? "paused" : "running",
    players_per_table: config.capacity,
    starting_stack: 30_000,
    levels,
    // `place`, as the real payout rows use — the info panel and the settlement
    // ledger both key off it.
    buy_in_cents: config.buyInCents,
    payout_structure: [
      { place: 1, label: "1st", percentage: 50 },
      { place: 2, label: "2nd", percentage: 30 },
      { place: 3, label: "3rd", percentage: 20 },
    ],
    players: players.map((p) => ({
      username: p.name,
      chips: p.chips,
      is_eliminated: p.is_eliminated || (p.name === heroName && config.heroOut),
      finish_position: p.name === heroName && config.heroOut ? config.playerCount : null,
      rebuy_count: p.seat % 3 === 0 ? 1 : 0,
    })),
  };
}

/** Stands in for the player-stats endpoint. */
export function buildStats(players) {
  return Object.fromEntries(players.map((p, index) => [
    p.username,
    {
      username: p.name,
      hands: 40 + index * 137,
      vpip_pct: 18 + vary(p.seat, 22),
      pfr_pct: 12 + vary(p.seat, 14),
      three_bet_pct: 4 + vary(p.seat, 9),
      three_bet_chances: 10 + vary(p.seat, 40),
      ats_pct: 22 + vary(p.seat, 30),
      ats_chances: 8 + vary(p.seat, 35),
      fold_to_three_bet_pct: 40 + vary(p.seat, 40),
      call_three_bet_pct: 20 + vary(p.seat, 25),
      four_bet_pct: 5 + vary(p.seat, 12),
      vs_three_bet_chances: 6 + vary(p.seat, 24),
      fold_to_four_bet_pct: 45 + vary(p.seat, 45),
      call_four_bet_pct: 15 + vary(p.seat, 25),
      vs_four_bet_chances: 2 + vary(p.seat, 9),
      saw_flop_pct: 24 + vary(p.seat, 26),
      cbet_pct: 50 + vary(p.seat, 35),
      cbet_chances: 12 + vary(p.seat, 45),
      fold_to_cbet_pct: 35 + vary(p.seat, 35),
      fold_to_cbet_chances: 10 + vary(p.seat, 40),
      aggression_pct: 30 + vary(p.seat, 40),
      postflop_actions: 20 + vary(p.seat, 90),
    },
  ]));
}

/** Everyone still holding cards, with a hand to show.
 *
 * Capped at four: more than that is not a showdown anyone has seen, and the
 * point is to look at how several revealed hands sit on the felt at once.
 */
export function showdownEntries(players, street) {
  const board = communityCards(street);
  return players
    .filter((p) => !p.is_folded && !p.is_eliminated && !p.is_sitting_out)
    .slice(0, 4)
    .map((p) => {
      const cards = OPPONENT_HANDS[p.seat % OPPONENT_HANDS.length];
      return {
        seat: p.seat,
        cards,
        hand_name: HAND_NAMES[p.seat % HAND_NAMES.length],
        // The gold ring wants five cards; board plus hole is close enough for
        // layout, and always renders the right number of rings.
        best_cards: [...cards, ...board].slice(0, 5),
      };
    });
}

export function equityEntries(players, street) {
  const entries = showdownEntries(players, street);
  const share = Math.floor(1000 / Math.max(1, entries.length)) / 10;
  return entries.map((entry, index) => ({
    seat: entry.seat,
    cards: entry.cards,
    equity: index === 0 ? Number((100 - share * (entries.length - 1)).toFixed(1)) : share,
  }));
}

export function chatLine(config, index) {
  if (config.chatStyle === "long") return LONG_CHAT;
  if (config.chatStyle === "emoji") return EMOJI_CHAT;
  return CHAT_LINES[index % CHAT_LINES.length];
}

/** Stands in for the recent-hands endpoint behind the Hand history button. */
export function buildHands(config, players, count) {
  const contenders = players.filter((p) => !p.is_eliminated);
  const streets = ["preflop", "flop", "turn", "river"];
  const verbs = ["call", "raise", "check", "bet", "fold"];

  return Array.from({ length: count }, (_, handIndex) => {
    const handNumber = count - handIndex;
    const actions = streets.flatMap((street, streetIndex) =>
      contenders.slice(0, 4).map((p, playerIndex) => ({
        street,
        seat: p.seat,
        username: p.name,
        action: verbs[(streetIndex + playerIndex + handIndex) % verbs.length],
        amount: ((streetIndex + 1) * config.bigBlind * (playerIndex + 1)) || null,
      })),
    );

    const winner = contenders[handIndex % Math.max(1, contenders.length)];
    return {
      id: `sandbox-${handNumber}`,
      hand_number: handNumber,
      pot_total: config.pot + handIndex * config.bigBlind * 3,
      community_cards: BOARD,
      actions,
      result: {
        awards: winner
          ? [{ seat: winner.seat, amount: config.pot + handIndex * config.bigBlind * 3, description: "main pot" }]
          : [],
        showdown: showdownEntries(contenders, "river").slice(0, 2),
      },
    };
  });
}

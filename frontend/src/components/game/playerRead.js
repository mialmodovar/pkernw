/**
 * What a read is made of: the stats, in the order somebody builds one.
 *
 * Shared by the card at the table and the profile card in the lobby, so the two
 * cannot end up disagreeing about what ATS means or where the line for a thin
 * sample is. The rendering differs between them; these definitions do not.
 */

// Grouped the way a read is built: how they enter a pot, what they do when
// somebody comes over the top, and how they play once there is a board.
export const GROUPS = [
  {
    title: "Preflop",
    rows: [
      { key: "vpip_pct", label: "VPIP", hint: "Hands entered voluntarily before the flop" },
      { key: "pfr_pct", label: "PFR", hint: "Hands raised before the flop" },
      { key: "three_bet_pct", label: "3-bet", hint: "Raised over a raise, of the times they faced one", chances: "three_bet_chances" },
      { key: "ats_pct", label: "ATS", hint: "Raised first in from the cutoff, button or small blind", chances: "ats_chances" },
    ],
  },
  {
    title: "Facing a raise",
    rows: [
      { key: "fold_to_three_bet_pct", label: "Fold to 3-bet", hint: "Folded when the pot was 3-bet into them", chances: "vs_three_bet_chances" },
      { key: "call_three_bet_pct", label: "Call 3-bet", hint: "Called a 3-bet", chances: "vs_three_bet_chances" },
      { key: "four_bet_pct", label: "4-bet", hint: "Raised over a 3-bet", chances: "vs_three_bet_chances" },
      { key: "fold_to_four_bet_pct", label: "Fold to 4-bet", hint: "Folded when the pot was 4-bet into them", chances: "vs_four_bet_chances" },
      { key: "call_four_bet_pct", label: "Call 4-bet", hint: "Called a 4-bet", chances: "vs_four_bet_chances" },
    ],
  },
  {
    title: "Postflop",
    rows: [
      { key: "saw_flop_pct", label: "Saw flop", hint: "Hands where they were still in and acting on the flop" },
      { key: "cbet_pct", label: "C-bet", hint: "Bet the flop as the last preflop raiser", chances: "cbet_chances" },
      { key: "fold_to_cbet_pct", label: "Fold to c-bet", hint: "Folded to the preflop raiser's flop bet", chances: "fold_to_cbet_chances" },
      {
        key: "aggression_pct", label: "Aggression", chances: "postflop_actions",
        hint: "Share of their postflop bets, raises and calls that were bets or raises",
      },
    ],
  },
];

// Under this, the percentages say more about luck than about the player.
export const THIN_SAMPLE = 30;

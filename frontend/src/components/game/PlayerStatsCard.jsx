import playerProfile, { PROFILE_MIN_HANDS } from "./playerProfile";

// Grouped the way a read is built: how they enter a pot, what they do when
// somebody comes over the top, and how they play once there is a board.
const GROUPS = [
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
      { key: "saw_flop_pct", label: "Saw flop", hint: "Hands where they were still in on the flop" },
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
const THIN_SAMPLE = 30;

function Bar({ pct }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden bg-black/50 border border-(--color-border)">
      <div
        className="h-full bg-[linear-gradient(90deg,#4a0f18,#d4af37)]"
        style={{ width: `${Math.min(100, pct || 0)}%` }}
      />
    </div>
  );
}

function StatRow({ row, stats, hands }) {
  const chances = row.chances ? stats[row.chances] : hands;

  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-(--color-silver) cursor-help" title={row.hint}>{row.label}</span>
        <span className="text-[#d9c07a] font-semibold">
          {chances ? `${stats[row.key]}%` : "—"}
          <span className="text-(--color-text-muted) font-normal"> ({chances ?? 0})</span>
        </span>
      </div>
      <div className="mt-0.5"><Bar pct={chances ? stats[row.key] : 0} /></div>
    </div>
  );
}

/**
 * The read on a player, from recorded hand history. Every number carries the
 * sample it came from — a 100% 3-bet over two chances is noise, and hiding that
 * would be worse than showing nothing.
 */
export default function PlayerStatsCard({ player, stats, onClose }) {
  const hands = stats?.hands ?? 0;
  const profile = playerProfile(stats);

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center px-4" onClick={onClose}>
      <div className="panel rounded-xl w-full max-w-xs p-4 shadow-2xl shadow-black/70 max-h-[85vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none">{player.avatar || "\u{1F0CF}"}</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-(--color-silver) truncate">{player.name}</p>
            <p className="text-xs text-(--color-text-muted)">
              {hands ? `${hands.toLocaleString()} hands recorded` : "No hands recorded yet"}
            </p>
          </div>
          <button onClick={onClose}
            className="btn-secondary px-2 py-1 rounded text-xs font-semibold transition-colors">
            Close
          </button>
        </div>

        {hands === 0 ? (
          <p className="text-xs text-(--color-text-muted) mt-4">
            Nothing to read yet — stats build up as they play hands.
          </p>
        ) : (
          <>
            {/* One word for the whole read, with the reasoning a hover away. */}
            {profile ? (
              <p className="mt-3">
                <span title={profile.description}
                  className="inline-block cursor-help rounded-full border border-(--color-border-strong) bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-[#d9c07a]">
                  {profile.label}
                </span>
              </p>
            ) : (
              <p className="mt-3 text-[11px] text-(--color-text-muted)">
                Profile after {PROFILE_MIN_HANDS} hands.
              </p>
            )}

            <div className="mt-3 space-y-4">
              {GROUPS.map((group) => (
                <div key={group.title} className="space-y-3">
                  <p className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">{group.title}</p>
                  {group.rows.map((row) => (
                    <StatRow key={row.key} row={row} stats={stats} hands={hands} />
                  ))}
                </div>
              ))}
            </div>

            {hands < THIN_SAMPLE && (
              <p className="text-[11px] text-(--color-text-muted) mt-3">
                Small sample — treat these as a hint, not a read.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

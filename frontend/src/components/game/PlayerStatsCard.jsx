const ROWS = [
  { key: "vpip_pct", label: "VPIP", hint: "Hands entered voluntarily before the flop" },
  { key: "pfr_pct", label: "PFR", hint: "Hands raised before the flop" },
  { key: "three_bet_pct", label: "3-bet", hint: "Raised over a raise, of the times they faced one", chances: "three_bet_chances" },
  { key: "ats_pct", label: "ATS", hint: "Raised first in from the cutoff, button or small blind", chances: "ats_chances" },
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

/**
 * The read on a player, from recorded hand history. Every number carries the
 * sample it came from — a 100% 3-bet over two chances is noise, and hiding that
 * would be worse than showing nothing.
 */
export default function PlayerStatsCard({ player, stats, onClose }) {
  const hands = stats?.hands ?? 0;

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center px-4" onClick={onClose}>
      <div className="panel rounded-xl w-full max-w-xs p-4 shadow-2xl shadow-black/70"
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
            <div className="mt-4 space-y-3">
              {ROWS.map((row) => {
                const chances = row.chances ? stats[row.chances] : hands;
                return (
                  <div key={row.key}>
                    <div className="flex justify-between text-xs">
                      <span className="text-(--color-silver)" title={row.hint}>{row.label}</span>
                      <span className="text-[#d9c07a] font-semibold">
                        {chances ? `${stats[row.key]}%` : "—"}
                        <span className="text-(--color-text-muted) font-normal">
                          {" "}({chances ?? 0})
                        </span>
                      </span>
                    </div>
                    <div className="mt-0.5"><Bar pct={chances ? stats[row.key] : 0} /></div>
                  </div>
                );
              })}
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

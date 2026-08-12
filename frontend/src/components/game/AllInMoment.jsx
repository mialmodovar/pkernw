import useGameStore from "../../store/gameStore";

/**
 * The engine deliberately holds for three seconds after an all-in before
 * dealing the next street. Nothing used that pause except a small percentage
 * pill on each seat, so the most dramatic moment in poker passed unmarked.
 * This fills it: who is in, and how the hand stands.
 */
export default function AllInMoment() {
  const allInEquity = useGameStore((s) => s.allInEquity);
  const players = useGameStore((s) => s.players);

  if (!allInEquity || !allInEquity.length) return null;

  const nameFor = (seat) => players.find((p) => p.seat === seat)?.name ?? `Seat ${seat}`;
  const leader = Math.max(...allInEquity.map((e) => e.equity ?? 0));

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20
                    w-[min(22rem,80%)] panel-raised rounded-xl px-4 py-3
                    shadow-2xl shadow-black/70 animate-fade-in">
      <p className="text-center text-xs font-extrabold uppercase tracking-[0.35em] text-[#d9c07a] animate-pulse">
        All in
      </p>
      <div className="mt-3 space-y-2">
        {allInEquity.map((entry) => {
          const pct = entry.equity ?? 0;
          const ahead = pct >= leader;
          return (
            <div key={entry.seat}>
              <div className="flex justify-between text-xs">
                <span className={ahead ? "text-[#d9c07a] font-semibold" : "text-(--color-silver)"}>
                  {nameFor(entry.seat)}
                </span>
                <span className={ahead ? "text-[#d9c07a] font-semibold" : "text-(--color-text-muted)"}>
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 mt-0.5 rounded-full overflow-hidden bg-black/50 border border-(--color-border)">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    background: ahead
                      ? "linear-gradient(90deg,#8a6c18,#d4af37)"
                      : "linear-gradient(90deg,#4a0f18,#8a1c2b)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

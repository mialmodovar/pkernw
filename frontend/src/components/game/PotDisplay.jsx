import useGameStore from "../../store/gameStore";
import { formatChips } from "./formatChips";
import ChipStack from "./ChipStack";

export default function PotDisplay() {
  const pot = useGameStore((s) => s.pot);
  const showBB = useGameStore((s) => s.showBB);
  const bb = useGameStore((s) => s.level?.big_blind) || 0;
  // Always rendered — hiding it at zero left the whole of preflop with no pot.
  return (
    <div className="flex items-end gap-2">
      <ChipStack amount={pot} size={14} />
      <div className="bg-black/60 border border-[rgba(196,178,165,0.25)] px-3 py-1 rounded-full text-sm font-semibold text-(--color-highlight-text) shadow-lg shadow-black/50">
        Pot: {formatChips(pot || 0, showBB, bb)}
      </div>
    </div>
  );
}

import useGameStore from "../../store/gameStore";

export default function PotDisplay() {
  const pot = useGameStore((s) => s.pot);
  const showBB = useGameStore((s) => s.showBB);
  const bb = useGameStore((s) => s.level?.big_blind) || 0;
  if (!pot) return null;
  const display = showBB && bb > 0 ? `${(pot / bb).toFixed(1)} BB` : pot.toLocaleString();
  return (
    <div className="bg-black/50 px-3 py-1 rounded-full text-sm font-semibold text-yellow-300">
      Pot: {display}
    </div>
  );
}

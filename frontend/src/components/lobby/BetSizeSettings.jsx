import { useState } from "react";

import {
  DEFAULT_POSTFLOP_PCT, DEFAULT_PREFLOP_BB, MAX_SIZES, cleanSizes,
} from "../game/betPresets";
import useGameStore from "../../store/gameStore";

/**
 * The three raise buttons above the slider, as this player wants them.
 *
 * Two lists, because they are two different questions. Before the flop, with
 * nobody having opened, a raise is said in big blinds — "three bb" is how the
 * whole table talks about it. Once somebody has raised, and on every street
 * after, it is a share of the pot. What a standard open is has nothing to do
 * with anybody else's game, so it lives on the account and follows you to
 * another machine.
 */
function SizeRow({ label, hint, unit, sizes, onSave }) {
  const [draft, setDraft] = useState(sizes.join(", "));

  const commit = () => {
    const parsed = draft.split(/[,\s]+/).map((one) => Number(one));
    onSave(cleanSizes(parsed));
    // Whatever the list came to, said back: three is the most that fit and
    // nonsense is dropped, so what was typed is not always what is kept.
    setDraft(cleanSizes(parsed).join(", "));
  };

  return (
    <label className="mt-2 block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-(--color-silver)">{label}</span>
        <span className="text-[10px] text-(--color-text-muted)">{unit}</span>
      </span>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        inputMode="decimal"
        className="input-field mt-1 w-full rounded px-2 py-1 text-xs font-mono"
      />
      <span className="mt-0.5 block text-[11px] text-(--color-text-muted)">{hint}</span>
    </label>
  );
}

export default function BetSizeSettings() {
  const betSizes = useGameStore((s) => s.betSizes);
  const setBetSizes = useGameStore((s) => s.setBetSizes);

  return (
    <div className="mt-3 pt-3 border-t border-(--color-border)">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-(--color-text-muted)">
        Raise buttons
      </p>

      <SizeRow
        label="Before the flop"
        unit="big blinds"
        hint={`Up to ${MAX_SIZES}, for a pot nobody has opened. Default ${DEFAULT_PREFLOP_BB.join(", ")}.`}
        sizes={betSizes.preflop}
        onSave={(preflop) => setBetSizes({ preflop })}
      />

      <SizeRow
        label="After a raise, and after the flop"
        unit="% of the pot"
        hint={`A share of the pot once there is one to share. Default ${DEFAULT_POSTFLOP_PCT.join(", ")}.`}
        sizes={betSizes.postflop}
        onSave={(postflop) => setBetSizes({ postflop })}
      />
    </div>
  );
}

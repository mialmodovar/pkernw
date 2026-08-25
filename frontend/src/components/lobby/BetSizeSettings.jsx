import { useEffect, useState } from "react";

import {
  DEFAULT_POSTFLOP_PCT, DEFAULT_PREFLOP_BB, MAX_SIZES, SIZE_LIMITS, cleanSizes, nudge,
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
 *
 * Set as the buttons themselves rather than as a list to type. It was one text
 * field per row holding "2, 2.5, 3.5" — a format nobody was told, punctuation
 * to get right on a phone keyboard, and a field that silently rewrote what you
 * typed when it dropped whatever it could not read. What is on screen now is
 * the row as the table will draw it, all-in included, with the arrows to move
 * each one. Nothing has to be parsed and nothing is a surprise.
 */
function Stepper({ sign, label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-7 h-7 shrink-0 flex items-center justify-center rounded
                 text-(--color-text-muted) hover:text-(--color-silver) hover:bg-white/5
                 transition-colors disabled:opacity-25 disabled:hover:bg-transparent"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="w-3.5 h-3.5"
        fill="none" stroke="currentColor" strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14" />
        {sign > 0 && <path d="M12 5v14" />}
      </svg>
    </button>
  );
}

/** One button, as it will look, with the arrows that change what it says. */
function SizeButton({ value, unit, limits, name, onChange, onRemove }) {
  // Typed rather than stepped: held as text while it is being typed, because a
  // half-typed "2." is not a number and must not be turned into one under the
  // cursor.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = () => {
    const typed = Number(draft.replace(",", "."));
    if (!Number.isFinite(typed) || typed <= 0) {
      setDraft(String(value));
      return;
    }
    const held = Math.min(limits.max, Math.max(limits.min, Math.round(typed * 10) / 10));
    setDraft(String(held));
    if (held !== value) onChange(held);
  };

  return (
    <div className="relative rounded-lg border border-(--color-border) bg-black/25 p-1
                    flex flex-col items-center gap-0.5">
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title={`Remove the ${value}${unit} button`}
          aria-label={`Remove the ${value}${unit} button`}
          className="tap-target absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center
                     rounded-full border border-(--color-border) bg-(--color-surface-raised)
                     text-[10px] leading-none text-(--color-text-muted)
                     hover:text-(--color-silver) transition-colors"
        >
          ×
        </button>
      )}
      {/* The label the table will print on the button, and the thing you edit:
          the same string, in the same place, so there is nothing to imagine. */}
      <span className="flex items-baseline justify-center w-full">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          inputMode="decimal"
          aria-label={name}
          className="w-full min-w-0 bg-transparent border-0 p-0 text-center outline-none
                     text-sm font-semibold text-(--color-silver) tabular-nums"
        />
        <span className="text-[10px] font-semibold text-(--color-text-muted) shrink-0">
          {unit}
        </span>
      </span>
      <span className="flex items-center justify-center">
        <Stepper sign={-1} label={`Smaller than ${value}${unit}`}
          disabled={value <= limits.min}
          onClick={() => onChange(nudge(value, -1, limits))} />
        <Stepper sign={1} label={`Bigger than ${value}${unit}`}
          disabled={value >= limits.max}
          onClick={() => onChange(nudge(value, 1, limits))} />
      </span>
    </div>
  );
}

function SizeRow({ label, unit, hint, kind, sizes, defaults, onSave }) {
  const limits = SIZE_LIMITS[kind];
  const isDefault = sizes.length === defaults.length
    && sizes.every((one, index) => one === defaults[index]);

  const replace = (index, value) =>
    onSave(cleanSizes(sizes.map((one, i) => (i === index ? value : one)), defaults));
  const remove = (index) =>
    onSave(cleanSizes(sizes.filter((_, i) => i !== index), defaults));
  // A new one starts a step above the last, which is where the next button up
  // belongs and saves the first press of the arrow.
  const add = () => onSave(cleanSizes(
    [...sizes, nudge(sizes[sizes.length - 1] ?? limits.min, 1, limits)], defaults,
  ));

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-(--color-silver)">{label}</span>
        {!isDefault && (
          <button
            type="button"
            onClick={() => onSave([...defaults])}
            className="text-[0.65rem] text-(--color-text-muted) hover:text-(--color-silver)
                       transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Four across, because the row at the table is four across: three of
          yours and all-in, which is always there and is not yours to move. */}
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {sizes.map((one, index) => (
          <SizeButton
            key={index}
            value={one}
            unit={unit}
            limits={limits}
            name={`${label}, button ${index + 1}`}
            onChange={(next) => replace(index, next)}
            onRemove={sizes.length > 1 ? () => remove(index) : null}
          />
        ))}

        {sizes.length < MAX_SIZES && (
          <button
            type="button"
            onClick={add}
            title="Add another raise button"
            className="rounded-lg border border-dashed border-(--color-border)
                       text-lg leading-none text-(--color-text-muted)
                       hover:text-(--color-silver) hover:border-(--color-border-strong)
                       transition-colors"
          >
            +
          </button>
        )}

        {/* Not editable, and shown anyway: the row has four slots and this is
            the fourth, so a player counting the buttons they will get counts
            the right number. */}
        <span
          title="Always there, and not yours to set"
          className="rounded-lg border border-(--color-highlight-text)/40 bg-[#5a1420]/40
                     flex items-center justify-center text-center
                     text-[11px] font-semibold leading-tight text-(--color-text-muted)"
        >
          All in
        </span>
      </div>

      <p className="mt-1 text-[11px] text-(--color-text-muted)">{hint}</p>
    </div>
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
        unit="bb"
        hint="For a pot nobody has opened, said in big blinds — the way a table talks about an open."
        kind="preflop"
        sizes={betSizes.preflop}
        defaults={DEFAULT_PREFLOP_BB}
        onSave={(preflop) => setBetSizes({ preflop })}
      />

      <SizeRow
        label="After a raise, and after the flop"
        unit="%"
        hint="A share of the pot once there is one to share."
        kind="postflop"
        sizes={betSizes.postflop}
        defaults={DEFAULT_POSTFLOP_PCT}
        onSave={(postflop) => setBetSizes({ postflop })}
      />
    </div>
  );
}

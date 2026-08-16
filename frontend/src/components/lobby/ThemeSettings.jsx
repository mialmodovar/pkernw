import { useEffect, useState } from "react";
import useGameStore from "../../store/gameStore";
import useThemeStore from "../../store/themeStore";
import GifPicker from "../game/GifPicker";
import { gifPreviewUrl } from "../../api/giphy";
import {
  ACCENT_SWATCHES,
  PATTERNS,
  PATTERN_NAMES,
  PRESETS,
  PRESET_NAMES,
  cardBackImage,
  effectiveAccent,
  resolveTokens,
} from "../../theme/themes";

/** A miniature of what the preset does to the table: the actual felt gradient
 *  with the actual card back lying on it. Cheaper to read than three colour
 *  chips, and it is the real values rather than an approximation of them. */
function PresetPreview({ preset, pattern }) {
  // Resolved rather than declared, so the dot shows the accent after the
  // readability correction — the colour that will actually be on screen.
  const tokens = resolveTokens({ preset, pattern });
  return (
    <span
      className="w-10 h-7 rounded relative overflow-hidden shrink-0 border border-black/40"
      style={{ background: tokens["--felt-bg"] }}
    >
      <span
        className="absolute right-[4px] bottom-[4px] w-[9px] h-[13px] rounded-[2px] border"
        style={{
          backgroundImage: cardBackImage(preset, pattern),
          borderColor: tokens["--card-back-edge"],
        }}
      />
      <span
        className="absolute left-[4px] top-[4px] w-[7px] h-[7px] rounded-full"
        style={{ background: tokens["--color-accent"] }}
      />
    </span>
  );
}

function SectionLabel({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)">
        {children}
      </p>
      {action}
    </div>
  );
}

export default function ThemeSettings({ onClose }) {
  const { preset, accent, pattern, finisherGifId, update } = useThemeStore();
  // The one setting here that stays in this browser rather than on the account.
  const hideHand = useGameStore((s) => s.hideHand);
  const toggleHideHand = useGameStore((s) => s.toggleHideHand);
  const [listOpen, setListOpen] = useState(false);
  const [finisherOpen, setFinisherOpen] = useState(false);
  const currentAccent = effectiveAccent({ preset, accent });

  // A settings panel that cannot be dismissed from the keyboard is a trap.
  // Escape backs out one level at a time, so it closes the open dropdown rather
  // than the whole panel underneath it.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (listOpen) setListOpen(false);
      else if (finisherOpen) setFinisherOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listOpen, finisherOpen, onClose]);

  const choosePreset = (name) => {
    update({ preset: name });
    setListOpen(false);
  };

  return (
    <div className="absolute left-0 right-0 top-full z-10 mt-2 p-3 panel-raised panel-solid rounded-lg shadow-xl shadow-black/50 animate-fade-in">
      <SectionLabel
        action={
          <button
            onClick={onClose}
            title="Close"
            className="text-(--color-text-muted) hover:text-(--color-silver) text-sm leading-none px-1 transition-colors"
          >
            ✕
          </button>
        }
      >
        Appearance
      </SectionLabel>

      <div className="relative">
        <button
          onClick={() => setListOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={listOpen}
          className="w-full flex items-center gap-2 p-1.5 rounded panel-raised panel-solid text-left"
        >
          <PresetPreview preset={preset} pattern={pattern} />
          <span className="text-sm text-(--color-silver) flex-1 truncate">
            {PRESETS[preset].label}
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true"
            className={`w-3.5 h-3.5 mr-1 shrink-0 text-(--color-text-muted) transition-transform ${
              listOpen ? "rotate-180" : ""
            }`}
            fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {listOpen && (
          <>
            {/* Catches the click that dismisses the list. Cheaper and more
                reliable than a document listener that has to not fire on the
                same click that opened it. */}
            <div className="fixed inset-0 z-10" onClick={() => setListOpen(false)} />
            <div
              role="listbox"
              className="absolute left-0 right-0 top-full z-20 mt-1 p-1 space-y-1 rounded panel-raised panel-solid shadow-xl shadow-black/50 animate-fade-in"
            >
              {PRESET_NAMES.map((name) => {
                const active = name === preset;
                return (
                  <button
                    key={name}
                    role="option"
                    aria-selected={active}
                    onClick={() => choosePreset(name)}
                    className={`w-full flex items-center gap-2 p-1.5 rounded text-left transition-colors ${
                      active ? "bg-(--color-accent-soft)" : "hover:bg-white/5"
                    }`}
                  >
                    <PresetPreview preset={name} pattern={pattern} />
                    <span className="text-sm text-(--color-silver) flex-1 truncate">
                      {PRESETS[name].label}
                    </span>
                    {active && <span className="text-xs text-(--color-silver) pr-1">✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-(--color-border)">
        <SectionLabel
          action={
            accent && (
              <button
                onClick={() => update({ accent: null })}
                className="text-[0.65rem] text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
              >
                Match theme
              </button>
            )
          }
        >
          Accent
        </SectionLabel>

        <div className="grid grid-cols-8 gap-1">
          {ACCENT_SWATCHES.map((hex) => (
            <button
              key={hex}
              onClick={() => update({ accent: hex })}
              title={hex}
              aria-label={`Accent ${hex}`}
              aria-pressed={currentAccent === hex}
              style={{ background: hex }}
              className={`aspect-square rounded transition-transform hover:scale-110 ${
                currentAccent === hex
                  ? "ring-2 ring-(--color-silver) ring-offset-1 ring-offset-black/60"
                  : "border border-black/40"
              }`}
            />
          ))}
        </div>

        <label className="mt-2 flex items-center gap-2 text-xs text-(--color-text-muted) cursor-pointer">
          <input
            type="color"
            value={currentAccent}
            // Repaints on every step of the drag; themeStore holds the save back
            // until you stop moving.
            onChange={(e) => update({ accent: e.target.value })}
            className="w-7 h-7 rounded bg-transparent border border-(--color-border) cursor-pointer p-0"
          />
          Custom colour
        </label>
      </div>

      <div className="mt-3 pt-3 border-t border-(--color-border)">
        <SectionLabel>At the table</SectionLabel>

        {/* Not part of the theme: this one is remembered by the browser rather
            than by the account, because it is a fact about the room you are
            sitting in and not about you. */}
        <label className="mt-2 flex items-center gap-2 text-xs text-(--color-silver) cursor-pointer">
          <input
            type="checkbox"
            checked={hideHand}
            onChange={toggleHideHand}
          />
          Hide my hand until I hover it
        </label>
        <p className="mt-1 text-[11px] text-(--color-text-muted)">
          Your two cards sit face down and lift when you point at them — for
          playing with somebody looking over your shoulder.
        </p>
      </div>

      <div className="mt-3 pt-3 border-t border-(--color-border)">
        <SectionLabel>Card back</SectionLabel>

        {/* Swatches are drawn in the current preset's deck colours, so what you
            see in the grid is what lands on the table. */}
        <div className="grid grid-cols-6 gap-1">
          {PATTERN_NAMES.map((name) => (
            <button
              key={name}
              onClick={() => update({ pattern: name })}
              title={PATTERNS[name].label}
              aria-label={`Card back ${PATTERNS[name].label}`}
              aria-pressed={pattern === name}
              style={{ backgroundImage: cardBackImage(preset, name) }}
              className={`aspect-square rounded transition-transform hover:scale-110 ${
                pattern === name
                  ? "ring-2 ring-(--color-silver) ring-offset-1 ring-offset-black/60"
                  : "border border-black/40"
              }`}
            />
          ))}
        </div>

        <p className="mt-2 text-[0.65rem] leading-snug text-(--color-text-muted)">
          The accent tints buttons and highlights; the pattern is the card back.
          Felt colour comes from the theme.
        </p>
      </div>

      {/* Your finisher. Not a colour, but it belongs with the rest of how you
          show up at a table, and this is where a player already comes to set
          that. */}
      <div className="mt-3 pt-3 border-t border-(--color-border)">
        <SectionLabel
          action={
            finisherGifId && (
              <button
                onClick={() => update({ finisherGifId: null })}
                className="text-[0.65rem] text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
              >
                Remove
              </button>
            )
          }
        >
          Finisher
        </SectionLabel>

        <div className="relative flex items-center gap-2">
          <button
            onClick={() => setFinisherOpen((open) => !open)}
            aria-expanded={finisherOpen}
            className="flex items-center gap-2 p-1.5 rounded panel-raised panel-solid text-left flex-1 min-w-0"
          >
            {finisherGifId ? (
              <img
                src={gifPreviewUrl(finisherGifId)}
                alt="Your finisher"
                className="w-10 h-7 object-cover rounded shrink-0 border border-black/40"
              />
            ) : (
              <span className="w-10 h-7 rounded shrink-0 border border-dashed border-(--color-border)
                               flex items-center justify-center text-[0.6rem] text-(--color-text-muted)">
                none
              </span>
            )}
            <span className="text-sm text-(--color-silver) flex-1 truncate">
              {finisherGifId ? "Change GIF" : "Choose a GIF"}
            </span>
          </button>

          {finisherOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setFinisherOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1">
                <GifPicker
                  title="Search for your finisher"
                  onPick={(id) => { update({ finisherGifId: id }); setFinisherOpen(false); }}
                  onClose={() => setFinisherOpen(false)}
                />
              </div>
            </>
          )}
        </div>

        <p className="mt-2 text-[0.65rem] leading-snug text-(--color-text-muted)">
          Plays in the middle of the table whenever you knock somebody out.
        </p>
      </div>
    </div>
  );
}

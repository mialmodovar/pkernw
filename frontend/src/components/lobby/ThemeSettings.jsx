import { useEffect } from "react";
import useThemeStore from "../../store/themeStore";
import { ACCENT_SWATCHES, PRESETS, PRESET_NAMES, effectiveAccent } from "../../theme/themes";

/** A miniature of what the preset does to the table: the actual felt gradient
 *  with the actual card back lying on it. Cheaper to read than three colour
 *  chips, and it is the real values rather than an approximation of them. */
function PresetPreview({ tokens }) {
  return (
    <span
      className="w-10 h-7 rounded relative overflow-hidden shrink-0 border border-black/40"
      style={{ background: tokens["--felt-bg"] }}
    >
      <span
        className="absolute right-[4px] bottom-[4px] w-[9px] h-[13px] rounded-[2px] border"
        style={{
          backgroundImage: tokens["--card-back-bg"],
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

export default function ThemeSettings({ onClose }) {
  const { preset, accent, update } = useThemeStore();
  const currentAccent = effectiveAccent({ preset, accent });

  // A settings panel that cannot be dismissed from the keyboard is a trap.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="absolute left-0 right-0 top-full z-10 mt-2 p-3 panel-raised bg-(--panel-floating-bg) rounded-lg shadow-xl shadow-black/50 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)">
          Appearance
        </p>
        <button
          onClick={onClose}
          title="Close"
          className="text-(--color-text-muted) hover:text-(--color-silver) text-sm leading-none px-1 transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="space-y-1">
        {PRESET_NAMES.map((name) => {
          const active = name === preset;
          return (
            <button
              key={name}
              onClick={() => update({ preset: name })}
              aria-pressed={active}
              className={`w-full flex items-center gap-2 p-1.5 rounded text-left transition-colors ${
                active
                  ? "bg-(--color-accent-soft) border border-(--color-border-strong)"
                  : "border border-transparent hover:bg-white/5"
              }`}
            >
              <PresetPreview tokens={PRESETS[name].tokens} />
              <span className="text-sm text-(--color-silver) flex-1">{PRESETS[name].label}</span>
              {active && <span className="text-xs text-(--color-silver) pr-1">✓</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-(--color-border)">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)">
            Accent
          </p>
          {accent && (
            <button
              onClick={() => update({ accent: null })}
              className="text-[0.65rem] text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
            >
              Match theme
            </button>
          )}
        </div>

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

        <p className="mt-2 text-[0.65rem] leading-snug text-(--color-text-muted)">
          The accent tints buttons and highlights. Felt and cards come from the theme.
        </p>
      </div>
    </div>
  );
}

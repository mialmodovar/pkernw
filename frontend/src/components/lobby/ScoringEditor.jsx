import { PRESET_NAMES, PRESETS, describeScheme } from "./leagueScoring";

function NumberField({ label, value, onChange, title }) {
  return (
    <label className="flex flex-col gap-0.5" title={title}>
      <span className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">{label}</span>
      <input
        type="number"
        min={0}
        max={999}
        value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        className="input-field rounded px-2 py-1 text-sm text-right transition-colors"
      />
    </label>
  );
}

/**
 * How a league scores a night.
 *
 * A preset and then plain numbers, which is how a home league actually thinks
 * about it — "same as last year but knockouts are worth more". Touching any
 * number moves the preset to Custom, so the label never claims to be something
 * it is not. Same interaction as the speed presets in BlindStructureEditor.
 */
export default function ScoringEditor({ scoring, onChange, disabled = false }) {
  const scheme = { ...PRESETS.placement_ko, ...(scoring || {}) };
  const placement = scheme.placement || [];

  // Every edit re-derives the preset name rather than trusting the old one.
  const edit = (patch) => {
    const next = { ...scheme, ...patch };
    const matched = PRESET_NAMES.find((name) => (
      JSON.stringify(PRESETS[name].placement) === JSON.stringify(next.placement)
      && PRESETS[name].rest === next.rest
      && PRESETS[name].per_knockout === next.per_knockout
      && PRESETS[name].attendance === next.attendance
    ));
    onChange({ ...next, preset: matched || "custom" });
  };

  const setPlace = (index, value) => {
    const next = [...placement];
    next[index] = value;
    edit({ placement: next });
  };

  return (
    <fieldset disabled={disabled} className="space-y-3 disabled:opacity-60">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="text-(--color-text-muted)">Scoring</span>
        <select
          className="input-field px-2 py-1 rounded flex-1 transition-colors"
          value={PRESETS[scheme.preset] ? scheme.preset : "custom"}
          onChange={(event) => {
            const preset = PRESETS[event.target.value];
            if (preset) onChange({ ...preset });
          }}
        >
          {PRESET_NAMES.map((name) => (
            <option key={name} value={name}>{PRESETS[name].label}</option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>

      <div className="grid grid-cols-3 gap-2">
        {placement.slice(0, 5).map((points, index) => (
          <NumberField
            key={index}
            label={`${index + 1}${["st", "nd", "rd", "th", "th"][index]}`}
            value={points}
            onChange={(value) => setPlace(index, value)}
          />
        ))}
        <NumberField
          label="Rest"
          title="Everybody who finished below the places above"
          value={scheme.rest}
          onChange={(value) => edit({ rest: value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Per KO"
          title="Points for each player they knocked out"
          value={scheme.per_knockout}
          onChange={(value) => edit({ per_knockout: value })}
        />
        <NumberField
          label="Turning up"
          title="Points for playing the night at all"
          value={scheme.attendance}
          onChange={(value) => edit({ attendance: value })}
        />
      </div>

      <p className="text-[11px] text-(--color-text-muted) leading-snug">{describeScheme(scheme)}</p>
    </fieldset>
  );
}

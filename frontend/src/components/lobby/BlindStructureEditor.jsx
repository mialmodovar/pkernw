import { useEffect, useRef, useState } from "react";
import { DEFAULT_HANDS, DEFAULT_TIMED } from "./blindStructureDefaults";
import {
  SPEEDS,
  SPEED_NAMES,
  buildBlindStructure,
  formatDuration,
  structureMinutes,
} from "./blindStructureBuilder";

const normalizeBlindRow = (row, mode) => {
  const base = {
    is_break: false,
    small_blind: Number(row.small_blind || 0),
    big_blind: Number(row.big_blind || 0),
    ante: Number(row.ante || 0),
  };

  if (mode === "time") {
    return {
      ...base,
      duration_hands: null,
      duration_minutes: Number(row.duration_minutes || 10),
    };
  }

  return {
    ...base,
    duration_hands: Number(row.duration_hands || 8),
    duration_minutes: null,
  };
};

const normalizeBreakRow = (row) => ({
  is_break: true,
  small_blind: 0,
  big_blind: 0,
  ante: 0,
  duration_hands: null,
  duration_minutes: Number(row.duration_minutes || 5),
});

/**
 * Say how long and how fast, and get a structure.
 *
 * The two things a host knows are the two inputs; the dozen pairs of numbers
 * that follow from them are arithmetic, and blindStructureBuilder.js does it.
 * Building by hand is still right there — this only fills the table in.
 */
function StructureBuilder({ startingChips, players, onBuild }) {
  const [minutes, setMinutes] = useState(120);
  const [speed, setSpeed] = useState("normal");

  const preview = buildBlindStructure({ minutes, speed, startingChips, players });

  return (
    <div className="panel-raised rounded p-2 mb-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-(--color-text-muted)">
          Play for
          <input
            type="number"
            min={15}
            max={720}
            step={15}
            className="input-field rounded px-2 py-1 w-20 text-right"
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
          />
          min
        </label>

        <div className="flex rounded overflow-hidden border border-(--color-border)">
          {SPEED_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setSpeed(name)}
              className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                speed === name
                  ? "bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deeper))] text-(--color-highlight-ink)"
                  : "text-(--color-text-muted) hover:text-(--color-silver)"
              }`}
            >
              {SPEEDS[name].label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onBuild(preview)}
          className="btn-accent px-3 py-1 rounded text-xs font-semibold transition-colors ml-auto"
        >
          Build it
        </button>
      </div>

      {/* What you are about to get, before you get it. */}
      <p className="text-[11px] text-(--color-text-muted)">
        {`${preview.length} levels of ${SPEEDS[speed].minutesPerLevel} min · `}
        {`${formatDuration(structureMinutes(preview))} · `}
        {`blinds ${preview[0].small_blind}/${preview[0].big_blind} up to `}
        {`${preview[preview.length - 1].small_blind}/${preview[preview.length - 1].big_blind}`}
      </p>
    </div>
  );
}

export default function BlindStructureEditor({ levels, onChange, startingChips, players }) {
  const [editing, setEditing] = useState(Boolean(levels?.length));
  const [mode, setMode] = useState(
    levels && levels[0]?.duration_minutes ? "time" : "hands"
  );

  // Both of those are decided on the first render, and on the edit page there
  // is nothing to decide from yet: the tournament is fetched, so this mounts
  // with no levels and then receives them. The editor stayed collapsed on its
  // defaults and a timed ladder came up in hands — which reads as the
  // structure having been reset, because what is on screen is not the
  // tournament's own. Re-read once, the first time a real ladder arrives.
  const seenLevels = useRef(Boolean(levels?.length));
  useEffect(() => {
    if (seenLevels.current || !levels?.length) return;
    seenLevels.current = true;
    setEditing(true);
    setMode(levels[0]?.duration_minutes ? "time" : "hands");
  }, [levels]);

  const defaults = mode === "time" ? DEFAULT_TIMED : DEFAULT_HANDS;
  const rows = levels || defaults;
  const durationKey = mode === "time" ? "duration_minutes" : "duration_hands";

  const switchMode = (newMode) => {
    setMode(newMode);
    const newDefaults = newMode === "time" ? DEFAULT_TIMED : DEFAULT_HANDS;
    const converted = (levels || defaults).map((r, i) => {
      if (r.is_break) {
        return normalizeBreakRow(r);
      }

      return normalizeBlindRow(
        {
          ...r,
          duration_hands: newMode === "hands" ? (r.duration_hands ?? newDefaults[i]?.duration_hands ?? 8) : null,
          duration_minutes: newMode === "time" ? (r.duration_minutes ?? newDefaults[i]?.duration_minutes ?? 10) : null,
        },
        newMode
      );
    });
    onChange(converted);
  };

  const updateRow = (idx, field, value) => {
    const updated = rows.map((r, i) => {
      if (i !== idx) return r;
      const nextValue = field === "is_break" ? value : Number(value);
      if (field === "is_break") {
        return nextValue ? normalizeBreakRow(r) : normalizeBlindRow(r, mode);
      }
      if (r.is_break) {
        return normalizeBreakRow({ ...r, [field]: nextValue });
      }
      return normalizeBlindRow({ ...r, [field]: nextValue }, mode);
    });
    onChange(updated);
  };

  const addBlindRow = () => {
    const lastBlind = [...rows].reverse().find((row) => !row.is_break) || defaults[defaults.length - 1];
    const newRow = normalizeBlindRow(
      {
        small_blind: lastBlind.big_blind,
        big_blind: lastBlind.big_blind * 2,
        ante: Math.round(lastBlind.big_blind * 0.25),
        [durationKey]: lastBlind[durationKey] || (mode === "time" ? 10 : 8),
      },
      mode
    );
    onChange([...rows, newRow]);
  };

  const addBreakRow = () => {
    onChange([...rows, normalizeBreakRow({ duration_minutes: 5 })]);
  };

  const removeRow = (idx) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm text-(--color-text-muted)">Blind Structure</label>
        <button type="button" onClick={() => { setEditing(!editing); if (!levels) onChange([...defaults]); }}
          className="text-xs link-accent hover:underline transition-colors">
          {editing ? "Collapse" : "Customize"}
        </button>
      </div>

      {editing && (
        <StructureBuilder
          startingChips={startingChips}
          players={players}
          onBuild={(built) => { setMode("time"); onChange(built); }}
        />
      )}

      {editing && (
        <div className="flex gap-2 mb-2">
          <button type="button"
            onClick={() => switchMode("hands")}
            className={`text-xs px-3 py-1 rounded ${mode === "hands" ? "btn-accent" : "btn-secondary"}`}>
            By Hands
          </button>
          <button type="button"
            onClick={() => switchMode("time")}
            className={`text-xs px-3 py-1 rounded ${mode === "time" ? "btn-accent" : "btn-secondary"}`}>
            By Time
          </button>
        </div>
      )}

      <div className="text-xs panel rounded overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-(--color-text-muted)">
              <th className="px-2 py-1 text-left">Lvl</th>
              {editing && <th className="px-2 py-1 text-left">Type</th>}
              <th className="px-2 py-1">SB</th>
              <th className="px-2 py-1">BB</th>
              <th className="px-2 py-1">Ante</th>
              <th className="px-2 py-1">Duration</th>
              {editing && <th className="px-2 py-1"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-(--color-border)">
                <td className="px-2 py-1 text-(--color-text-muted)">{i + 1}</td>
                {editing ? (
                  <>
                    <td className="px-2 py-1">
                      <select
                        className="input-field rounded px-2 py-1"
                        value={r.is_break ? "break" : "blind"}
                        onChange={(e) => updateRow(i, "is_break", e.target.value === "break")}
                      >
                        <option value="blind">Blind</option>
                        <option value="break">Break</option>
                      </select>
                    </td>
                    <td>
                      {r.is_break ? (
                        <span className="text-(--color-text-muted)">-</span>
                      ) : (
                        <input type="number" className="input-field w-16 px-1 text-center rounded" value={r.small_blind} onChange={(e) => updateRow(i, "small_blind", e.target.value)} />
                      )}
                    </td>
                    <td>
                      {r.is_break ? (
                        <span className="text-(--color-text-muted)">-</span>
                      ) : (
                        <input type="number" className="input-field w-16 px-1 text-center rounded" value={r.big_blind} onChange={(e) => updateRow(i, "big_blind", e.target.value)} />
                      )}
                    </td>
                    <td>
                      {r.is_break ? (
                        <span className="text-(--color-text-muted)">-</span>
                      ) : (
                        <input type="number" className="input-field w-16 px-1 text-center rounded" value={r.ante} onChange={(e) => updateRow(i, "ante", e.target.value)} />
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-2">
                        <input
                          type="number"
                          className="input-field w-14 px-1 text-center rounded"
                          value={r.is_break ? r.duration_minutes : (r[durationKey] ?? "")}
                          onChange={(e) => updateRow(i, r.is_break ? "duration_minutes" : durationKey, e.target.value)}
                        />
                        <span className="text-(--color-text-muted)">{r.is_break ? "min" : mode === "time" ? "min" : "hands"}</span>
                      </div>
                    </td>
                    <td><button type="button" onClick={() => removeRow(i)} className="text-[#c76b7a] hover:text-[#e3cdd1] px-1 transition-colors">x</button></td>
                  </>
                ) : (
                  <>
                    <td className="text-center">{r.is_break ? "Break" : r.small_blind}</td>
                    <td className="text-center">{r.is_break ? "-" : r.big_blind}</td>
                    <td className="text-center">{r.is_break ? "-" : r.ante}</td>
                    <td className="text-center">
                      {r.is_break ? `${r.duration_minutes} min` : `${r[durationKey]} ${mode === "time" ? "min" : "hands"}`}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {editing && (
          <div className="grid grid-cols-2 border-t border-(--color-border)">
            <button type="button" onClick={addBlindRow} className="py-1 text-[#d9c07a] hover:bg-black/30 text-xs border-r border-(--color-border) transition-colors">+ Add Blind Level</button>
            <button type="button" onClick={addBreakRow} className="py-1 text-(--color-silver) hover:bg-black/30 text-xs transition-colors">+ Add Break</button>
          </div>
        )}
      </div>
    </div>
  );
}

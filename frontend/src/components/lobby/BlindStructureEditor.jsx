import { useState } from "react";
import { DEFAULT_HANDS, DEFAULT_TIMED } from "./blindStructureDefaults";

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

export default function BlindStructureEditor({ levels, onChange }) {
  const [editing, setEditing] = useState(Boolean(levels?.length));
  const [mode, setMode] = useState(
    levels && levels[0]?.duration_minutes ? "time" : "hands"
  );

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
        <label className="block text-sm text-gray-400">Blind Structure</label>
        <button type="button" onClick={() => { setEditing(!editing); if (!levels) onChange([...defaults]); }}
          className="text-xs text-green-400 hover:underline">
          {editing ? "Collapse" : "Customize"}
        </button>
      </div>

      {editing && (
        <div className="flex gap-2 mb-2">
          <button type="button"
            onClick={() => switchMode("hands")}
            className={`text-xs px-3 py-1 rounded ${mode === "hands" ? "bg-green-600 text-white" : "bg-gray-700 text-gray-400"}`}>
            By Hands
          </button>
          <button type="button"
            onClick={() => switchMode("time")}
            className={`text-xs px-3 py-1 rounded ${mode === "time" ? "bg-green-600 text-white" : "bg-gray-700 text-gray-400"}`}>
            By Time
          </button>
        </div>
      )}

      <div className="text-xs bg-gray-900 rounded overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-gray-500">
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
              <tr key={i} className="border-t border-gray-800">
                <td className="px-2 py-1 text-gray-500">{i + 1}</td>
                {editing ? (
                  <>
                    <td className="px-2 py-1">
                      <select
                        className="bg-gray-800 rounded px-2 py-1"
                        value={r.is_break ? "break" : "blind"}
                        onChange={(e) => updateRow(i, "is_break", e.target.value === "break")}
                      >
                        <option value="blind">Blind</option>
                        <option value="break">Break</option>
                      </select>
                    </td>
                    <td>
                      {r.is_break ? (
                        <span className="text-gray-500">-</span>
                      ) : (
                        <input type="number" className="w-16 px-1 bg-gray-800 text-center rounded" value={r.small_blind} onChange={(e) => updateRow(i, "small_blind", e.target.value)} />
                      )}
                    </td>
                    <td>
                      {r.is_break ? (
                        <span className="text-gray-500">-</span>
                      ) : (
                        <input type="number" className="w-16 px-1 bg-gray-800 text-center rounded" value={r.big_blind} onChange={(e) => updateRow(i, "big_blind", e.target.value)} />
                      )}
                    </td>
                    <td>
                      {r.is_break ? (
                        <span className="text-gray-500">-</span>
                      ) : (
                        <input type="number" className="w-16 px-1 bg-gray-800 text-center rounded" value={r.ante} onChange={(e) => updateRow(i, "ante", e.target.value)} />
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-2">
                        <input
                          type="number"
                          className="w-14 px-1 bg-gray-800 text-center rounded"
                          value={r.is_break ? r.duration_minutes : (r[durationKey] ?? "")}
                          onChange={(e) => updateRow(i, r.is_break ? "duration_minutes" : durationKey, e.target.value)}
                        />
                        <span className="text-gray-500">{r.is_break ? "min" : mode === "time" ? "min" : "hands"}</span>
                      </div>
                    </td>
                    <td><button type="button" onClick={() => removeRow(i)} className="text-red-500 hover:text-red-400 px-1">x</button></td>
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
          <div className="grid grid-cols-2 border-t border-gray-800">
            <button type="button" onClick={addBlindRow} className="py-1 text-green-400 hover:bg-gray-800 text-xs border-r border-gray-800">+ Add Blind Level</button>
            <button type="button" onClick={addBreakRow} className="py-1 text-blue-400 hover:bg-gray-800 text-xs">+ Add Break</button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";

const DEFAULT_HANDS = [
  { small_blind: 25, big_blind: 50, ante: 0, duration_hands: 8 },
  { small_blind: 50, big_blind: 100, ante: 10, duration_hands: 8 },
  { small_blind: 75, big_blind: 150, ante: 25, duration_hands: 8 },
  { small_blind: 100, big_blind: 200, ante: 25, duration_hands: 8 },
  { small_blind: 150, big_blind: 300, ante: 50, duration_hands: 6 },
  { small_blind: 200, big_blind: 400, ante: 50, duration_hands: 6 },
  { small_blind: 300, big_blind: 600, ante: 75, duration_hands: 6 },
  { small_blind: 400, big_blind: 800, ante: 100, duration_hands: 6 },
];

const DEFAULT_TIMED = [
  { small_blind: 25, big_blind: 50, ante: 0, duration_minutes: 10 },
  { small_blind: 50, big_blind: 100, ante: 10, duration_minutes: 10 },
  { small_blind: 75, big_blind: 150, ante: 25, duration_minutes: 10 },
  { small_blind: 100, big_blind: 200, ante: 25, duration_minutes: 10 },
  { small_blind: 150, big_blind: 300, ante: 50, duration_minutes: 8 },
  { small_blind: 200, big_blind: 400, ante: 50, duration_minutes: 8 },
  { small_blind: 300, big_blind: 600, ante: 75, duration_minutes: 8 },
  { small_blind: 400, big_blind: 800, ante: 100, duration_minutes: 8 },
];

export default function BlindStructureEditor({ levels, onChange }) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState(
    levels && levels[0]?.duration_minutes ? "time" : "hands"
  );

  const defaults = mode === "time" ? DEFAULT_TIMED : DEFAULT_HANDS;
  const rows = levels || defaults;
  const durationKey = mode === "time" ? "duration_minutes" : "duration_hands";

  const switchMode = (newMode) => {
    setMode(newMode);
    const newDefaults = newMode === "time" ? DEFAULT_TIMED : DEFAULT_HANDS;
    const dKey = newMode === "time" ? "duration_minutes" : "duration_hands";
    const converted = (levels || defaults).map((r, i) => {
      const base = { small_blind: r.small_blind, big_blind: r.big_blind, ante: r.ante };
      base[dKey] = newDefaults[i]?.[dKey] || (newMode === "time" ? 10 : 8);
      return base;
    });
    onChange(converted);
  };

  const updateRow = (idx, field, value) => {
    const updated = rows.map((r, i) => (i === idx ? { ...r, [field]: Number(value) } : r));
    onChange(updated);
  };

  const addRow = () => {
    const last = rows[rows.length - 1];
    const newRow = {
      small_blind: last.big_blind,
      big_blind: last.big_blind * 2,
      ante: Math.round(last.big_blind * 0.25),
    };
    newRow[durationKey] = last[durationKey];
    onChange([...rows, newRow]);
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
              <th className="px-2 py-1">SB</th>
              <th className="px-2 py-1">BB</th>
              <th className="px-2 py-1">Ante</th>
              <th className="px-2 py-1">{mode === "time" ? "Min" : "Hands"}</th>
              {editing && <th className="px-2 py-1"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-800">
                <td className="px-2 py-1 text-gray-500">{i + 1}</td>
                {editing ? (
                  <>
                    <td><input type="number" className="w-16 px-1 bg-gray-800 text-center rounded" value={r.small_blind} onChange={(e) => updateRow(i, "small_blind", e.target.value)} /></td>
                    <td><input type="number" className="w-16 px-1 bg-gray-800 text-center rounded" value={r.big_blind} onChange={(e) => updateRow(i, "big_blind", e.target.value)} /></td>
                    <td><input type="number" className="w-16 px-1 bg-gray-800 text-center rounded" value={r.ante} onChange={(e) => updateRow(i, "ante", e.target.value)} /></td>
                    <td><input type="number" className="w-14 px-1 bg-gray-800 text-center rounded" value={r[durationKey]} onChange={(e) => updateRow(i, durationKey, e.target.value)} /></td>
                    <td><button type="button" onClick={() => removeRow(i)} className="text-red-500 hover:text-red-400 px-1">x</button></td>
                  </>
                ) : (
                  <>
                    <td className="text-center">{r.small_blind}</td>
                    <td className="text-center">{r.big_blind}</td>
                    <td className="text-center">{r.ante}</td>
                    <td className="text-center">{r[durationKey]}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {editing && (
          <button type="button" onClick={addRow} className="w-full py-1 text-green-400 hover:bg-gray-800 text-xs">+ Add Level</button>
        )}
      </div>
    </div>
  );
}

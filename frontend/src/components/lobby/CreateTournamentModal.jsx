import { useEffect, useState } from "react";
import BlindStructureEditor, { DEFAULT_HANDS } from "./BlindStructureEditor";

export default function CreateTournamentModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [chips, setChips] = useState(10000);
  const [maxPlayers, setMaxPlayers] = useState(9);
  const [playersPerTable, setPlayersPerTable] = useState(9);
  const [lateRegEnabled, setLateRegEnabled] = useState(true);
  const [lateRegLevel, setLateRegLevel] = useState(4);
  const [allowRebuys, setAllowRebuys] = useState(true);
  const [maxRebuys, setMaxRebuys] = useState(2);
  const [rebuyLevel, setRebuyLevel] = useState(4);
  const [customLevels, setCustomLevels] = useState(null); // null = use server default
  const [error, setError] = useState("");

  const effectiveLevels = customLevels || DEFAULT_HANDS;
  const blindLevelCount = effectiveLevels.filter((level) => !level.is_break).length;

  useEffect(() => {
    setLateRegLevel((current) => Math.min(Math.max(current, 1), blindLevelCount || 1));
    setRebuyLevel((current) => Math.min(Math.max(current, 1), blindLevelCount || 1));
  }, [blindLevelCount]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const payload = {
      name: name || "Tournament",
      starting_chips: chips,
      max_players: maxPlayers,
      players_per_table: playersPerTable,
      late_reg_level: lateRegEnabled ? lateRegLevel : 0,
      allow_rebuys: allowRebuys,
      max_rebuys: allowRebuys ? maxRebuys : 0,
      rebuy_level: allowRebuys ? rebuyLevel : 0,
    };
    if (customLevels) payload.levels = customLevels;
    try {
      await onCreate(payload);
    } catch (requestError) {
      const details = requestError.response?.data;
      if (typeof details === "string") {
        setError(details);
        return;
      }
      if (details?.error) {
        setError(details.error);
        return;
      }
      const firstFieldError = Object.values(details || {}).flat()[0];
      setError(firstFieldError || "Unable to create tournament.");
    }
  };

  const levelOptions = Array.from({ length: Math.max(blindLevelCount, 1) }, (_, index) => index + 1);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-xl w-[520px] max-h-[90vh] overflow-y-auto space-y-4">
        <h2 className="text-xl font-bold">Create Tournament</h2>

        <div className="space-y-2">
          <label className="block text-sm text-gray-400">Name</label>
          <input className="w-full px-3 py-2 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
            value={name} onChange={(e) => setName(e.target.value)} placeholder="My Tournament" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400">Starting Chips</label>
            <input type="number" min={100} className="w-full px-3 py-2 bg-gray-700 rounded focus:outline-none"
              value={chips} onChange={(e) => setChips(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-sm text-gray-400">Total Player Cap</label>
            <input type="number" min={2} className="w-full px-3 py-2 bg-gray-700 rounded focus:outline-none"
              value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400">Players Per Table</label>
          <input type="number" min={2} max={9} className="w-full px-3 py-2 bg-gray-700 rounded focus:outline-none"
            value={playersPerTable} onChange={(e) => setPlayersPerTable(Number(e.target.value))} />
          {maxPlayers > playersPerTable && (
            <p className="text-xs text-amber-400 mt-1">
              Multi-table seating is stored in tournament config. The current live game runtime still starts one active table at a time.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900 rounded-lg p-3 space-y-3">
            <label className="flex items-center justify-between text-sm">
              <span className="text-gray-300">Late Registration</span>
              <input type="checkbox" checked={lateRegEnabled} onChange={(e) => setLateRegEnabled(e.target.checked)} />
            </label>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Open Through Blind Level</label>
              <select
                className="w-full px-3 py-2 bg-gray-700 rounded focus:outline-none disabled:opacity-50"
                value={lateRegLevel}
                disabled={!lateRegEnabled}
                onChange={(e) => setLateRegLevel(Number(e.target.value))}
              >
                {levelOptions.map((level) => (
                  <option key={level} value={level}>Level {level}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-3 space-y-3">
            <label className="flex items-center justify-between text-sm">
              <span className="text-gray-300">Rebuys</span>
              <input type="checkbox" checked={allowRebuys} onChange={(e) => setAllowRebuys(e.target.checked)} />
            </label>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max Rebuys Per Player</label>
              <input
                type="number"
                min={0}
                className="w-full px-3 py-2 bg-gray-700 rounded focus:outline-none disabled:opacity-50"
                value={maxRebuys}
                disabled={!allowRebuys}
                onChange={(e) => setMaxRebuys(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Allow Through Blind Level</label>
              <select
                className="w-full px-3 py-2 bg-gray-700 rounded focus:outline-none disabled:opacity-50"
                value={rebuyLevel}
                disabled={!allowRebuys}
                onChange={(e) => setRebuyLevel(Number(e.target.value))}
              >
                {levelOptions.map((level) => (
                  <option key={level} value={level}>Level {level}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <BlindStructureEditor levels={customLevels} onChange={setCustomLevels} />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 rounded">Cancel</button>
          <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold">Create</button>
        </div>
      </form>
    </div>
  );
}

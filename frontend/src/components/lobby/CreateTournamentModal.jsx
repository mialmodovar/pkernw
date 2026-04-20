import { useState } from "react";
import BlindStructureEditor from "./BlindStructureEditor";

export default function CreateTournamentModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [chips, setChips] = useState(10000);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [customLevels, setCustomLevels] = useState(null); // null = use server default

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      name: name || "Tournament",
      starting_chips: chips,
      max_players: maxPlayers,
    };
    if (customLevels) payload.levels = customLevels;
    onCreate(payload);
  };

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
            <label className="block text-sm text-gray-400">Max Players</label>
            <input type="number" min={2} max={9} className="w-full px-3 py-2 bg-gray-700 rounded focus:outline-none"
              value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} />
          </div>
        </div>

        <BlindStructureEditor levels={customLevels} onChange={setCustomLevels} />

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 rounded">Cancel</button>
          <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold">Create</button>
        </div>
      </form>
    </div>
  );
}

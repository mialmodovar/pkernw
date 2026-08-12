import { useState } from "react";
import BlindStructureEditor from "./BlindStructureEditor";
import { DEFAULT_HANDS } from "./blindStructureDefaults";

const toDatetimeLocalValue = (date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

export default function CreateTournamentForm({ onCancel, onCreate }) {
  const [name, setName] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledStart, setScheduledStart] = useState(() => toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [chips, setChips] = useState(10000);
  const [maxPlayers, setMaxPlayers] = useState(9);
  const [playersPerTable, setPlayersPerTable] = useState(9);
  const [lateRegEnabled, setLateRegEnabled] = useState(true);
  const [lateRegLevel, setLateRegLevel] = useState(4);
  const [allowRebuys, setAllowRebuys] = useState(true);
  const [maxRebuys, setMaxRebuys] = useState(2);
  const [rebuyLevel, setRebuyLevel] = useState(4);
  const [timeBankEnabled, setTimeBankEnabled] = useState(false);
  const [timeBankSeconds, setTimeBankSeconds] = useState(30);
  const [timeBankRefillRule, setTimeBankRefillRule] = useState("hands");
  const [timeBankRefillEveryHands, setTimeBankRefillEveryHands] = useState(10);
  const [timeBankRefillLevel, setTimeBankRefillLevel] = useState(4);
  const [payoutEnabled, setPayoutEnabled] = useState(false);
  const [payoutRows, setPayoutRows] = useState([
    { place: 1, label: "1st", percentage: 50 },
    { place: 2, label: "2nd", percentage: 30 },
    { place: 3, label: "3rd", percentage: 20 },
  ]);
  const [rabbitHuntingEnabled, setRabbitHuntingEnabled] = useState(false);
  const [autoRemoveOfflineEnabled, setAutoRemoveOfflineEnabled] = useState(false);
  const [autoRemoveOfflineSeconds, setAutoRemoveOfflineSeconds] = useState(300);
  const [customLevels, setCustomLevels] = useState(null); // null = use server default
  const [error, setError] = useState("");

  const effectiveLevels = customLevels || DEFAULT_HANDS;
  const blindLevelCount = effectiveLevels.filter((level) => !level.is_break).length;
  const normalizedLateRegLevel = Math.min(Math.max(lateRegLevel, 1), blindLevelCount || 1);
  const normalizedRebuyLevel = Math.min(Math.max(rebuyLevel, 1), blindLevelCount || 1);
  const normalizedTimeBankRefillLevel = Math.min(Math.max(timeBankRefillLevel, 1), blindLevelCount || 1);
  const payoutTotal = payoutRows.reduce((sum, row) => sum + Number(row.percentage || 0), 0);

  const updatePayoutRow = (index, field, value) => {
    setPayoutRows((rows) => rows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: field === "label" ? value : Number(value) } : row
    )));
  };

  const addPayoutRow = () => {
    setPayoutRows((rows) => [
      ...rows,
      { place: rows.length + 1, label: `${rows.length + 1}${rows.length + 1 === 2 ? "nd" : rows.length + 1 === 3 ? "rd" : "th"}`, percentage: 0 },
    ]);
  };

  const removePayoutRow = (index) => {
    setPayoutRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    let scheduledStartAt = null;
    if (scheduleEnabled) {
      if (!scheduledStart) {
        setError("Choose a scheduled start date and time.");
        return;
      }
      const scheduledDate = new Date(scheduledStart);
      if (Number.isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
        setError("Scheduled start must be in the future.");
        return;
      }
      scheduledStartAt = scheduledDate.toISOString();
    }
    if (timeBankEnabled) {
      if (timeBankSeconds <= 0) {
        setError("Time bank length must be positive.");
        return;
      }
      if (timeBankRefillRule === "hands" && timeBankRefillEveryHands <= 0) {
        setError("Hands before refill must be positive.");
        return;
      }
    }
    if (payoutEnabled) {
      if (!payoutRows.length) {
        setError("Add at least one payout row.");
        return;
      }
      if (Math.round(payoutTotal * 100) / 100 !== 100) {
        setError("Payout percentages must add up to 100.");
        return;
      }
    }
    if (autoRemoveOfflineEnabled && autoRemoveOfflineSeconds <= 0) {
      setError("Offline removal timeout must be positive.");
      return;
    }
    const payload = {
      name: name || "Tournament",
      scheduled_start_at: scheduledStartAt,
      starting_chips: chips,
      max_players: maxPlayers,
      players_per_table: playersPerTable,
      late_reg_level: lateRegEnabled ? normalizedLateRegLevel : 0,
      allow_rebuys: allowRebuys,
      max_rebuys: allowRebuys ? maxRebuys : 0,
      rebuy_level: allowRebuys ? normalizedRebuyLevel : 0,
      time_bank_seconds: timeBankEnabled ? timeBankSeconds : 0,
      time_bank_refill_rule: timeBankEnabled ? timeBankRefillRule : "none",
      time_bank_refill_every_hands: timeBankEnabled && timeBankRefillRule === "hands" ? timeBankRefillEveryHands : null,
      time_bank_refill_level: timeBankEnabled && timeBankRefillRule === "blind_level" ? normalizedTimeBankRefillLevel : null,
      payout_structure: payoutEnabled ? payoutRows.map((row) => ({
        place: row.place,
        label: row.label,
        percentage: row.percentage,
      })) : [],
      rabbit_hunting_enabled: rabbitHuntingEnabled,
      auto_remove_offline_seconds: autoRemoveOfflineEnabled ? autoRemoveOfflineSeconds : 0,
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
    <form onSubmit={handleSubmit} className="panel p-6 rounded-xl space-y-4">
      <h2 className="text-xl font-bold text-(--color-silver)">Create Tournament</h2>

      <div className="space-y-2">
        <label className="block text-sm text-(--color-text-muted)">Name</label>
        <input className="input-field w-full px-3 py-2 rounded transition-colors"
          value={name} onChange={(e) => setName(e.target.value)} placeholder="My Tournament" />
      </div>

        <div className="panel-raised rounded-lg p-3 space-y-3">
          <label className="flex items-center justify-between text-sm">
            <span className="text-(--color-silver)">Schedule Start</span>
            <input type="checkbox" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} />
          </label>
          <div>
            <label className="block text-xs text-(--color-text-muted) mb-1">Start Date and Time</label>
            <input
              type="datetime-local"
              className="input-field w-full px-3 py-2 rounded transition-colors disabled:opacity-50"
              value={scheduledStart}
              disabled={!scheduleEnabled}
              min={toDatetimeLocalValue(new Date())}
              onChange={(e) => setScheduledStart(e.target.value)}
            />
            <p className="text-xs text-(--color-text-muted) mt-1">
              Times use your local timezone. The tournament starts automatically once enough players are seated.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-(--color-text-muted)">Starting Chips</label>
            <input type="number" min={100} className="input-field w-full px-3 py-2 rounded transition-colors"
              value={chips} onChange={(e) => setChips(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-sm text-(--color-text-muted)">Total Player Cap</label>
            <input type="number" min={2} className="input-field w-full px-3 py-2 rounded transition-colors"
              value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} />
          </div>
        </div>

        <div>
          <label className="block text-sm text-(--color-text-muted)">Players Per Table</label>
          <input type="number" min={2} max={9} className="input-field w-full px-3 py-2 rounded transition-colors"
            value={playersPerTable} onChange={(e) => setPlayersPerTable(Number(e.target.value))} />
          {maxPlayers > playersPerTable && (
            <p className="text-xs text-[#d9c07a] mt-1">
              Multi-table seating is stored in tournament config. The current live game runtime still starts one active table at a time.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="panel-raised rounded-lg p-3 space-y-3">
            <label className="flex items-center justify-between text-sm">
              <span className="text-(--color-silver)">Late Registration</span>
              <input type="checkbox" checked={lateRegEnabled} onChange={(e) => setLateRegEnabled(e.target.checked)} />
            </label>
            <div>
              <label className="block text-xs text-(--color-text-muted) mb-1">Open Through Blind Level</label>
              <select
                className="input-field w-full px-3 py-2 rounded transition-colors disabled:opacity-50"
                value={normalizedLateRegLevel}
                disabled={!lateRegEnabled}
                onChange={(e) => setLateRegLevel(Number(e.target.value))}
              >
                {levelOptions.map((level) => (
                  <option key={level} value={level}>Level {level}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="panel-raised rounded-lg p-3 space-y-3">
            <label className="flex items-center justify-between text-sm">
              <span className="text-(--color-silver)">Rebuys</span>
              <input type="checkbox" checked={allowRebuys} onChange={(e) => setAllowRebuys(e.target.checked)} />
            </label>
            <div>
              <label className="block text-xs text-(--color-text-muted) mb-1">Max Rebuys Per Player</label>
              <input
                type="number"
                min={0}
                className="input-field w-full px-3 py-2 rounded transition-colors disabled:opacity-50"
                value={maxRebuys}
                disabled={!allowRebuys}
                onChange={(e) => setMaxRebuys(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs text-(--color-text-muted) mb-1">Allow Through Blind Level</label>
              <select
                className="input-field w-full px-3 py-2 rounded transition-colors disabled:opacity-50"
                value={normalizedRebuyLevel}
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

        <div className="panel-raised rounded-lg p-3 space-y-3">
          <label className="flex items-center justify-between text-sm">
            <span className="text-(--color-silver)">Time Bank</span>
            <input type="checkbox" checked={timeBankEnabled} onChange={(e) => setTimeBankEnabled(e.target.checked)} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-(--color-text-muted) mb-1">Length</label>
              <input
                type="number"
                min={1}
                className="input-field w-full px-3 py-2 rounded transition-colors disabled:opacity-50"
                value={timeBankSeconds}
                disabled={!timeBankEnabled}
                onChange={(e) => setTimeBankSeconds(Number(e.target.value))}
              />
              <p className="text-xs text-(--color-text-muted) mt-1">Seconds per player</p>
            </div>

            <div>
              <label className="block text-xs text-(--color-text-muted) mb-1">Refill Rule</label>
              <select
                className="input-field w-full px-3 py-2 rounded transition-colors disabled:opacity-50"
                value={timeBankRefillRule}
                disabled={!timeBankEnabled}
                onChange={(e) => setTimeBankRefillRule(e.target.value)}
              >
                <option value="hands">Every N hands</option>
                <option value="blind_level">At blind level</option>
                <option value="none">No refill</option>
              </select>
            </div>
          </div>

          {timeBankRefillRule === "hands" && (
            <div>
              <label className="block text-xs text-(--color-text-muted) mb-1">Hands Before Refill</label>
              <input
                type="number"
                min={1}
                className="input-field w-full px-3 py-2 rounded transition-colors disabled:opacity-50"
                value={timeBankRefillEveryHands}
                disabled={!timeBankEnabled}
                onChange={(e) => setTimeBankRefillEveryHands(Number(e.target.value))}
              />
            </div>
          )}

          {timeBankRefillRule === "blind_level" && (
            <div>
              <label className="block text-xs text-(--color-text-muted) mb-1">Refill At Blind Level</label>
              <select
                className="input-field w-full px-3 py-2 rounded transition-colors disabled:opacity-50"
                value={normalizedTimeBankRefillLevel}
                disabled={!timeBankEnabled}
                onChange={(e) => setTimeBankRefillLevel(Number(e.target.value))}
              >
                {levelOptions.map((level) => (
                  <option key={level} value={level}>Level {level}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="panel-raised rounded-lg p-3 space-y-3">
          <label className="flex items-center justify-between text-sm">
            <span className="text-(--color-silver)">Prize Pool Reference</span>
            <input type="checkbox" checked={payoutEnabled} onChange={(e) => setPayoutEnabled(e.target.checked)} />
          </label>
          <p className="text-xs text-(--color-text-muted)">
            Reference only. This does not process or track real-money payments.
          </p>

          <div className="space-y-2">
            <div className="grid grid-cols-[70px_1fr_90px_32px] gap-2 text-xs text-(--color-text-muted)">
              <span>Place</span>
              <span>Label</span>
              <span>Percent</span>
              <span></span>
            </div>
            {payoutRows.map((row, index) => (
              <div key={index} className="grid grid-cols-[70px_1fr_90px_32px] gap-2">
                <input
                  type="number"
                  min={1}
                  className="input-field px-2 py-1 rounded transition-colors disabled:opacity-50"
                  value={row.place}
                  disabled={!payoutEnabled}
                  onChange={(e) => updatePayoutRow(index, "place", e.target.value)}
                />
                <input
                  className="input-field px-2 py-1 rounded transition-colors disabled:opacity-50"
                  value={row.label}
                  disabled={!payoutEnabled}
                  onChange={(e) => updatePayoutRow(index, "label", e.target.value)}
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  className="input-field px-2 py-1 rounded transition-colors disabled:opacity-50"
                  value={row.percentage}
                  disabled={!payoutEnabled}
                  onChange={(e) => updatePayoutRow(index, "percentage", e.target.value)}
                />
                <button
                  type="button"
                  className="text-[#c76b7a] hover:text-[#e3cdd1] transition-colors disabled:opacity-30"
                  disabled={!payoutEnabled || payoutRows.length <= 1}
                  onClick={() => removePayoutRow(index)}
                >
                  x
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button type="button" className="text-xs text-[#d9c07a] transition-colors disabled:opacity-50" disabled={!payoutEnabled} onClick={addPayoutRow}>
                + Add Payout
              </button>
              <span className={`text-xs ${payoutEnabled && Math.round(payoutTotal * 100) / 100 !== 100 ? "text-[#c76b7a]" : "text-(--color-text-muted)"}`}>
                Total {payoutTotal.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        <div className="panel-raised rounded-lg p-3 space-y-3">
          <label className="flex items-center justify-between text-sm">
            <span className="text-(--color-silver)">Rabbit Hunting</span>
            <input
              type="checkbox"
              checked={rabbitHuntingEnabled}
              onChange={(e) => setRabbitHuntingEnabled(e.target.checked)}
            />
          </label>
          <p className="text-xs text-(--color-text-muted)">
            Show unused board cards after a hand ends early. These cards are informational only.
          </p>
        </div>

        <div className="panel-raised rounded-lg p-3 space-y-3">
          <label className="flex items-center justify-between text-sm">
            <span className="text-(--color-silver)">Auto-Remove Offline Players</span>
            <input
              type="checkbox"
              checked={autoRemoveOfflineEnabled}
              onChange={(e) => setAutoRemoveOfflineEnabled(e.target.checked)}
            />
          </label>
          <div>
            <label className="block text-xs text-(--color-text-muted) mb-1">Timeout</label>
            <input
              type="number"
              min={1}
              className="input-field w-full px-3 py-2 rounded transition-colors disabled:opacity-50"
              value={autoRemoveOfflineSeconds}
              disabled={!autoRemoveOfflineEnabled}
              onChange={(e) => setAutoRemoveOfflineSeconds(Number(e.target.value))}
            />
            <p className="text-xs text-(--color-text-muted) mt-1">Seconds offline before removal at the next hand boundary</p>
          </div>
        </div>

        <BlindStructureEditor levels={customLevels} onChange={setCustomLevels} />

        {error && <p className="text-sm text-[#c76b7a]">{error}</p>}

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary px-4 py-2 rounded transition-colors">Cancel</button>
        <button type="submit" className="btn-accent px-4 py-2 rounded font-semibold transition-colors">Create</button>
      </div>
    </form>
  );
}

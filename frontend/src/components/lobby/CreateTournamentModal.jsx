import Icon from "../icons/Icon";
import { useEffect, useState } from "react";
import api from "../../api/http";
import BlindStructureEditor from "./BlindStructureEditor";
import { DEFAULT_HANDS } from "./blindStructureDefaults";
import { formatCoins } from "./buyIn";
import {
  DEFAULT_PAID_PCT, bountyCentsFor, bountyPctOf, paidPct, payoutCurve, placesPaid,
} from "./payoutCurve";
import {
  SPEEDS,
  SPEED_NAMES,
  buildBlindStructure,
  estimateMinutes,
  formatDuration,
} from "./blindStructureBuilder";

const toDatetimeLocalValue = (date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

// The only game there is, so far. Named rather than assumed, so adding another
// is a list to extend instead of an assumption to hunt down.
const GAME_TYPES = [{ value: "nlh", label: "No-Limit Hold'em" }];

// The floor and the default, matching MIN_COIN_BUY_IN and DEFAULT_COIN_BUY_IN in
// tournaments/serializers.py — the server is the authority, and a form that
// offers what it refuses is worse than one that offers nothing.
const MIN_COIN_BUY_IN = 5;
const DEFAULT_COIN_BUY_IN = 50;

// No third option on purpose. See the note beside the currency state below.
// The coin is the app's own drawing rather than the system emoji, which is a
// different picture on every platform and none of them is the one in the
// header. The euro sign is a character and stays one.
const CURRENCIES = [
  { key: "coins", label: "Coins", icon: "coin" },
  { key: "euros", label: "\u20AC Real money" },
];

export default function CreateTournamentForm({ onCancel, onCreate, editing = null, onSave }) {
  const [name, setName] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledStart, setScheduledStart] = useState(() => toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [chips, setChips] = useState(10000);
  const [maxPlayers, setMaxPlayers] = useState(9);
  // Eight by default, matching the server's own default (see
  // tournaments/models.py): a nine-handed table is a lot of seats to read.
  const [playersPerTable, setPlayersPerTable] = useState(8);
  const [lateRegEnabled, setLateRegEnabled] = useState(true);
  const [lateRegLevel, setLateRegLevel] = useState(4);
  const [allowRebuys, setAllowRebuys] = useState(true);
  const [maxRebuys, setMaxRebuys] = useState(null);   // null = unlimited
  const [rebuyLevel, setRebuyLevel] = useState(4);
  const [timeBankEnabled, setTimeBankEnabled] = useState(true);
  const [timeBankSeconds, setTimeBankSeconds] = useState(30);
  const [timeBankRefillRule, setTimeBankRefillRule] = useState("hands");
  const [timeBankRefillEveryHands, setTimeBankRefillEveryHands] = useState(10);
  const [timeBankRefillLevel, setTimeBankRefillLevel] = useState(4);
  // Which currency the night is played for. Coins by default, and there is no
  // third option: a tournament with nothing at stake is a tournament nobody
  // folds in, and euros are only ever a note for people to settle themselves.
  const [currency, setCurrency] = useState("coins");
  const [buyInEuros, setBuyInEuros] = useState(0);
  const [buyInCoins, setBuyInCoins] = useState(DEFAULT_COIN_BUY_IN);
  // How much of the field gets paid. The split follows from it, and the grid
  // below is only opened by somebody who wants to move a number by hand.
  const [paidPctOfField, setPaidPctOfField] = useState(DEFAULT_PAID_PCT);
  const [customPayouts, setCustomPayouts] = useState(false);
  const [payoutRows, setPayoutRows] = useState([
    { place: 1, label: "1st", percentage: 50 },
    { place: 2, label: "2nd", percentage: 30 },
    { place: 3, label: "3rd", percentage: 20 },
  ]);
  // Knockouts come out of the buy-in, so the whole section lives under the
  // prize pool and switches off with it.
  const [bountyMode, setBountyMode] = useState("none");
  // A share of the buy-in rather than an amount: "half of it goes on heads" is
  // the decision, and the euros follow from it. The amount is still what gets
  // sent — see bountyCents below.
  const [bountyPct, setBountyPct] = useState(50);
  const [bountySplit, setBountySplit] = useState(50);
  const [mysteryRelease, setMysteryRelease] = useState("itm");
  // On by default: seeing the cards that would have come is the kind of thing
  // a friendly game wants, and a host who disagrees can turn it off here.
  const [rabbitHuntingEnabled, setRabbitHuntingEnabled] = useState(true);
  // How long the table holds after each hand — also the window in which players
  // can show their cards, so it is how long anybody has to look at what was
  // shown.
  const [showdownSeconds, setShowdownSeconds] = useState(5);
  const [autoRemoveOfflineEnabled, setAutoRemoveOfflineEnabled] = useState(false);
  const [autoRemoveOfflineSeconds, setAutoRemoveOfflineSeconds] = useState(300);
  const [customLevels, setCustomLevels] = useState(null); // null = use server default
  const [error, setError] = useState("");
  const [gameType, setGameType] = useState("nlh");
  // Which club's night this is, and which of its leagues it counts for. Both
  // optional: a tournament with no club is the one-off this app started with.
  const [staffedClubs, setStaffedClubs] = useState([]);
  const [clubId, setClubId] = useState("");
  const [clubLeagues, setClubLeagues] = useState([]);
  const [seasonId, setSeasonId] = useState("");
  // Most tournaments are one of three, and answering thirty questions to get
  // one of them is the reason hosts reuse whatever they made last time. Quick
  // asks the two that matter and derives the rest; advanced is the whole form,
  // unchanged. Editing is always the full form — you came here to change a
  // particular thing.
  const [advanced, setAdvanced] = useState(Boolean(editing));
  const [quickSpeed, setQuickSpeed] = useState("normal");
  // Tournaments to copy a setup from. Most games in a home league are the same
  // game every week, and rebuilding a structure, a payout table and a bounty
  // rule from memory each time is how they end up subtly different.
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);

  // Editing starts from the tournament being edited. Same loader as the
  // template picker, because "fill this form in from that tournament" is the
  // same job whether you are copying it or changing it.
  const editingId = editing?.id ?? null;

  useEffect(() => {
    // Once for the tournament handed in. Re-running it would undo whatever has
    // been typed since, so the id is the whole dependency.
    if (editingId != null) applyTemplate(String(editingId), { keepName: false });
  }, [editingId]);

  // Only clubs you help run: a night is organised, not just attended.
  useEffect(() => {
    let cancelled = false;
    api.get("/clubs/")
      .then(({ data }) => {
        if (cancelled) return;
        setStaffedClubs(data.filter((club) => club.my_role === "owner" || club.my_role === "staff"));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // The leagues of whichever club is chosen, so "counts for" can offer them.
  useEffect(() => {
    if (!clubId) { setClubLeagues([]); return undefined; }
    const club = staffedClubs.find((one) => String(one.id) === String(clubId));
    if (!club) return undefined;
    let cancelled = false;
    api.get(`/clubs/${club.slug}/`)
      .then(({ data }) => {
        if (cancelled) return;
        setClubLeagues(data.leagues.filter((league) => !league.is_archived && league.open_season_id));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [clubId, staffedClubs]);

  useEffect(() => {
    if (editingId != null) return undefined;   // nothing to copy from, it is the one being edited
    let cancelled = false;
    api.get("/tournaments/")
      .then(({ data }) => { if (!cancelled) setTemplates(data.slice(0, 25)); })
      // A form that cannot offer templates is still a working form.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [editingId]);

  /**
   * Take everything from an earlier tournament except what makes it that
   * tournament: its name and when it was due to start.
   */
  const applyTemplate = async (id, { keepName = true } = {}) => {
    setTemplateId(id);
    if (!id) return;
    setTemplateBusy(true);
    setError("");
    try {
      const { data } = await api.get(`/tournaments/${id}/`);
      // A copy is a new night and needs its own name; an edit is the same one.
      if (!keepName) {
        setName(data.name);
        setGameType(data.game_type || "nlh");
        if (data.scheduled_start_at) {
          setScheduleEnabled(true);
          setScheduledStart(toDatetimeLocalValue(new Date(data.scheduled_start_at)));
        }
      }
      setClubId(data.club || "");
      setSeasonId(data.season || "");
      setChips(data.starting_chips);
      setMaxPlayers(data.max_players);
      setPlayersPerTable(data.players_per_table);
      setLateRegEnabled(data.late_reg_level > 0);
      if (data.late_reg_level > 0) setLateRegLevel(data.late_reg_level);
      setAllowRebuys(data.allow_rebuys);
      setMaxRebuys(data.max_rebuys ?? null);
      if (data.rebuy_level > 0) setRebuyLevel(data.rebuy_level);
      setTimeBankEnabled(data.time_bank_seconds > 0);
      if (data.time_bank_seconds > 0) setTimeBankSeconds(data.time_bank_seconds);
      setTimeBankRefillRule(data.time_bank_refill_rule || "none");
      if (data.time_bank_refill_every_hands) setTimeBankRefillEveryHands(data.time_bank_refill_every_hands);
      if (data.time_bank_refill_level) setTimeBankRefillLevel(data.time_bank_refill_level);
      setRabbitHuntingEnabled(data.rabbit_hunting_enabled);
      setShowdownSeconds(data.showdown_seconds || 5);
      setAutoRemoveOfflineEnabled(data.auto_remove_offline_seconds > 0);
      if (data.auto_remove_offline_seconds > 0) setAutoRemoveOfflineSeconds(data.auto_remove_offline_seconds);

      const loaded = data.payout_structure || [];
      if (loaded.length > 0) {
        setPayoutRows(loaded);
        // The template's own field size, not whatever is currently typed into
        // the form: this effect runs once and must not depend on the rest of it.
        setPaidPctOfField(paidPct(data.max_players || loaded.length, loaded.length));
        // A structure that is not the one this form would have generated is one
        // somebody arranged on purpose, and it opens the grid rather than being
        // quietly rewritten.
        const generated = payoutCurve(loaded.length);
        const same = loaded.length === generated.length
          && loaded.every((row, index) => row.percentage === generated[index].percentage);
        setCustomPayouts(!same);
      }
      setCurrency((data.buy_in_cents || 0) > 0 ? "euros" : "coins");
      setBuyInEuros((data.buy_in_cents || 0) / 100);
      setBuyInCoins(data.buy_in_coins || DEFAULT_COIN_BUY_IN);
      setBountyMode(data.bounty_mode || "none");
      setBountyPct(bountyPctOf(data.buy_in_cents || 0, data.bounty_cents || 0));
      setBountySplit(data.bounty_progressive_split_pct || 50);
      setMysteryRelease(data.mystery_release || "itm");

      // Stripped of the database's own columns, so these are levels to create
      // rather than levels that already exist. Left null when there are none:
      // an empty array is truthy, and it would be sent as "replace the ladder
      // with nothing" rather than as "there is nothing to say about it".
      setCustomLevels(!data.levels?.length ? null : data.levels.map((level) => ({
        is_break: level.is_break,
        small_blind: level.small_blind,
        big_blind: level.big_blind,
        ante: level.ante,
        duration_hands: level.duration_hands,
        duration_minutes: level.duration_minutes,
      })));
    } catch {
      setError("Could not read that tournament's setup.");
    } finally {
      setTemplateBusy(false);
    }
  };

  const effectiveLevels = customLevels || DEFAULT_HANDS;
  const blindLevelCount = effectiveLevels.filter((level) => !level.is_break).length;
  const normalizedLateRegLevel = Math.min(Math.max(lateRegLevel, 1), blindLevelCount || 1);
  const normalizedRebuyLevel = Math.min(Math.max(rebuyLevel, 1), blindLevelCount || 1);
  const normalizedTimeBankRefillLevel = Math.min(Math.max(timeBankRefillLevel, 1), blindLevelCount || 1);
  // Generated from the share of the field unless somebody has taken the grid
  // over. One source of truth either way: this is what gets sent.
  const paidPlaces = placesPaid(maxPlayers, paidPctOfField);
  const payouts = customPayouts ? payoutRows : payoutCurve(paidPlaces);
  const payoutTotal = payouts.reduce((sum, row) => sum + Number(row.percentage || 0), 0);
  const euroMode = currency === "euros";
  // Cents, so the euro shares below match what the ledger will record to the cent.
  const buyInCents = euroMode ? Math.max(0, Math.round(Number(buyInEuros || 0) * 100)) : 0;
  // Coins are whole. Half a coin is not a thing anybody can be charged.
  const stakeCoins = euroMode ? 0 : Math.max(0, Math.round(Number(buyInCoins || 0)));
  const bountyOn = euroMode && bountyMode !== "none";
  const bountyCents = bountyOn ? bountyCentsFor(buyInCents, bountyPct) : 0;
  // The percentages below share out only what is left after the bounties, so
  // the euro figures beside them stay honest.
  const potCents = Math.max(0, buyInCents - bountyCents) * maxPlayers;

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
    if (!payouts.length) {
      setError("Somebody has to get paid.");
      return;
    }
    if (Math.round(payoutTotal * 100) / 100 !== 100) {
      setError("Payout percentages must add up to 100.");
      return;
    }
    if (!euroMode && stakeCoins < MIN_COIN_BUY_IN) {
      setError(`A coin buy-in of less than ${MIN_COIN_BUY_IN} is not a stake.`);
      return;
    }
    {
      if (bountyMode !== "none" && euroMode) {
        if (buyInCents <= 0) {
          setError("Set a buy-in for the knockout bounties to come out of.");
          return;
        }
        if (bountyCents <= 0) {
          setError("Set a bounty amount.");
          return;
        }
        if (bountyCents >= buyInCents) {
          setError("The bounty comes out of the buy-in, so it must be less than it.");
          return;
        }
        if (bountyMode === "progressive" && (bountySplit < 1 || bountySplit > 99)) {
          setError("The progressive cash share must be between 1% and 99%.");
          return;
        }
      }
    }
    if (showdownSeconds < 2 || showdownSeconds > 60) {
      setError("The showdown pause must be between 2 and 60 seconds.");
      return;
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
      max_rebuys: allowRebuys ? maxRebuys : 0,   // null rides through as unlimited
      rebuy_level: allowRebuys ? normalizedRebuyLevel : 0,
      time_bank_seconds: timeBankEnabled ? timeBankSeconds : 0,
      time_bank_refill_rule: timeBankEnabled ? timeBankRefillRule : "none",
      time_bank_refill_every_hands: timeBankEnabled && timeBankRefillRule === "hands" ? timeBankRefillEveryHands : null,
      time_bank_refill_level: timeBankEnabled && timeBankRefillRule === "blind_level" ? normalizedTimeBankRefillLevel : null,
      payout_structure: payouts.map((row) => ({
        place: row.place,
        label: row.label,
        percentage: row.percentage,
      })),
      buy_in_cents: buyInCents,
      buy_in_coins: stakeCoins,
      bounty_mode: bountyOn ? bountyMode : "none",
      bounty_cents: bountyCents,
      bounty_progressive_split_pct: bountyMode === "progressive" ? Number(bountySplit) : 50,
      mystery_release: mysteryRelease,
      rabbit_hunting_enabled: rabbitHuntingEnabled,
      showdown_seconds: showdownSeconds,
      auto_remove_offline_seconds: autoRemoveOfflineEnabled ? autoRemoveOfflineSeconds : 0,
    };
    payload.game_type = gameType;
    payload.club = clubId || null;
    payload.season = clubId && seasonId ? seasonId : null;
    if (editing) {
      // The money is not the host's to change once people have joined on it,
      // and the server refuses it regardless — see LOCKED_AFTER_CREATION.
      delete payload.buy_in_cents;
      delete payload.buy_in_coins;
      delete payload.payout_structure;
      delete payload.bounty_mode;
      delete payload.bounty_cents;
      delete payload.bounty_progressive_split_pct;
      delete payload.mystery_release;
    }
    if (!advanced) {
      // The two answers, turned into a structure. Everything else is the
      // form's own defaults, which is what "quick" means.
      payload.levels = buildBlindStructure({
        minutes: estimateMinutes({ players: maxPlayers, speed: quickSpeed }),
        speed: quickSpeed,
        startingChips: chips,
        players: maxPlayers,
      });
    } else if (customLevels) {
      payload.levels = customLevels;
    }
    try {
      await (editing ? onSave(payload) : onCreate(payload));
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-(--color-silver)">
          {editing ? "Edit Tournament" : "Create Tournament"}
        </h2>
        {/* Not offered while editing: you came here to change one particular
            thing, and the quick form cannot express most of them. */}
        {!editing && (
          <div className="flex rounded overflow-hidden border border-(--color-border)">
            {[["Quick", false], ["Advanced", true]].map(([label, value]) => (
              <button
                key={label}
                type="button"
                onClick={() => setAdvanced(value)}
                className={`px-3 py-1 text-xs font-semibold transition-colors ${
                  advanced === value
                    ? "bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deeper))] text-(--color-highlight-ink)"
                    : "text-(--color-text-muted) hover:text-(--color-silver)"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {templates.length > 0 && (
        <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-(--color-text-muted)">Copy setup from</span>
          <select
            className="input-field px-2 py-1 rounded flex-1 min-w-40 transition-colors"
            value={templateId}
            disabled={templateBusy}
            onChange={(event) => applyTemplate(event.target.value)}
          >
            <option value="">Start from scratch</option>
            {templates.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="space-y-2">
        <label className="block text-sm text-(--color-text-muted)">Name</label>
        <input className="input-field w-full px-3 py-2 rounded transition-colors"
          value={name} onChange={(e) => setName(e.target.value)} placeholder="My Tournament" />
      </div>

      {staffedClubs.length > 0 && (
        <div className="panel-raised rounded-lg p-3 space-y-2">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-(--color-text-muted)">Club</span>
            <select
              className="input-field px-2 py-1 rounded flex-1 transition-colors disabled:opacity-50"
              value={clubId}
              disabled={Boolean(editing)}
              onChange={(event) => { setClubId(event.target.value); setSeasonId(""); }}
            >
              <option value="">No club — a one-off</option>
              {staffedClubs.map((club) => (
                <option key={club.id} value={club.id}>{club.emoji} {club.name}</option>
              ))}
            </select>
          </label>

          {clubId && (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-(--color-text-muted)">Counts for</span>
              <select
                className="input-field px-2 py-1 rounded flex-1 transition-colors disabled:opacity-50"
                value={seasonId}
                disabled={Boolean(editing)}
                onChange={(event) => setSeasonId(event.target.value)}
              >
                <option value="">Nothing — just a club night</option>
                {clubLeagues.map((league) => (
                  <option key={league.id} value={league.open_season_id}>{league.emoji} {league.name}</option>
                ))}
              </select>
            </label>
          )}

          {editing && (
            <p className="text-[11px] text-(--color-text-muted)">
              Which club and table a night belongs to is fixed once it exists —
              results may already be counted.
            </p>
          )}
        </div>
      )}

      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="text-(--color-text-muted)">Game</span>
        <select
          className="input-field px-2 py-1 rounded flex-1 transition-colors"
          value={gameType}
          onChange={(event) => setGameType(event.target.value)}
        >
          {GAME_TYPES.map((game) => (
            <option key={game.value} value={game.value}>{game.label}</option>
          ))}
        </select>
      </label>

      {/* Quick: the two answers everything else follows from. */}
      {!advanced && (
        <div className="panel-raised rounded-lg p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-(--color-silver)">Speed</span>
            <div className="flex rounded overflow-hidden border border-(--color-border)">
              {SPEED_NAMES.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => setQuickSpeed(speed)}
                  className={`px-3 py-1 text-xs font-semibold transition-colors ${
                    quickSpeed === speed
                      ? "bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deeper))] text-(--color-highlight-ink)"
                      : "text-(--color-text-muted) hover:text-(--color-silver)"
                  }`}
                >
                  {SPEEDS[speed].label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-(--color-text-muted)">Players</span>
            <input
              type="number"
              min={2}
              max={90}
              className="input-field px-2 py-1 rounded w-24 text-right transition-colors"
              value={maxPlayers}
              onChange={(event) => {
                const value = Number(event.target.value);
                setMaxPlayers(value);
                // One table until there are too many for one table.
                setPlayersPerTable(Math.min(9, Math.max(2, value)));
              }}
            />
          </label>

          <p className="text-xs text-(--color-text-muted) leading-snug">
            {`About ${formatDuration(estimateMinutes({ players: maxPlayers, speed: quickSpeed }))}, `}
            {`${chips.toLocaleString()} chips, `}
            {`${SPEEDS[quickSpeed].minutesPerLevel} minute levels. `}
            No buy-in, no bounties — switch to Advanced for those.
          </p>
        </div>
      )}

      {advanced && (
        <>

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
              {/* Unlimited is the usual answer, so it is the state the field
                  starts in rather than a number somebody has to clear. The
                  level cutoff below is the limit people actually think in. */}
              <label className="flex items-center gap-2 text-xs text-(--color-text-muted) mb-1">
                <input
                  type="checkbox"
                  checked={maxRebuys === null}
                  disabled={!allowRebuys}
                  onChange={(e) => setMaxRebuys(e.target.checked ? null : 2)}
                />
                Unlimited
              </label>
              <input
                type="number"
                min={0}
                className="input-field w-full px-3 py-2 rounded transition-colors disabled:opacity-50"
                value={maxRebuys ?? ""}
                placeholder="Unlimited"
                disabled={!allowRebuys || maxRebuys === null}
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

        {/* Hidden while editing rather than disabled: the money is the deal
            players joined on, and a greyed-out form still invites the argument
            about why. The server refuses it either way. */}
        {editing ? (
          <p className="text-xs text-(--color-text-muted) panel-raised rounded-lg p-3">
            Buy-in, payouts and bounties are fixed once a tournament is open —
            they are what players signed up to. Delete it and make another if
            those need to change.
          </p>
        ) : (
        <div className="panel-raised rounded-lg p-3 space-y-3">
          {/* One currency or the other, and no "off". A game that costs nothing
              is one nobody folds in — coins are the app's own, actually charged
              and actually paid back, and euros are a note for people who settle
              between themselves. */}
          <div className="space-y-2">
            <span className="text-(--color-silver) text-sm">Played for</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Buy-in currency">
              {CURRENCIES.map((one) => (
                <button
                  key={one.key}
                  type="button"
                  role="radio"
                  aria-checked={currency === one.key}
                  onClick={() => setCurrency(one.key)}
                  className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5
                              rounded-full text-xs font-semibold border transition-colors ${
                    currency === one.key
                      ? "bg-(--color-accent) text-(--color-accent-text) border-(--color-border-strong)"
                      : "panel-raised text-(--color-text-muted) border-(--color-border) hover:text-(--color-silver)"
                  }`}
                >
                  {one.icon && <Icon name={one.icon} className="w-3.5 h-3.5" tone="gold" />}
                  {one.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-(--color-text-muted) leading-snug">
              {euroMode
                ? "Real money. The app records who owes whom and never handles a cent of it — settle up in Calotes."
                : "Coins. Taken from each player's wallet when they join, and paid back to the places below when it ends."}
            </p>
          </div>

          {euroMode ? (
            <label className="flex items-center justify-between text-sm gap-3">
              <span className="text-(--color-text-muted) text-xs">Buy-in (€)</span>
              <input
                type="number"
                min={0}
                step="0.5"
                className="input-field px-2 py-1 rounded w-28 text-right transition-colors"
                value={buyInEuros}
                onChange={(e) => setBuyInEuros(e.target.value)}
              />
            </label>
          ) : (
            <label className="flex items-center justify-between text-sm gap-3">
              <span className="text-(--color-text-muted) text-xs">Buy-in (coins)</span>
              <input
                type="number"
                min={MIN_COIN_BUY_IN}
                step="5"
                className="input-field px-2 py-1 rounded w-28 text-right transition-colors"
                value={buyInCoins}
                onChange={(e) => setBuyInCoins(e.target.value)}
              />
            </label>
          )}

          {/* Knockouts. One select and one amount is the whole configuration —
              the bounty is carved out of the buy-in above rather than charged
              on top, so nobody has to work out what the night actually costs. */}
          <div className="space-y-2 pt-1 border-t border-(--color-border)">
            <label className="flex items-center justify-between text-sm gap-3">
              <span className="text-(--color-text-muted) text-xs">Knockout bounties</span>
              <select
                className="input-field px-2 py-1 rounded w-40 transition-colors disabled:opacity-50"
                value={euroMode ? bountyMode : "none"}
                disabled={!euroMode}
                onChange={(e) => setBountyMode(e.target.value)}
              >
                <option value="none">Off</option>
                <option value="fixed">Fixed KO</option>
                <option value="progressive">Progressive KO</option>
                <option value="mystery">Mystery bounty</option>
              </select>
            </label>

            {/* When the envelopes open. The only thing a mystery game needs
                configuring beyond the amount — everything else about it follows
                from the pool. */}
            {euroMode && bountyMode === "mystery" && (
              <label className="flex items-center justify-between text-sm gap-3">
                <span className="text-(--color-text-muted) text-xs">Envelopes open</span>
                <select
                  className="input-field px-2 py-1 rounded w-40 transition-colors"
                  value={mysteryRelease}
                  onChange={(e) => setMysteryRelease(e.target.value)}
                >
                  <option value="itm">At the money</option>
                  <option value="reg_closed">When registration closes</option>
                </select>
              </label>
            )}

            {bountyOn && (
              <>
                <label className="flex items-center justify-between text-sm gap-3">
                  <span className="text-(--color-text-muted) text-xs">
                    Bounty
                    <span className="block opacity-70">share of each buy-in</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <input
                      type="range"
                      min={10}
                      max={90}
                      step={5}
                      className="w-28"
                      value={bountyPct}
                      aria-label="Bounty share of the buy-in"
                      onChange={(e) => setBountyPct(Number(e.target.value))}
                    />
                    <span className="w-24 text-right text-sm text-(--color-silver) tabular-nums">
                      {bountyPct}% · {(bountyCents / 100).toFixed(2)}€
                    </span>
                  </span>
                </label>

                {bountyMode === "progressive" && (
                  <label className="flex items-center justify-between text-sm gap-3">
                    <span className="text-(--color-text-muted) text-xs">Paid in cash (%)</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      className="input-field px-2 py-1 rounded w-28 text-right transition-colors"
                      value={bountySplit}
                      onChange={(e) => setBountySplit(Number(e.target.value))}
                    />
                  </label>
                )}

                <p className="text-xs text-(--color-text-muted) leading-snug">
                  {bountyCents >= buyInCents && buyInCents > 0
                    ? "The bounty has to be smaller than the buy-in."
                    : bountyMode === "mystery"
                    ? `Of each ${(buyInCents / 100).toFixed(2)}€ buy-in, ${((buyInCents - bountyCents) / 100).toFixed(2)}€ goes to the places below and ${(bountyCents / 100).toFixed(2)}€ into a sealed pool. `
                      + (mysteryRelease === "reg_closed"
                        ? "When registration closes the pool is cut into envelopes of wildly different sizes, and every knockout after that draws one."
                        : "When the field reaches the money the pool is cut into envelopes of wildly different sizes, and every knockout after that draws one.")
                      + " Knockouts before then pay nothing — that is the point of them."
                    : `Of each ${(buyInCents / 100).toFixed(2)}€ buy-in, ${((buyInCents - bountyCents) / 100).toFixed(2)}€ goes to the places below and ${(bountyCents / 100).toFixed(2)}€ onto that player's head. `
                      + (bountyMode === "progressive"
                        ? `Knock someone out and ${bountySplit}% of their bounty is cash in hand; the other ${100 - bountySplit}% is added to your own head.`
                        : "Every head is worth the same all tournament.")}
                </p>
              </>
            )}
          </div>

          <div className="space-y-2">
            {/* What a host actually decides. The split follows from it, and the
                grid below is for the rare night that wants a particular one. */}
            <label className="flex items-center justify-between text-sm gap-3">
              <span className="text-(--color-text-muted) text-xs">
                Places paid
                <span className="block opacity-70">share of the field</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  className="w-28"
                  value={paidPctOfField}
                  aria-label="Share of the field that gets paid"
                  disabled={customPayouts}
                  onChange={(e) => setPaidPctOfField(Number(e.target.value))}
                />
                <span className="w-24 text-right text-sm text-(--color-silver) tabular-nums">
                  {customPayouts
                    ? `${payouts.length} places`
                    : `${paidPctOfField}% · ${paidPlaces} place${paidPlaces === 1 ? "" : "s"}`}
                </span>
              </span>
            </label>

            {/* What that comes to, at a glance, without opening anything. */}
            {!customPayouts && (
              <p className="text-xs text-(--color-text-muted) leading-snug">
                {payouts.map((row) => `${row.label} ${row.percentage}%`).join(" · ")}
                {potCents > 0 && (
                  <span className="block mt-0.5">
                    {payouts.map((row) => (
                      `${row.label} ${(potCents * row.percentage / 10000).toFixed(2)}€`
                    )).join(" · ")}
                  </span>
                )}
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                // Opening the grid takes what is on screen with it, so nothing
                // a host has already set up changes under them.
                if (!customPayouts) setPayoutRows(payouts);
                setCustomPayouts((open) => !open);
              }}
              className="text-xs text-[#d9c07a] transition-colors"
            >
              {customPayouts ? "Back to a share of the field" : "Set the shares by hand"}
            </button>
          </div>

          <div className={`space-y-2 ${customPayouts ? "" : "hidden"}`}>
            <div className="grid grid-cols-[70px_1fr_90px_32px] gap-2 text-xs text-(--color-text-muted)">
              <span>Place</span>
              <span>Label</span>
              <span>{buyInCents > 0 ? "Percent / €" : stakeCoins > 0 ? "Percent / coins" : "Percent"}</span>
              <span></span>
            </div>
            {payoutRows.map((row, index) => (
              <div key={index} className="grid grid-cols-[70px_1fr_90px_32px] gap-2">
                <input
                  type="number"
                  min={1}
                  className="input-field px-2 py-1 rounded transition-colors disabled:opacity-50"
                  value={row.place}
                  onChange={(e) => updatePayoutRow(index, "place", e.target.value)}
                />
                <input
                  className="input-field px-2 py-1 rounded transition-colors disabled:opacity-50"
                  value={row.label}
                  onChange={(e) => updatePayoutRow(index, "label", e.target.value)}
                />
                <div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    className="input-field px-2 py-1 rounded w-full transition-colors disabled:opacity-50"
                    value={row.percentage}
                      onChange={(e) => updatePayoutRow(index, "percentage", e.target.value)}
                  />
                  {buyInCents > 0 && (
                    <span className="block text-[11px] text-(--color-text-muted) text-right pr-1">
                      {(potCents * Number(row.percentage || 0) / 10000).toFixed(2)}€
                    </span>
                  )}
                  {stakeCoins > 0 && (
                    <span className="block text-[11px] text-(--color-text-muted) text-right pr-1">
                      {formatCoins(Math.floor(stakeCoins * maxPlayers * Number(row.percentage || 0) / 100))}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="text-[#c76b7a] hover:text-[#e3cdd1] transition-colors disabled:opacity-30"
                  disabled={payoutRows.length <= 1}
                  onClick={() => removePayoutRow(index)}
                >
                  x
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button type="button" className="text-xs text-[#d9c07a] transition-colors" onClick={addPayoutRow}>
                + Add Payout
              </button>
              <span className={`text-xs ${Math.round(payoutTotal * 100) / 100 !== 100 ? "text-[#c76b7a]" : "text-(--color-text-muted)"}`}>
                Total {payoutTotal.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
        )}

        {!editing && (buyInCents > 0 || stakeCoins > 0) && (
          <p className="text-xs text-(--color-text-muted) leading-snug -mt-1">
            At {maxPlayers} players:
            {buyInCents > 0 && ` ${(potCents / 100).toFixed(2)}€ to the places`}
            {stakeCoins > 0 && ` ${formatCoins(stakeCoins * maxPlayers)} to the places`}
            {bountyOn && ` · ${(bountyCents * maxPlayers / 100).toFixed(2)}€ in `
              + `${bountyMode === "mystery" ? "the mystery pool" : "bounties"}`}
          </p>
        )}

        <div className="panel-raised rounded-lg p-3 space-y-3">
          <label className="flex items-center justify-between text-sm gap-3">
            <span className="text-(--color-silver)">Showdown pause (s)</span>
            <input
              type="number"
              min={2}
              max={60}
              className="input-field px-2 py-1 rounded w-28 text-right transition-colors"
              value={showdownSeconds}
              onChange={(e) => setShowdownSeconds(Number(e.target.value))}
            />
          </label>
          <p className="text-xs text-(--color-text-muted)">
            How long the table waits after each hand. This is also the window
            for showing your cards, so it is how long the others get to look.
          </p>

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

        {/* The builder needs both to size the blinds: a hundred big blinds to
            start, and enough at the end to finish a table of this many. */}
        <BlindStructureEditor
          levels={customLevels}
          onChange={setCustomLevels}
          startingChips={chips}
          players={maxPlayers}
        />
        </>
      )}

      {error && <p className="text-sm text-(--color-accent-link)">{error}</p>}

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary px-4 py-2 rounded transition-colors">Cancel</button>
        <button type="submit" className="btn-accent px-4 py-2 rounded font-semibold transition-colors">
          {editing ? "Save changes" : "Create"}
        </button>
      </div>
    </form>
  );
}

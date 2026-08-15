import { create } from "zustand";

const SHOW_BB_KEY = "poker.showBB";
const SOUND_KEY = "poker.turnSound";

const readStoredFlag = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return fallback;
  }
};

const writeStoredFlag = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Ignore — a missing/blocked localStorage just means the preference is
    // per-session rather than persisted.
  }
};


// The action log holds structured entries rather than flat strings, so the
// history panel can group by hand and street and name players instead of
// printing seat indices.
let logSequence = 0;
const LOG_LIMIT = 200;

const nameFor = (state, seat) =>
  state.players.find((p) => p.seat === seat)?.name ?? `Seat ${seat}`;

const entry = (state, kind, text, overrides = {}) => ({
  id: ++logSequence,
  hand: state.handNumber,
  street: state.street,
  kind,
  text,
  ...overrides,
});

const appendLog = (state, ...entries) => [...state.messages, ...entries].slice(-LOG_LIMIT);

// Un-freezing the table has to give back the time it spent frozen, whichever
// message carries the news — the explicit resume event, or a state snapshot
// arriving after a reconnect. Losing that would hand the actor a clock that had
// silently run down while nobody could act.
const resumeClock = (state) => {
  const frozenFor = state.pausedSince ? Date.now() - state.pausedSince : 0;
  const shift = (at) => (at && frozenFor ? at + frozenFor : at);
  return {
    pausedSince: null,
    actionStartedAt: shift(state.actionStartedAt),
    levelClockAt: shift(state.levelClockAt),
  };
};

// A level reading is only fresh when the server actually sent one; falling back
// to the level we already had must not restart its clock.
const withLevel = (next, current) =>
  (next ? { level: next, levelClockAt: Date.now() } : { level: current });

const useGameStore = create((set) => ({
  // Game state
  players: [],
  communityCards: [],
  pot: 0,
  street: null,
  handNumber: 0,
  holeCards: [],
  handStrength: null, // what you currently hold, e.g. "Pair of Aces"
  actionOnSeat: null,
  actionContext: null, // { seat, to_call, min_raise, max_raise, valid_actions, timer_sec }
  // When the current actor's clock started, and since when it has been frozen.
  // The clock has to be a property of the TABLE, not of whichever component
  // happens to be drawing it: a panel that collapses, expands or reconnects
  // mid-turn has to pick up the real remaining time, not start counting afresh.
  actionStartedAt: null,
  pausedSince: null,
  // Same idea for the blind level: `remaining_seconds` is a reading taken at a
  // moment, so the moment has to be kept with it. Otherwise anything that mounts
  // part way through a level — the info panel being reopened — counts down from
  // the top again.
  levelClockAt: null,
  dealerSeat: null,
  sbSeat: null,
  bbSeat: null,
  level: null,
  showdown: null,
  potAwards: null,
  rabbitCards: null,
  winnerSeats: [],   // seats that won the last pot (shown during inter-hand delay)
  allInEquity: null,  // [{seat, equity, cards}, ...] during all-in runout
  countdown: null,    // seconds remaining before tournament starts
  isPaused: false,
  standings: null, // final standings when tournament finishes
  lastElimination: null, // { seat, name, finish_position, reason }
  connectionStatus: "connecting", // connecting | open | reconnecting | failed
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  messages: [],    // action log
  currentTableNumber: null,
  currentTableId: null,
  tableCount: 0,
  tableSummaries: [],
  tableAssignmentNotice: null,
  showBB: readStoredFlag(SHOW_BB_KEY, false),   // display chips as BB count
  toggleBB: () => set((s) => {
    const showBB = !s.showBB;
    writeStoredFlag(SHOW_BB_KEY, showBB);
    return { showBB };
  }),
  soundEnabled: readStoredFlag(SOUND_KEY, true), // turn cue, on by default
  // What has been said at this table since the page opened. Nothing is stored
  // server-side, so this is the whole of it.
  chat: [],
  // Counts every message ever said, where `chat` is capped at the last hundred.
  // An unread badge has to count arrivals, and once the cap is reached the
  // array's length stops changing.
  chatSequence: 0,
  toggleSound: () => set((s) => {
    const soundEnabled = !s.soundEnabled;
    writeStoredFlag(SOUND_KEY, soundEnabled);
    return { soundEnabled };
  }),
  dismissTableAssignmentNotice: () => set({ tableAssignmentNotice: null }),

  // Incoming event handler
  handleEvent: (data) => {
    const type = data.type;

    switch (type) {
      case "game_state":
        set((s) => ({
          players: data.players || [],
          communityCards: data.community_cards || [],
          pot: data.pot || 0,
          street: data.street || null,
          handNumber: data.hand_number || 0,
          holeCards: data.hole_cards && data.hole_cards.length ? data.hole_cards : s.holeCards,
          currentTableNumber: data.current_table_number ?? s.currentTableNumber,
          currentTableId: data.current_table_id ?? s.currentTableId,
          tableCount: data.table_count ?? s.tableCount,
          tableSummaries: data.table_summaries || s.tableSummaries,
          isPaused: data.is_paused ?? s.isPaused,
          // Only a snapshot that actually carries the flag may touch the clock;
          // most of them don't mention it at all.
          ...(data.is_paused == null
            ? {}
            : data.is_paused
            ? { pausedSince: s.pausedSince ?? Date.now() }
            : resumeClock(s)),
          ...withLevel(data.level, s.level),
          // Restored on reconnect so the table reads correctly mid-hand.
          dealerSeat: data.dealer_seat ?? null,
          sbSeat: data.sb_seat ?? null,
          bbSeat: data.bb_seat ?? null,
          actionOnSeat: data.action_on_seat ?? null,
        }));
        break;

      case "tournament_started":
        set({
          ...withLevel(data.level, null),
          standings: null,
          lastElimination: null,
          isPaused: false,
          showdown: null,
          potAwards: null,
          messages: [],
          tableCount: data.table_count || 0,
          tableSummaries: data.tables || [],
        });
        break;

      case "countdown":
        set({ countdown: data.seconds ?? data.data?.seconds ?? null });
        break;

      case "hand_started":
        set({
          handNumber: data.hand_number,
          dealerSeat: data.dealer_seat ?? null,
          sbSeat: null,
          bbSeat: null,
          communityCards: [],
          pot: 0,
          street: "preflop",
          showdown: null,
          potAwards: null,
          rabbitCards: null,
          winnerSeats: [],
          allInEquity: null,
          countdown: null,
          holeCards: [],
          handStrength: null,
          actionOnSeat: null,
          actionContext: null,
          actionStartedAt: null,
        });
        // Reset per-hand player state
        set((s) => ({
          messages: appendLog(s, entry(s, "hand", `Hand #${data.hand_number}`, { street: "preflop" })),
          players: s.players.map((p) => ({
            ...p,
            is_folded: false,
            is_all_in: false,
            bet: 0,
            cards: null,
          })),
        }));
        break;

      case "hole_cards":
        set({ holeCards: data.cards || [] });
        break;

      case "hand_strength":
        set({ handStrength: data.text || null });
        break;

      case "blinds_posted":
        set((s) => ({
          sbSeat: data.sb.seat,
          bbSeat: data.bb.seat,
          players: s.players.map((p) => {
            if (p.seat === data.sb.seat) return { ...p, chips: data.sb.chips, bet: data.sb.bet };
            if (p.seat === data.bb.seat) return { ...p, chips: data.bb.chips, bet: data.bb.bet };
            return p;
          }),
          pot: data.pot ?? s.pot,
          messages: appendLog(s, entry(s, "blinds",
            `${nameFor(s, data.sb.seat)} posts SB ${data.sb.amount} · ${nameFor(s, data.bb.seat)} posts BB ${data.bb.amount}`,
            { street: "preflop" })),
        }));
        break;

      case "antes_posted": {
        const payload = data.data || data;
        const entries = payload.entries || [];
        const totalAnte = entries.reduce((sum, e) => sum + e.amount, 0);
        set((s) => ({
          players: s.players.map((p) => {
            const paid = entries.find((e) => e.seat === p.seat);
            return paid ? { ...p, chips: paid.chips } : p;
          }),
          pot: payload.pot ?? s.pot,
          messages: appendLog(s, entry(s, "blinds", `Antes posted (${totalAnte})`, { street: "preflop" })),
        }));
        break;
      }

      case "action_required":
        set((s) => ({
          actionOnSeat: data.seat,
          actionContext: data,
          actionStartedAt: Date.now(),
          // The server's pot is authoritative; prefer it over the locally
          // accumulated figure, which can drift mid-hand.
          pot: data.pot ?? s.pot,
        }));
        break;

      case "action_taken": {
        const verb = {
          fold: "folds", check: "checks", call: "calls",
          bet: "bets", raise: "raises to", blind: "posts", ante: "antes",
        }[data.action] || data.action;
        set((s) => ({
          actionOnSeat: null,
          actionContext: null,
          // The engine sends the resulting stack, street bet and all-in state,
          // so this applies them instead of re-deriving them and drifting.
          players: s.players.map((p) => {
            if (p.seat !== data.seat) return p;
            return {
              ...p,
              chips: data.chips ?? p.chips,
              bet: data.bet ?? p.bet,
              is_all_in: data.is_all_in ?? p.is_all_in,
              // Marking the fold here is what makes the mucked hand leave the
              // table: no game_state follows an action, so nothing else would.
              is_folded: data.action === "fold" ? true : p.is_folded,
            };
          }),
          pot: data.pot ?? s.pot,
          messages: appendLog(s, entry(s, "action",
            `${nameFor(s, data.seat)} ${verb}${data.amount ? ` ${data.amount.toLocaleString()}` : ""}`)),
        }));
        break;
      }

      case "uncalled_bet_returned":
        set((s) => ({
          players: s.players.map((p) => {
            if (p.seat !== data.seat) return p;
            const chips = data.chips ?? p.chips + data.amount;
            return {
              ...p,
              chips,
              bet: Math.max(0, (p.bet || 0) - data.amount),
              is_all_in: chips > 0 ? false : p.is_all_in,
            };
          }),
          pot: data.pot ?? Math.max(0, s.pot - data.amount),
          messages: appendLog(s, entry(s, "pot",
            `Uncalled bet ${data.amount?.toLocaleString()} returned to ${nameFor(s, data.seat)}`)),
        }));
        break;

      case "street_dealt":
        set((s) => ({
          street: data.street,
          communityCards: data.cards || [],
          pot: data.pot || 0,
          players: s.players.map((p) => ({ ...p, bet: 0 })),
          allInEquity: null,
          messages: appendLog(s, entry(s, "street", (data.cards || []).join(" "), { street: data.street })),
        }));
        break;

      case "all_in_equity": {
        const eqList = data.data || data;
        set((s) => ({
          allInEquity: eqList,
          players: s.players.map((p) => {
            const eq = Array.isArray(eqList) ? eqList.find((e) => e.seat === p.seat) : null;
            return eq ? { ...p, cards: eq.cards } : p;
          }),
        }));
        break;
      }

      case "showdown": {
        const sdList = data.data || data;
        set((s) => ({
          showdown: sdList,
          messages: appendLog(s, ...(Array.isArray(sdList) ? sdList : []).map((sd) =>
            entry(s, "showdown", `${nameFor(s, sd.seat)} shows ${sd.cards?.join(" ")} — ${sd.hand_name}`))),
          players: s.players.map((p) => {
            const sd = Array.isArray(sdList) ? sdList.find((e) => e.seat === p.seat) : null;
            return sd ? { ...p, cards: sd.cards } : p;
          }),
        }));
        break;
      }

      case "pot_awarded": {
        const awards = data.data || data;
        const seats = [...new Set(awards.map((a) => a.seat))];
        set((s) => ({
          potAwards: awards,
          winnerSeats: seats,
          messages: appendLog(s, ...awards.map((a) =>
            entry(s, "pot", `${nameFor(s, a.seat)} wins ${a.amount?.toLocaleString()} (${a.description})`))),
        }));
        break;
      }

      case "hand_complete":
        if (data.stacks) {
          set((s) => ({
            players: s.players.map((p) => {
              const updated = data.stacks.find((st) => st.seat === p.seat);
              return updated ? { ...p, chips: updated.chips, bet: 0 } : { ...p, bet: 0 };
            }),
          }));
        }
        break;

      case "rabbit_hunt":
        set((s) => ({
          rabbitCards: data.cards || [],
          messages: data.cards?.length
            ? appendLog(s, entry(s, "info", `Rabbit hunt: ${data.cards.join(" ")}`))
            : s.messages,
        }));
        break;

      case "player_eliminated":
        set((s) => ({
          lastElimination: {
            seat: data.seat,
            name: data.name,
            finish_position: data.finish_position,
            reason: data.reason || null,
          },
          players: s.players.map((p) =>
            p.seat === data.seat ? { ...p, is_eliminated: true } : p
          ),
          messages: appendLog(s, entry(s, "elim",
            data.reason === "offline_timeout"
              ? `${data.name} removed for being offline (${data.finish_position})`
              : `${data.name} eliminated in ${data.finish_position}`)),
        }));
        break;

      case "player_sitting_out":
        set((s) => ({
          players: s.players.map((p) =>
            p.seat === data.seat ? { ...p, is_sitting_out: data.sitting_out } : p
          ),
          messages: appendLog(s, entry(s, "info",
            `${data.name} ${data.sitting_out ? "is sitting out" : "is back"}`)),
        }));
        break;

      // Sent to everyone at a table after a rebalance, so a rebought or
      // newly moved player shows up without a reload.
      case "table_players":
        set((s) => {
          if (
            s.currentTableNumber != null &&
            data.table_number != null &&
            data.table_number !== s.currentTableNumber
          ) {
            return {};
          }
          const previous = new Map(s.players.map((p) => [p.name, p]));
          return {
            currentTableNumber: data.table_number ?? s.currentTableNumber,
            currentTableId: data.table_id ?? s.currentTableId,
            players: (data.players || []).map((p) => ({
              ...p,
              bet: 0,
              is_disconnected: previous.get(p.name)?.is_disconnected ?? false,
            })),
          };
        });
        break;

      case "player_rebuy":
        set((s) => ({
          lastElimination: null,
          messages: appendLog(s, entry(s, "info",
            `${data.name} rebought for ${data.chips?.toLocaleString()}`)),
        }));
        break;

      case "chat_message":
        set((s) => ({
          chatSequence: s.chatSequence + 1,
          chat: [...s.chat, {
            // The server does not number these, and two identical messages a
            // second apart still need distinct keys.
            id: `${data.user_id}-${s.chat.length}-${data.text.length}`,
            name: data.name,
            text: data.text,
          }].slice(-100),
        }));
        break;

      case "player_disconnected":
        set((s) => ({
          players: s.players.map((p) =>
            p.seat === data.seat ? { ...p, is_disconnected: true } : p
          ),
          messages: appendLog(s, entry(s, "info", `${data.name} disconnected`)),
        }));
        break;

      case "player_reconnected":
        set((s) => ({
          players: s.players.map((p) =>
            p.seat === data.seat ? { ...p, is_disconnected: false } : p
          ),
          messages: appendLog(s, entry(s, "info", `${data.name} reconnected`)),
        }));
        break;

      case "level_change":
        set((s) => ({
          ...withLevel(data, s.level),
          tableCount: data.table_count ?? s.tableCount,
          tableSummaries: data.tables || s.tableSummaries,
        }));
        break;

      case "tournament_paused":
        set((s) => ({
          isPaused: true,
          pausedSince: s.pausedSince ?? Date.now(),
          ...withLevel(data.level, s.level),
          messages: appendLog(s, entry(s, "info", "Tournament paused")),
        }));
        break;

      case "tournament_resumed":
        set((s) => ({
          isPaused: false,
          ...resumeClock(s),
          ...withLevel(data.level, s.level),
          messages: appendLog(s, entry(s, "info", "Tournament resumed")),
        }));
        break;

      case "table_assignment":
        set((s) => ({
          currentTableNumber: data.table_number ?? s.currentTableNumber,
          currentTableId: data.table_id ?? s.currentTableId,
          tableCount: data.table_count ?? s.tableCount,
          tableSummaries: data.table_summaries || s.tableSummaries,
          tableAssignmentNotice: {
            tableNumber: data.table_number,
            seat: data.seat,
            tableCount: data.table_count ?? s.tableCount,
          },
          messages: appendLog(s, entry(s, "info", `Moved to table ${data.table_number}, seat ${data.seat}`)),
        }));
        break;

      case "table_rebalanced":
        set((s) => ({
          tableCount: data.table_count ?? s.tableCount,
          tableSummaries: data.tables || s.tableSummaries,
        }));
        break;

      case "break_started":
        set((s) => ({
          ...withLevel(data, s.level),
          tableCount: data.table_count ?? s.tableCount,
          tableSummaries: data.tables || s.tableSummaries,
          messages: appendLog(s, entry(s, "info", `Break started (${data.duration_minutes} min)`)),
        }));
        break;

      case "break_tick":
        set((s) => ({
          ...withLevel(
            s.level ? { ...s.level, remaining_seconds: data.remaining_seconds } : null,
            s.level,
          ),
        }));
        break;

      case "tournament_complete":
        set({ standings: data.standings });
        break;

      case "error":
        console.error("[Game Error]", data.message);
        set((s) => ({
          messages: appendLog(s, entry(s, "error", data.message)),
        }));
        break;

      default:
        break;
    }
  },

  reset: () =>
    set({
      players: [], communityCards: [], pot: 0, street: null,
      handNumber: 0, holeCards: [], handStrength: null, actionOnSeat: null,
      dealerSeat: null, sbSeat: null, bbSeat: null,
      actionContext: null, actionStartedAt: null, pausedSince: null,
      level: null, levelClockAt: null, showdown: null,
      potAwards: null, rabbitCards: null, winnerSeats: [], allInEquity: null, countdown: null, isPaused: false,
      standings: null, lastElimination: null, messages: [], chat: [], chatSequence: 0,
      currentTableNumber: null, currentTableId: null, tableCount: 0, tableSummaries: [],
      tableAssignmentNotice: null,
    }),
}));

export default useGameStore;

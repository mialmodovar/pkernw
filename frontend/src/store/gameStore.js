import { create } from "zustand";

import { equityShake } from "../components/game/equitySwing";
import { formatEuros } from "../components/game/formatMoney";

const SHOW_BB_KEY = "poker.showBB";
const SOUND_KEY = "poker.turnSound";
const HIDE_HAND_KEY = "poker.hideHand";

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
  // The last card that changed the hand, for the table to shake on. Cleared by
  // whatever draws it, like the other one-shot animations.
  equityShake: null,
  equityShakeSequence: 0,
  clearEquityShake: (id) => set((s) => (s.equityShake?.id === id ? { equityShake: null } : {})),
  countdown: null,    // seconds remaining before tournament starts
  // Who is ready to start, and how many seats there are to be ready. The count
  // exists so the overlay can say 3/5 without having to work out which of the
  // players it can see are actually seated.
  readyUserIds: [],
  readyTotal: 0,
  // Between hands you may show what you had. The server decides whether a
  // reveal is allowed; this is only whether to offer it.
  showCardsOpen: false,
  // Which cards each seat chose to show, by seat. Held apart from the seat's
  // `cards` because the hero's two are always drawn from `holeCards`, so this
  // is the only way to tell which of them the rest of the table can see.
  shownCards: {},
  // When the river landed, so anything that should follow it rather than land
  // on top of it has something to count from.
  riverShownAt: null,
  // { userIds, endsAt } while the table waits for a busted player to rebuy.
  rebuyWindow: null,
  isPaused: false,
  standings: null, // final standings when tournament finishes
  lastElimination: null, // { seat, name, finish_position, reason }
  // The last bounty collected, for the seat to animate. Cleared by the seat
  // itself once the animation has run.
  bountyFlash: null,
  bountyFlashSequence: 0,
  // What somebody just said, over their seat: a GIF or a line of chat. Keyed by
  // user id — seats move between tables — and one bubble per player, so the
  // newest thing they said replaces the last rather than queueing behind it.
  seatBubbles: {},
  seatBubbleSequence: 0,
  // The knockout GIF playing in the middle of the table, if any.
  finisher: null,
  finisherSequence: 0,
  // Both are cleared by whatever is drawing them, once it has run its course.
  // The store holds no timers: a component that unmounts mid-animation would
  // leave one running with nothing to update.
  clearSeatBubble: (userId, id) => set((s) => {
    const current = s.seatBubbles[userId];
    if (!current || current.id !== id) return {};   // already replaced by a newer one
    const next = { ...s.seatBubbles };
    delete next[userId];
    return { seatBubbles: next };
  }),
  clearFinisher: (id) => set((s) => (s.finisher?.id === id ? { finisher: null } : {})),
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
  // Keep your own cards face down until you look at them. Off by default —
  // most people play alone in a room — and remembered per browser, because it
  // is a fact about where you are sitting rather than about your account.
  hideHand: readStoredFlag(HIDE_HAND_KEY, false),
  toggleHideHand: () => set((s) => {
    const hideHand = !s.hideHand;
    writeStoredFlag(HIDE_HAND_KEY, hideHand);
    return { hideHand };
  }),
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
          readyUserIds: data.ready_user_ids || s.readyUserIds,
          readyTotal: data.ready_total ?? s.readyTotal,
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

      // Who has said they are ready during the pre-tournament countdown.
      case "ready_state":
        set({
          readyUserIds: data.ready_user_ids || [],
          readyTotal: data.total || 0,
        });
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
          showCardsOpen: false,
          shownCards: {},
          riverShownAt: null,
          // The wait is over either way: the next hand is being dealt.
          rebuyWindow: null,
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
            // Clearing this is also what makes the show-cards button come back
            // next hand: a seat with cards on it is one everybody can see, and
            // that is the whole test for whether there is anything left to show.
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
          ...(data.street === "river" ? { riverShownAt: Date.now() } : {}),
          players: s.players.map((p) => ({ ...p, bet: 0 })),
          // Deliberately not cleared. During an all-in runout the next set of
          // equities arrives moments later, and blanking them in between made
          // the numbers flicker street to street — and vanish altogether on the
          // river, where they are most worth reading. The deal clears them.
          messages: appendLog(s, entry(s, "street", (data.cards || []).join(" "), { street: data.street })),
        }));
        break;

      case "all_in_equity": {
        const eqList = data.data || data;
        set((s) => {
          // Each reading is the odds after a card landed, so measuring it
          // against the one before says what that card did. A card that
          // changes the hand shakes the table; most cards do not.
          const shake = equityShake(s.allInEquity, eqList);
          return {
            allInEquity: eqList,
            ...(shake
              ? { equityShake: { intensity: shake, id: s.equityShakeSequence + 1 },
                  equityShakeSequence: s.equityShakeSequence + 1 }
              : {}),
            players: s.players.map((p) => {
              const eq = Array.isArray(eqList) ? eqList.find((e) => e.seat === p.seat) : null;
              return eq ? { ...p, cards: eq.cards } : p;
            }),
          };
        });
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
        set((s) => ({
          // The window in which cards can be shown. It closes when the next
          // hand starts, which is the server's rule too — this only decides
          // whether the button is on screen.
          showCardsOpen: true,
          players: data.stacks
            ? s.players.map((p) => {
                const updated = data.stacks.find((st) => st.seat === p.seat);
                return updated ? { ...p, chips: updated.chips, bet: 0 } : { ...p, bet: 0 };
              })
            : s.players,
        }));
        break;

      // Somebody chose to show. Their cards go onto their seat the same way a
      // showdown's do, so nothing else has to know the difference.
      case "cards_shown":
        set((s) => ({
          players: s.players.map((p) =>
            (p.seat === data.seat ? { ...p, cards: data.cards } : p)
          ),
          shownCards: { ...s.shownCards, [data.seat]: data.cards || [] },
          messages: appendLog(s, entry(s, "showdown",
            `${data.name} shows ${(data.cards || []).join(" ")}`)),
        }));
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

      // A bounty changing hands. The seat's own numbers come with it, so the
      // table updates without waiting for the next roster broadcast, and
      // `bountyFlash` is what the seat animates on.
      case "bounty_won":
        set((s) => ({
          players: s.players.map((p) =>
            p.seat === data.seat
              ? {
                  ...p,
                  bounty_cents: data.bounty_cents,
                  bounty_won_cents: data.bounty_won_cents,
                  knockouts: data.knockouts,
                }
              : p
          ),
          bountyFlash: {
            seat: data.seat,
            cashCents: data.cash_cents,
            toHeadCents: data.to_head_cents,
            victimName: data.victim_name,
            // Two knockouts in a row on the same seat are the same object by
            // value, so the animation needs something that always changes.
            id: s.bountyFlashSequence + 1,
          },
          bountyFlashSequence: s.bountyFlashSequence + 1,
          messages: appendLog(s, entry(s, "info",
            `${data.name} took ${formatEuros(data.cash_cents + data.to_head_cents)} off ${data.victim_name}`
            + (data.split_ways > 1 ? ` (split ${data.split_ways} ways)` : ""))),
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

      case "chat_message": {
        // A GIF or a line, whichever it was — and nothing at all for a message
        // that is somehow neither.
        const said = data.gif_id
          ? { gifId: data.gif_id }
          : data.text ? { text: data.text } : null;
        set((s) => ({
          chatSequence: s.chatSequence + 1,
          chat: [...s.chat, {
            // The server does not number these, and two identical messages a
            // second apart still need distinct keys.
            id: `${data.user_id}-${s.chat.length}-${(data.text || "").length}`,
            // Who said it, not just what they are called: the panel sides your
            // own lines to the right, and two players can share a display name
            // the moment somebody renames themselves.
            userId: data.user_id,
            name: data.name,
            text: data.text,
            gifId: data.gif_id || null,
          }].slice(-100),
          // Anything said is said to the table, not just to a panel that may
          // be folded away: it goes up over the seat it came from as well.
          // Keyed by user rather than seat, since seats move between tables.
          seatBubbles: said
            ? { ...s.seatBubbles, [data.user_id]: { ...said, id: s.seatBubbleSequence + 1 } }
            : s.seatBubbles,
          seatBubbleSequence: s.seatBubbleSequence + (said ? 1 : 0),
        }));
        break;
      }

      // The table is holding for whoever just busted to decide. Stored with
      // the moment it ends rather than a count, so a component that mounts
      // part way through it picks up the real time left.
      case "rebuy_window":
        set({
          rebuyWindow: {
            userIds: data.user_ids || [],
            endsAt: Date.now() + (data.seconds || 0) * 1000,
          },
        });
        break;

      // Somebody knocked somebody out. Carries the eliminator's chosen GIF,
      // which the table plays in the middle — see FinisherOverlay.
      case "player_knockout":
        set((s) => {
          // A split pot has two people knocking one out, and both of them own
          // the moment. Only those who chose a finisher appear; if nobody did,
          // there is nothing to play.
          const playing = (data.eliminators || [])
            .filter((one) => one.finisher_gif_id)
            .map((one) => ({ gifId: one.finisher_gif_id, name: one.name }));
          if (!playing.length) return {};
          return {
            finisher: {
              players: playing,
              victimName: data.victim_name,
              id: s.finisherSequence + 1,
            },
            finisherSequence: s.finisherSequence + 1,
          };
        });
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
      bountyFlash: null, seatBubbles: {}, finisher: null, equityShake: null,
      readyUserIds: [], readyTotal: 0, showCardsOpen: false, rebuyWindow: null,
      shownCards: {}, riverShownAt: null,
    }),
}));

export default useGameStore;

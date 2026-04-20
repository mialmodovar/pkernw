import { create } from "zustand";

const useGameStore = create((set, get) => ({
  // Game state
  players: [],
  communityCards: [],
  pot: 0,
  street: null,
  handNumber: 0,
  holeCards: [],
  actionOnSeat: null,
  actionContext: null, // { seat, to_call, min_raise, max_raise, valid_actions, timer_sec }
  level: null,
  showdown: null,
  potAwards: null,
  winnerSeats: [],   // seats that won the last pot (shown during inter-hand delay)
  allInEquity: null,  // [{seat, equity, cards}, ...] during all-in runout
  countdown: null,    // seconds remaining before tournament starts
  standings: null, // final standings when tournament finishes
  messages: [],    // action log
  showBB: false,   // display chips as BB count
  toggleBB: () => set((s) => ({ showBB: !s.showBB })),

  // Incoming event handler
  handleEvent: (data) => {
    const type = data.type;
    const state = get();

    switch (type) {
      case "game_state":
        set((s) => ({
          players: data.players || [],
          communityCards: data.community_cards || [],
          pot: data.pot || 0,
          street: data.street || null,
          handNumber: data.hand_number || 0,
          holeCards: data.hole_cards && data.hole_cards.length ? data.hole_cards : s.holeCards,
        }));
        break;

      case "tournament_started":
        set({
          players: data.players || [],
          level: data.level || null,
          standings: null,
          showdown: null,
          potAwards: null,
          messages: [],
        });
        break;

      case "countdown":
        set({ countdown: data.seconds ?? data.data?.seconds ?? null });
        break;

      case "hand_started":
        set({
          handNumber: data.hand_number,
          communityCards: [],
          pot: 0,
          street: "preflop",
          showdown: null,
          potAwards: null,
          winnerSeats: [],
          allInEquity: null,
          countdown: null,
          holeCards: [],
          actionOnSeat: null,
          actionContext: null,
        });
        // Reset per-hand player state
        set((s) => ({
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

      case "blinds_posted":
        set((s) => ({
          players: s.players.map((p) => {
            if (p.seat === data.sb.seat) return { ...p, chips: p.chips - data.sb.amount, bet: (p.bet || 0) + data.sb.amount };
            if (p.seat === data.bb.seat) return { ...p, chips: p.chips - data.bb.amount, bet: (p.bet || 0) + data.bb.amount };
            return p;
          }),
          messages: [...s.messages, `Blinds: SB ${data.sb.amount}, BB ${data.bb.amount}`],
        }));
        break;

      case "antes_posted": {
        const entries = data.data || [];
        const totalAnte = entries.reduce((sum, e) => sum + e.amount, 0);
        set((s) => ({
          players: s.players.map((p) => {
            const entry = entries.find((e) => e.seat === p.seat);
            return entry ? { ...p, chips: p.chips - entry.amount } : p;
          }),
          pot: s.pot + totalAnte,
          messages: [...s.messages, `Antes posted`],
        }));
        break;
      }

      case "action_required":
        set({
          actionOnSeat: data.seat,
          actionContext: data,
        });
        break;

      case "action_taken": {
        const label = `Seat ${data.seat}: ${data.action}${data.amount ? " " + data.amount : ""}`;
        set((s) => ({
          actionOnSeat: null,
          actionContext: null,
          players: s.players.map((p) => {
            if (p.seat !== data.seat) return p;
            const act = data.action;
            if (act === "fold" || act === "check") return p;
            if (act === "bet" || act === "raise") {
              const oldBet = p.bet || 0;
              const cost = data.amount - oldBet;
              return { ...p, chips: p.chips - cost, bet: data.amount };
            }
            if (act === "call") {
              return { ...p, chips: p.chips - data.amount, bet: (p.bet || 0) + data.amount };
            }
            return p;
          }),
          messages: [...s.messages.slice(-30), label],
        }));
        break;
      }

      case "street_dealt":
        set((s) => ({
          street: data.street,
          communityCards: data.cards || [],
          pot: data.pot || 0,
          players: s.players.map((p) => ({ ...p, bet: 0 })),
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
        set({ potAwards: awards, winnerSeats: seats });
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

      case "player_eliminated":
        set((s) => ({
          players: s.players.map((p) =>
            p.seat === data.seat ? { ...p, is_eliminated: true } : p
          ),
          messages: [...s.messages.slice(-30), `${data.name} eliminated (${data.finish_position})`],
        }));
        break;

      case "player_disconnected":
        set((s) => ({
          players: s.players.map((p) =>
            p.seat === data.seat ? { ...p, is_disconnected: true } : p
          ),
          messages: [...s.messages.slice(-30), `${data.name} disconnected`],
        }));
        break;

      case "player_reconnected":
        set((s) => ({
          players: s.players.map((p) =>
            p.seat === data.seat ? { ...p, is_disconnected: false } : p
          ),
          messages: [...s.messages.slice(-30), `${data.name} reconnected`],
        }));
        break;

      case "level_change":
        set({ level: data });
        break;

      case "tournament_complete":
        set({ standings: data.standings });
        break;

      case "error":
        console.error("[Game Error]", data.message);
        set((s) => ({
          messages: [...s.messages.slice(-30), `Error: ${data.message}`],
        }));
        break;

      default:
        break;
    }
  },

  reset: () =>
    set({
      players: [], communityCards: [], pot: 0, street: null,
      handNumber: 0, holeCards: [], actionOnSeat: null,
      actionContext: null, level: null, showdown: null,
      potAwards: null, winnerSeats: [], allInEquity: null, countdown: null, standings: null, messages: [],
    }),
}));

export default useGameStore;

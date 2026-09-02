import { create } from "zustand";

import api from "../api/http";
import { COINS } from "../api/paths";
import useWalletStore from "./walletStore";

/**
 * The shared blackjack table: eight seats, one dealer, everybody at once.
 *
 * Polled rather than pushed. This app's websockets are per-tournament and
 * per-cash-table, each with a consumer and a group and a reconnect story behind
 * it, and a table whose whole state is a phase, a clock and eight small rows is
 * not worth another one. A request a second while the screen is open is less
 * machinery than a socket and fails in a way that fixes itself.
 *
 * The clock is the reason for the pace. A betting window is twelve seconds and
 * the countdown has to move, so the alternative to polling here is a client that
 * counts down locally and is quietly wrong about when the round started.
 *
 * Nothing here decides anything: not whose turn it is, not what a hand is worth,
 * not whether a seat may be taken. It asks and it draws the answer. The server
 * advances the phase on every request it receives (there is no background
 * worker), which means the poll is also what keeps the table moving.
 */
const TABLE = `${COINS}/blackjack/table`;

// How often to ask while the table is on screen. A second is what the countdown
// needs to look like a countdown; slower and it stutters, faster and it is
// asking for nothing.
export const POLL_MS = 1000;

const useBlackjackTableStore = create((set, get) => ({
  table: null,
  loading: false,
  error: "",
  // Which request is in flight, by name, so the pressed button can say so
  // without the whole row going dead.
  busy: null,
  // The round the last settlement was seen for, so the table can play its
  // sounds and run its payout once per round rather than once per poll.
  settledRound: 0,

  apply: (data) => {
    if (data?.balance != null) useWalletStore.getState().setBalance(data.balance);
    const table = data?.table ?? null;
    set({ table });
    return table;
  },

  fetch: async ({ silent = true } = {}) => {
    if (!silent) set({ loading: true });
    try {
      const { data } = await api.get(`${TABLE}/`);
      get().apply(data);
    } catch {
      // A poll that fails is not worth an error over a table that is otherwise
      // on screen and readable; the next one is a second away. A failure that
      // matters — a bet refused, a seat taken — comes back through the action
      // that caused it, where there is somebody waiting for an answer.
    } finally {
      if (!silent) set({ loading: false });
    }
  },

  /** Note that this round's settlement has been seen, so the sounds and the
   *  payout animation happen once rather than on every poll of the same
   *  six-second window. */
  markSettled: (round) => set({ settledRound: round }),

  post: async (path, body, name) => {
    set({ busy: name, error: "" });
    try {
      const { data } = await api.post(`${TABLE}/${path}/`, body);
      return get().apply(data);
    } catch (e) {
      // A refusal still carries the table — the usual reason for one is that
      // the table has moved on — so it is applied rather than dropped, and the
      // player sees what is actually true alongside why they were refused.
      if (e.response?.data?.table !== undefined) get().apply(e.response.data);
      set({ error: e.response?.data?.error || "That did not work" });
      return null;
    } finally {
      set({ busy: null });
    }
  },

  sit: (seat) => get().post("sit", { seat }, `sit:${seat}`),
  leave: () => get().post("leave", {}, "leave"),
  bet: (amount) => get().post("bet", { amount }, "bet"),
  act: (action) => get().post("act", { action }, action),

  /** Choose a move for a turn that has not arrived. "" cancels the choice. */
  plan: (action) => get().post("plan", { action }, `plan:${action || "none"}`),

  clearError: () => set({ error: "" }),
}));

export default useBlackjackTableStore;

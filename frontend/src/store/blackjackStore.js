import { create } from "zustand";

import api from "../api/http";
import { COINS } from "../api/paths";
import useWalletStore from "./walletStore";

/**
 * One hand of blackjack, wherever it is being looked at.
 *
 * A store rather than state inside the table, because the same round is opened
 * from two places: the Casino tab in the lobby, and the panel that appears at a
 * poker table once you have folded. They are not two games — the round lives on
 * the server, so a hand dealt in one is the hand waiting in the other — and two
 * copies of it in the client is how they would come to disagree about whose
 * turn it is.
 *
 * Every reply carries the wallet balance, and it is pushed into walletStore
 * rather than kept here, for the same reason the fast-game store does it: the
 * coin figure in the header and the coins under the chips are one number, and
 * reading it in two places is how they drift apart.
 *
 * The server is the authority on everything about the hand. Nothing here works
 * out a total, decides what is legal, or settles anything — it asks, and it
 * draws what comes back. A client that formed its own opinion about a hand
 * somebody has coins on would be a client that can be argued with.
 */
const BLACKJACK = `${COINS}/blackjack`;

const useBlackjackStore = create((set, get) => ({
  round: null,
  // The last ten finished hands, newest first, as the strip under the table
  // draws them. Carried on every reply — see the views — so it is never stale
  // and never costs a request of its own.
  history: [],
  // Which action is in flight, as its name, so the button that was pressed can
  // say so while the others simply go quiet. A single boolean would grey out
  // the whole row and lose which one is happening.
  busy: null,
  loading: false,
  error: "",
  // Bumped every time a round settles. The table watches it to know when to
  // play the sound and run the payout animation — the round object alone
  // cannot say that, because a settled round that is still on screen is
  // indistinguishable from one that has just settled.
  settledAt: 0,

  apply: (data) => {
    if (data?.balance != null) useWalletStore.getState().setBalance(data.balance);
    const before = get().round;
    const round = data?.round ?? null;
    const justSettled = round?.status === "finished"
      && (before?.status !== "finished" || before?.id !== round.id);
    set({
      round,
      error: "",
      ...(data?.history ? { history: data.history } : {}),
      ...(justSettled ? { settledAt: get().settledAt + 1 } : {}),
    });
    return round;
  },

  /** The unfinished round, if you walked away from one. Called on arrival at
   *  both places this game is played, which is the whole point of it being on
   *  the server: closing the tab mid-hand is not a way to escape a bad one. */
  resume: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get(`${BLACKJACK}/round/`);
      get().apply(data);
    } catch {
      // Nothing to say. An unfinished hand that will not load is not worth an
      // error over an empty table; pressing Deal asks again.
    } finally {
      set({ loading: false });
    }
  },

  deal: async (stake) => {
    set({ busy: "deal", error: "" });
    try {
      const { data } = await api.post(`${BLACKJACK}/deal/`, { stake });
      return get().apply(data);
    } catch (e) {
      set({ error: e.response?.data?.error || "Could not deal" });
      return null;
    } finally {
      set({ busy: null });
    }
  },

  /** Hit, stand, double or split — all the same request with a different name
   *  on the end, and all answered with the whole round. */
  act: async (action) => {
    set({ busy: action, error: "" });
    try {
      const { data } = await api.post(`${BLACKJACK}/${action}/`);
      return get().apply(data);
    } catch (e) {
      set({ error: e.response?.data?.error || "That is not a move here" });
      // The round may have moved on under us — another tab, or a request that
      // landed twice — so what the server thinks is true is worth re-reading
      // rather than leaving a stale hand on screen with dead buttons.
      get().resume();
      return null;
    } finally {
      set({ busy: null });
    }
  },

  /** Clear the felt for the next bet. The round is finished and settled on the
   *  server; this only stops it being drawn. */
  clear: () => set({ round: null, error: "" }),
}));

export default useBlackjackStore;

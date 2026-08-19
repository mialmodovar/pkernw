import { create } from "zustand";

import api from "../api/http";
import useWalletStore from "./walletStore";

/**
 * Spin n Go: the tiers, your seat in one, and the coins it cost.
 *
 * A tier is not a tournament you browse. There is nothing to read on it and
 * nobody hosting it — you sit, and when the third player sits the game fires.
 * So this store holds two things: what each tier currently has waiting in it,
 * and where your own seat is, which is what the lobby watches to know when to
 * take you to the table.
 *
 * Every reply carries the wallet balance, and it is pushed into walletStore
 * rather than kept here: the coin chip in the sidebar and the stake on the tier
 * card are the same number, and reading it in two places is how they disagree.
 */
const useSpinGoStore = create((set, get) => ({
  tiers: [],
  myGame: null,
  // Your own finished games, newest first, and the biggest draws anybody has
  // had. Both arrive on the same poll as the tiers — one screen, one request.
  history: [],
  top: [],
  loading: false,
  error: "",
  // Which stake is mid-request, so only that card's button goes quiet.
  sitting: null,

  apply: (data) => {
    if (data.balance != null) useWalletStore.getState().setBalance(data.balance);
    set({
      ...(data.tiers ? { tiers: data.tiers } : {}),
      ...("my_game" in data ? { myGame: data.my_game } : {}),
      ...(data.history ? { history: data.history } : {}),
      ...(data.top ? { top: data.top } : {}),
    });
  },

  fetchTiers: async ({ silent = false } = {}) => {
    if (!silent) set({ loading: true });
    try {
      const { data } = await api.get("/tournaments/spingo/");
      get().apply(data);
    } catch {
      // A tier list that will not load is not worth an error over the lobby;
      // the next tick recovers, exactly as the tournament list does.
    } finally {
      if (!silent) set({ loading: false });
    }
  },

  sit: async (stake) => {
    set({ error: "", sitting: stake });
    try {
      const { data } = await api.post("/tournaments/spingo/sit/", { stake });
      get().apply({ ...data, my_game: data.game });
      // The tier counts moved for everybody, not just for us.
      await get().fetchTiers({ silent: true });
      return data.game;
    } catch (error) {
      set({ error: error.response?.data?.error || "That seat did not go through." });
      await get().fetchTiers({ silent: true });
      return null;
    } finally {
      set({ sitting: null });
    }
  },

  leave: async () => {
    set({ error: "" });
    try {
      const { data } = await api.post("/tournaments/spingo/leave/");
      get().apply({ ...data, my_game: null });
    } catch (error) {
      set({ error: error.response?.data?.error || "Could not leave that table." });
    }
    await get().fetchTiers({ silent: true });
  },
}));

export default useSpinGoStore;

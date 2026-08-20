import { create } from "zustand";

import api from "../api/http";
import useWalletStore from "./walletStore";

/**
 * The games you sit down at: the formats, your seat in one, and the coins it
 * cost.
 *
 * One store and one request for all of them, because they are one lobby read
 * from three tabs — and because a queue you are sitting in fills up whether or
 * not its tab is the one on screen. Splitting this per format would mean three
 * polls to answer one question.
 *
 * Every reply carries the wallet balance, and it is pushed into walletStore
 * rather than kept here: the coin chip in the sidebar and the stake on a tier
 * card are the same number, and reading it in two places is how they disagree.
 */
const useFastGameStore = create((set, get) => ({
  formats: [],
  myGame: null,
  // Your own finished games, newest first, and the biggest draws anybody has
  // had. Both arrive on the same poll as the tiers.
  history: [],
  top: [],
  loading: false,
  error: "",
  // Which tier is mid-request, as "key:stake", so only that card goes quiet.
  sitting: null,

  apply: (data) => {
    if (data.balance != null) useWalletStore.getState().setBalance(data.balance);
    set({
      ...(data.formats ? { formats: data.formats } : {}),
      ...("my_game" in data ? { myGame: data.my_game } : {}),
      ...(data.history ? { history: data.history } : {}),
      ...(data.top ? { top: data.top } : {}),
    });
  },

  fetchLobby: async ({ silent = false } = {}) => {
    if (!silent) set({ loading: true });
    try {
      const { data } = await api.get("/tournaments/fast/");
      get().apply(data);
    } catch {
      // A tier list that will not load is not worth an error over the lobby;
      // the next tick recovers, exactly as the tournament list does.
    } finally {
      if (!silent) set({ loading: false });
    }
  },

  sit: async (key, stake) => {
    set({ error: "", sitting: `${key}:${stake}` });
    try {
      const { data } = await api.post("/tournaments/fast/sit/", { key, stake });
      get().apply({ ...data, my_game: data.game });
      // The tier counts moved for everybody, not just for us.
      await get().fetchLobby({ silent: true });
      return data.game;
    } catch (error) {
      set({ error: error.response?.data?.error || "That seat did not go through." });
      await get().fetchLobby({ silent: true });
      return null;
    } finally {
      set({ sitting: null });
    }
  },

  leave: async () => {
    set({ error: "" });
    try {
      const { data } = await api.post("/tournaments/fast/leave/");
      get().apply({ ...data, my_game: null });
    } catch (error) {
      set({ error: error.response?.data?.error || "Could not leave that table." });
    }
    await get().fetchLobby({ silent: true });
  },
}));

export default useFastGameStore;

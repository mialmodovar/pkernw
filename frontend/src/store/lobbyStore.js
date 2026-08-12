import { create } from "zustand";
import api from "../api/http";

const useLobbyStore = create((set, get) => ({
  upcoming: [],
  mineActive: [],
  past: [],
  loading: false,

  // Background refreshes pass silent so the lists are not replaced by the
  // loading placeholder on every tick.
  fetchLobbyData: async ({ silent = false } = {}) => {
    if (!silent) set({ loading: true });
    try {
      const [upcoming, mineActive, past] = await Promise.all([
        api.get("/tournaments/", { params: { scope: "upcoming" } }),
        api.get("/tournaments/", { params: { scope: "mine_active" } }),
        api.get("/tournaments/", { params: { scope: "past" } }),
      ]);
      set({
        upcoming: upcoming.data,
        mineActive: mineActive.data,
        past: past.data,
      });
    } finally {
      if (!silent) set({ loading: false });
    }
  },

  createTournament: async (payload) => {
    const { data } = await api.post("/tournaments/", payload);
    await get().fetchLobbyData();
    return data;
  },

  joinTournament: async (id) => {
    const { data } = await api.post(`/tournaments/${id}/join/`);
    await get().fetchLobbyData();
    return data;
  },

  quitTournament: async (id) => {
    const { data } = await api.post(`/tournaments/${id}/quit/`);
    await get().fetchLobbyData();
    return data;
  },

  startTournament: async (id) => {
    const { data } = await api.post(`/tournaments/${id}/start/`);
    await get().fetchLobbyData();
    return data;
  },
}));

export default useLobbyStore;

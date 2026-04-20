import { create } from "zustand";
import api from "../api/http";

const useLobbyStore = create((set) => ({
  tournaments: [],
  loading: false,

  fetchTournaments: async () => {
    set({ loading: true });
    const { data } = await api.get("/tournaments/");
    set({ tournaments: data, loading: false });
  },

  createTournament: async (payload) => {
    const { data } = await api.post("/tournaments/", payload);
    return data;
  },

  joinTournament: async (id) => {
    const { data } = await api.post(`/tournaments/${id}/join/`);
    return data;
  },

  startTournament: async (id) => {
    const { data } = await api.post(`/tournaments/${id}/start/`);
    return data;
  },
}));

export default useLobbyStore;

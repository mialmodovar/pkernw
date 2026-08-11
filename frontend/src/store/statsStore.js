import { create } from "zustand";
import api from "../api/http";

const useStatsStore = create((set) => ({
  stats: null,
  loading: false,

  fetchStats: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get("/auth/me/stats/");
      set({ stats: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));

export default useStatsStore;

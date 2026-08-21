import { create } from "zustand";
import api from "../api/http";

/**
 * Your record, for one kind of game at a time.
 *
 * A Spin n Go and somebody's Friday night are different games — three-handed
 * for five minutes against nine-handed for an evening — and a VPIP averaged
 * across both describes neither. The scope is held here rather than in the
 * panel so it survives the panel being redrawn.
 */
const useStatsStore = create((set, get) => ({
  stats: null,
  scope: "all",
  loading: false,

  fetchStats: async (scope = get().scope) => {
    set({ loading: true, scope });
    try {
      const { data } = await api.get("/auth/me/stats/", { params: { game: scope } });
      // Ignore an answer about a scope nobody is looking at any more: two
      // clicks in a row must not leave the slower reply on screen.
      if (get().scope === scope) set({ stats: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));

export default useStatsStore;

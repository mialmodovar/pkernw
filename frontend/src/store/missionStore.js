import { create } from "zustand";

import api from "../api/http";
import useWalletStore from "./walletStore";

/**
 * What is worth doing today and this week.
 *
 * The board is entirely the server's: progress is read back out of the games
 * actually played, and whether a mission has been paid is a row rather than a
 * flag. So there is nothing to keep in step here — this fetches, and it
 * replaces what it holds with whatever came back.
 *
 * Claiming hands back the board and the wallet in the same reply, which is why
 * neither has to be re-fetched afterwards: the coins land on the header at the
 * same moment the mission goes quiet.
 */
const useMissionStore = create((set, get) => ({
  missions: [],
  loading: false,
  error: "",
  // Which one is mid-claim, so only that row goes quiet rather than the panel.
  claiming: null,

  fetchMissions: async ({ silent = false } = {}) => {
    if (!silent) set({ loading: true });
    try {
      const { data } = await api.get("/sidegames/missions/");
      set({ missions: data.missions || [] });
    } catch {
      // A board that will not load is not worth an error over the lobby. The
      // next visit fetches it again, and nothing was owed in the meantime.
    } finally {
      if (!silent) set({ loading: false });
    }
  },

  claim: async (key) => {
    if (get().claiming) return 0;
    set({ claiming: key, error: "" });
    try {
      const { data } = await api.post("/sidegames/missions/claim/", { key });
      set({ missions: data.missions || get().missions });
      // The same reply carries the new balance, so the coin chip moves with
      // the button rather than at the next poll.
      useWalletStore.getState().setBalance(data.balance);
      return data.coins || 0;
    } catch (error) {
      set({ error: error.response?.data?.error || "Could not collect that one." });
      // Whatever went wrong, the server's board is the truth about it — most
      // likely this was claimed already, on another tab.
      await get().fetchMissions({ silent: true });
      return 0;
    } finally {
      set({ claiming: null });
    }
  },
}));

export default useMissionStore;

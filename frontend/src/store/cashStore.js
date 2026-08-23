import { create } from "zustand";

import api from "../api/http";
import { CASH } from "../api/paths";
import useWalletStore from "./walletStore";

/**
 * The cash lobby: which tables are running, and which seat is yours.
 *
 * Everything here is the server's answer, kept only long enough to draw it. A
 * cash table is the one place in this app where what the client believes about
 * a number and what the server believes about it are coins, so nothing is
 * calculated here — the buy-in limits, the stacks and the balance all arrive
 * from the same reply that changed them.
 */
const useCashStore = create((set, get) => ({
  stakes: [],
  tables: [],
  // A club's own tables, kept apart from the public lobby's: the club page and
  // the lobby ask different questions and must not answer each other's.
  clubTables: [],
  seatChoices: [],
  loading: false,
  error: "",
  busy: null,

  fetchLobby: async ({ silent = false, club = null } = {}) => {
    if (!silent) set({ loading: true });
    try {
      const { data } = await api.get(`${CASH}/`, { params: club ? { club } : {} });
      set({
        stakes: data.stakes || [],
        tables: data.tables || [],
        seatChoices: data.seat_choices || [],
      });
      if (data.balance != null) useWalletStore.getState().setBalance(data.balance);
    } catch {
      // A list that will not load is not worth an error over the lobby; the
      // next visit fetches it again and nothing was at stake in the meantime.
    } finally {
      if (!silent) set({ loading: false });
    }
  },

  /** The tables one club has open, for the club's own page. */
  fetchClubTables: async (slug) => {
    if (!slug) return;
    try {
      const { data } = await api.get(`${CASH}/`, { params: { club: slug } });
      set({
        clubTables: data.tables || [],
        stakes: data.stakes || [],
        seatChoices: data.seat_choices || [],
      });
      if (data.balance != null) useWalletStore.getState().setBalance(data.balance);
    } catch {
      // Same as the lobby: a list that will not load is not worth an error
      // over the page it is one section of.
    }
  },

  /** Sit down. Returns the table id on success, so the caller can walk there. */
  sit: async (tableId, buyIn, seat = null) => {
    set({ error: "", busy: tableId });
    try {
      const { data } = await api.post(`${CASH}/${tableId}/sit/`, { buy_in: buyIn, seat });
      useWalletStore.getState().setBalance(data.balance);
      await get().fetchLobby({ silent: true });
      return tableId;
    } catch (error) {
      set({ error: error.response?.data?.error || "That seat did not go through." });
      await get().fetchLobby({ silent: true });
      return null;
    } finally {
      set({ busy: null });
    }
  },

  /** Leave. At a table mid-hand this asks; the room pays out when it ends. */
  leave: async (tableId) => {
    set({ error: "" });
    try {
      const { data } = await api.post(`${CASH}/${tableId}/leave/`);
      useWalletStore.getState().setBalance(data.balance);
      await get().fetchLobby({ silent: true });
      return data;
    } catch (error) {
      set({ error: error.response?.data?.error || "Could not leave that table." });
      return null;
    }
  },

  addChips: async (tableId, amount) => {
    set({ error: "" });
    try {
      const { data } = await api.post(`${CASH}/${tableId}/chips/`, { amount });
      useWalletStore.getState().setBalance(data.balance);
      return data;
    } catch (error) {
      set({ error: error.response?.data?.error || "Could not add those chips." });
      return null;
    }
  },

  sitOut: async (tableId, value) => {
    try {
      const { data } = await api.post(`${CASH}/${tableId}/sit-out/`, { value });
      return data.sitting_out;
    } catch {
      return null;
    }
  },

  openTable: async (payload) => {
    set({ error: "" });
    try {
      const { data } = await api.post(`${CASH}/open/`, payload);
      // Whichever list this table belongs to is the one that has to change.
      if (payload?.club) await get().fetchClubTables(payload.club);
      else await get().fetchLobby({ silent: true });
      return data;
    } catch (error) {
      set({ error: error.response?.data?.error || "Could not open that table." });
      return null;
    }
  },
}));

export default useCashStore;

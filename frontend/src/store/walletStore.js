import { create } from "zustand";

import api from "../api/http";
import { COINS } from "../api/paths";
import useAuthStore from "./authStore";

/**
 * Coins: the side games' own currency.
 *
 * Deliberately nothing to do with money. The tournament ledger settles real
 * debts between friends; these buy a seat in a Spin n Go, a guess at who wins a
 * pot and a rubber chicken to throw at them, and the two must never be confused
 * for each other — one is settled between people, the other is spent here.
 *
 * One store rather than a fetch in each panel, because three things read the
 * balance — the lobby chip, the shop and the side-bet card — and a stake placed
 * at the table has to move all three.
 */
const useWalletStore = create((set, get) => ({
  balance: null,
  dailyAmount: 0,
  canClaim: false,
  nextClaimAt: null,
  games: [],
  items: [],
  loading: false,
  error: "",

  apply: (data) => set({
    balance: data.balance,
    dailyAmount: data.daily_amount ?? get().dailyAmount,
    canClaim: Boolean(data.can_claim),
    nextClaimAt: data.next_claim_at ?? null,
    ...(data.games ? { games: data.games } : {}),
    ...(data.items ? { items: data.items } : {}),
  }),

  fetchWallet: async () => {
    try {
      const { data } = await api.get(`${COINS}/wallet/`);
      get().apply(data);
    } catch {
      // A balance that will not load is not worth an error on the lobby.
    }
  },

  fetchShop: async () => {
    set({ loading: true, error: "" });
    try {
      const { data } = await api.get(`${COINS}/shop/`);
      get().apply(data);
    } catch {
      set({ error: "The shop could not be opened." });
    } finally {
      set({ loading: false });
    }
  },

  claim: async () => {
    set({ error: "" });
    try {
      const { data } = await api.post(`${COINS}/claim/`);
      get().apply(data);
    } catch (error) {
      set({ error: error.response?.data?.error || "Could not claim today's coins." });
    }
  },

  buy: async (item, shelf = "throwable") => {
    set({ error: "" });
    try {
      const { data } = await api.post(`${COINS}/shop/buy/`, { item, shelf });
      get().apply(data);
      return true;
    } catch (error) {
      set({ error: error.response?.data?.error || "That purchase did not go through." });
      return false;
    }
  },

  // The table settles a side bet over the socket, so the balance arrives
  // without anybody asking for it.
  setBalance: (balance) => set((s) => (balance == null ? s : { balance })),

  owns: (item) => {
    const row = get().items.find((one) => one.item === item);
    // Unknown until the shop has been read once. Everything the client can see
    // is offered; the server refuses what was never bought.
    return row ? row.owned : true;
  },

  /**
   * Whether the server sells this at all.
   *
   * True before the shop has been read once, which is how the picker keeps
   * working on a table opened before the catalogue arrives. After that it is
   * the server's list: a client that knows about an item the server does not
   * would otherwise offer it and have every throw quietly refused.
   */
  /**
   * Put a ring on, or take one off.
   *
   * The profile carries it — it is how everybody else sees you rather than how
   * you see the app — so the answer goes back into authStore, where the header
   * and the seat both read it from.
   */
  wearBorder: async (border) => {
    set({ error: "" });
    try {
      const { data } = await api.patch(`${COINS}/shop/border/`, { border });
      useAuthStore.getState().patchProfile({ avatar_border: data.border });
      return true;
    } catch (error) {
      set({ error: error.response?.data?.error || "Could not put that on." });
      return false;
    }
  },

  /** What is on a given shelf: "throwable" or "border". */
  shelf: (name) => get().items.filter((one) => (one.shelf || "throwable") === name),

  /** Whether this player owns this ring. The plain one is nobody's purchase. */
  ownsBorder: (border) => {
    if (!border) return true;
    const row = get().items.find((one) => one.item === border && one.shelf === "border");
    return row ? row.owned : false;
  },

  onSale: (item) => {
    const items = get().items;
    return items.length === 0 || items.some((one) => one.item === item);
  },

  /** What one costs, or 0 for the ones everybody has. The till is the
   *  server's; this is only so a price can be printed beside the thing. */
  priceOf: (item) => get().items.find((one) => one.item === item)?.price ?? 0,
}));

export default useWalletStore;

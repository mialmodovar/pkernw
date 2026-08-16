import { create } from "zustand";

import api from "../api/http";

/**
 * Coins: the side games' own currency.
 *
 * Deliberately nothing to do with money. The tournament ledger settles real
 * debts between friends; these buy a guess at who wins a pot and a rubber
 * chicken to throw at them, and the two must never be confused for each other.
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
      const { data } = await api.get("/coins/wallet/");
      get().apply(data);
    } catch {
      // A balance that will not load is not worth an error on the lobby.
    }
  },

  fetchShop: async () => {
    set({ loading: true, error: "" });
    try {
      const { data } = await api.get("/coins/shop/");
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
      const { data } = await api.post("/coins/claim/");
      get().apply(data);
    } catch (error) {
      set({ error: error.response?.data?.error || "Could not claim today's coins." });
    }
  },

  buy: async (item) => {
    set({ error: "" });
    try {
      const { data } = await api.post("/coins/shop/buy/", { item });
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
}));

export default useWalletStore;

import { create } from "zustand";

import api from "../api/http";

/**
 * What is waiting for you, behind the bell in the header.
 *
 * Two sources, one list. The server is asked once on arrival for the things
 * that outlive a session — somebody asking to be friends, an invitation to a
 * game — and the presence socket adds to it while you sit there, so the bell
 * moves without anybody reloading. See backend/accounts/inbox.py.
 *
 * Keyed by the item's own id rather than appended, because the same news can
 * arrive twice: the socket delivers it, and a reload asks for it again. An id
 * built from what the item *is* ("friend_request:12") makes that idempotent
 * without a moment's bookkeeping.
 *
 * "Seen" is this browser's business and nothing else's. It is what stops the
 * dot glowing at somebody who has already looked; whether the thing itself is
 * done is answered by the thing itself, which is why opening the bell does not
 * clear the list — the item goes when the request is answered and the server
 * stops sending it.
 */
const SEEN_KEY = "poker.inbox.seen";

const readSeen = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(raw) ? raw.slice(-100) : [];
  } catch {
    return [];
  }
};

const writeSeen = (ids) => {
  try {
    // Capped: an id that has not been in the list for a hundred items is not
    // coming back, and this is a header, not an archive.
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-100)));
  } catch {
    // No storage means the dot returns on the next reload. Harmless.
  }
};

const useInboxStore = create((set, get) => ({
  items: [],
  seen: readSeen(),
  loaded: false,

  /** The list as the server has it. Replaces rather than merges: the server is
   *  the authority on what is still waiting. */
  fetchInbox: async () => {
    try {
      const { data } = await api.get("/auth/inbox/");
      set({ items: data.items || [], loaded: true });
    } catch {
      // A bell that will not load is not worth an error over. The next page
      // asks again.
    }
  },

  /** One item, from the socket. */
  add: (item) => set((state) => {
    if (!item?.id) return state;
    const at = item.at || new Date().toISOString();
    return {
      items: [{ ...item, at }, ...state.items.filter((one) => one.id !== item.id)],
    };
  }),

  /** Everything in the bell has been looked at. */
  markSeen: () => set((state) => {
    const seen = [...new Set([...state.seen, ...state.items.map((one) => one.id)])];
    writeSeen(seen);
    return { seen };
  }),

  /** Drop one because it has just been answered here, rather than waiting for
   *  the next fetch to agree. */
  drop: (id) => set((state) => ({ items: state.items.filter((one) => one.id !== id) })),

  /** How many are worth a dot: the ones this browser has not shown yet. */
  unseenCount: () => {
    const { items, seen } = get();
    const looked = new Set(seen);
    return items.filter((one) => !looked.has(one.id)).length;
  },

  reset: () => set({ items: [], loaded: false }),
}));

export default useInboxStore;

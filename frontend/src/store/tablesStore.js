import { create } from "zustand";

import api from "../api/http";

const WATCHING_KEY = "poker.watchingTables";
const LAST_KEY = "poker.lastTable";

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A blocked or full localStorage means the tabs last as long as the page
    // does, which is still most of a session.
  }
};

/**
 * Every table you have open at once.
 *
 * A player can be seated in more than one game — two Sit n Gos and a tournament
 * is an ordinary evening — and can be watching others on top of that. Until now
 * the app could only think about one: leaving a table lost it, and the way back
 * was a single button that guessed which one you meant.
 *
 * Two kinds of open table, and they behave differently on purpose:
 *
 * * **Seats** come from the server, because they are a fact about the
 *   tournament rather than about this browser. You cannot close one — you are
 *   in it — it closes when you bust or it ends.
 * * **Watched tables** are this browser's own list. Nothing on the server knows
 *   or cares that you are looking, so they are kept here and can be closed.
 */
const useTablesStore = create((set, get) => ({
  seats: [],
  watching: read(WATCHING_KEY, []),
  // Which table "back to the table" means. The one you were at last, not the
  // newest one you are in: with three open, the newest is rarely the one you
  // stepped away from.
  lastTableId: read(LAST_KEY, null),

  refreshSeats: async () => {
    try {
      const { data } = await api.get("/tournaments/", { params: { scope: "mine_active" } });
      set({ seats: data });
      // A watch tab for a table you have since sat down at is the same table
      // twice; the seat is the truer of the two.
      const seated = new Set(data.map((row) => row.id));
      const watching = get().watching.filter((one) => !seated.has(one.id));
      if (watching.length !== get().watching.length) {
        write(WATCHING_KEY, watching);
        set({ watching });
      }
    } catch {
      // A list that will not load is not worth an error over a page that is
      // about something else. The next tick recovers.
    }
  },

  /** Remember a table being looked at, so it survives leaving the page. */
  openWatch: (entry) => set((state) => {
    if (!entry?.id) return state;
    const without = state.watching.filter((one) => one.id !== entry.id);
    const watching = [...without, { ...entry, at: Date.now() }];
    write(WATCHING_KEY, watching);
    return { watching };
  }),

  closeWatch: (id) => set((state) => {
    const watching = state.watching.filter((one) => one.id !== id);
    write(WATCHING_KEY, watching);
    return { watching };
  }),

  /** Called by the table itself: this is the one you are at. */
  visited: (id) => set(() => {
    const value = Number(id) || null;
    write(LAST_KEY, value);
    return { lastTableId: value };
  }),

  /** On logout, so the next person at this browser starts with none of yours. */
  clear: () => set(() => {
    write(WATCHING_KEY, []);
    write(LAST_KEY, null);
    return { seats: [], watching: [], lastTableId: null };
  }),
}));

export default useTablesStore;

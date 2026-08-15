import { create } from "zustand";
import api from "../api/http";
import { DEFAULT_THEME, applyTheme, normalizeTheme } from "../theme/themes";

const KEY = "poker.theme";

/** Read synchronously, before React mounts. That is the point of keeping a copy
 *  in localStorage at all: the profile carries the real theme, but it only
 *  arrives once /auth/me/ answers, and a second of default burgundy on every
 *  page load is exactly the flash a theme setting is supposed to prevent. */
export const readStoredTheme = () => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeTheme(JSON.parse(raw)) : { ...DEFAULT_THEME };
  } catch {
    // Missing, blocked, or corrupt storage — the account copy will still land.
    return { ...DEFAULT_THEME };
  }
};

const writeStoredTheme = (theme) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(theme));
  } catch {
    // Ignore — the theme is then per-session on this device, and still saved
    // to the account.
  }
};

const clearStoredTheme = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing was stored, so nothing to clear.
  }
};

const isDefault = (theme) =>
  theme.preset === DEFAULT_THEME.preset && theme.accent === DEFAULT_THEME.accent;

// Dragging the colour input fires a change per pixel of travel. The paint is
// immediate either way; only the PATCH waits for you to settle on a colour.
let pushTimer = null;
const PUSH_DELAY_MS = 350;

const schedulePush = (theme) => {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    // A failed save leaves the local copy in place and the account copy stale.
    // The next change retries, and nothing the player can see is lost.
    api.patch("/auth/me/theme/", theme).catch(() => {});
  }, PUSH_DELAY_MS);
};

const useThemeStore = create((set) => ({
  ...readStoredTheme(),

  /** Paint, cache, and (unless told otherwise) save to the account. */
  update: (patch, { push = true } = {}) =>
    set((state) => {
      const next = normalizeTheme({ ...state, ...patch });
      applyTheme(next);
      writeStoredTheme(next);
      if (push) schedulePush(next);
      return next;
    }),

  /** Reconcile with the account, once /auth/me/ has answered.
   *
   * The account wins when it has a theme, because that is what makes the theme
   * follow you to a new browser. When it has none, a theme picked on this
   * device before the account had one is pushed up rather than thrown away —
   * which is also why logout has to clear the local copy, or the next person to
   * log in here would have the previous player's skin adopted into their
   * account. */
  hydrate: (serverTheme) =>
    set((state) => {
      if (serverTheme?.preset) {
        const next = normalizeTheme(serverTheme);
        applyTheme(next);
        writeStoredTheme(next);
        return next;
      }
      if (!isDefault(state)) schedulePush({ preset: state.preset, accent: state.accent });
      return state;
    }),

  /** On logout: this browser goes back to looking like a fresh install. */
  clear: () =>
    set(() => {
      clearTimeout(pushTimer);
      clearStoredTheme();
      applyTheme(DEFAULT_THEME);
      return { ...DEFAULT_THEME };
    }),
}));

export default useThemeStore;

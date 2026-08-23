import { create } from "zustand";
import api from "../api/http";
import useGameStore from "./gameStore";
import useTablesStore from "./tablesStore";
import useThemeStore from "./themeStore";

const useAuthStore = create((set, get) => ({
  user: null,

  /**
   * One field of the profile, changed in place.
   *
   * The three or four endpoints below each rewrite the whole profile object
   * around one answer; this is the same move for anything else that changes a
   * single field — the border a player is wearing, to begin with — without a
   * fifth copy of the spread.
   */
  patchProfile: (patch) => set((state) => (
    state.user ? { user: { ...state.user, profile: { ...state.user.profile, ...patch } } } : state
  )),

  loading: true,

  init: async () => {
    const token = localStorage.getItem("access");
    if (!token) { set({ loading: false }); return; }
    try {
      const { data } = await api.get("/auth/me/");
      useThemeStore.getState().hydrate(data.profile?.theme);
      useGameStore.getState().hydratePreferences(data.profile?.preferences);
      set({ user: data, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (username, password) => {
    const { data } = await api.post("/auth/login/", { username, password });
    localStorage.setItem("access", data.access);
    localStorage.setItem("refresh", data.refresh);
    const me = await api.get("/auth/me/");
    useThemeStore.getState().hydrate(me.data.profile?.theme);
    useGameStore.getState().hydratePreferences(me.data.profile?.preferences);
    set({ user: me.data });
  },

  /**
   * Sign in with a Google ID token.
   *
   * Returns what the server said rather than swallowing it: a first-time
   * sign-in makes the account and hands back its recovery code, which exists
   * in that one response and nowhere afterwards, and the caller is the only
   * thing that can put it on screen.
   */
  googleSignIn: async (credential) => {
    const { data } = await api.post("/auth/google/", { credential });
    localStorage.setItem("access", data.access);
    localStorage.setItem("refresh", data.refresh);
    const me = await api.get("/auth/me/");
    useThemeStore.getState().hydrate(me.data.profile?.theme);
    useGameStore.getState().hydratePreferences(me.data.profile?.preferences);
    set({ user: me.data });
    return data;
  },

  /** Attach a Google account to the one already signed in. */
  linkGoogle: async (credential) => {
    const { data } = await api.post("/auth/google/link/", { credential });
    get().patchProfile({ google_email: data.google_email });
    return data;
  },

  unlinkGoogle: async () => {
    const { data } = await api.delete("/auth/google/link/");
    get().patchProfile({ google_email: "" });
    return data;
  },

  register: async (username, password) => {
    // The reply carries the recovery code, which exists in this response and
    // nowhere else afterwards — only its hash is kept. Handed back to the
    // caller rather than stored: the sign-up screen shows it once and then it
    // is gone.
    const { data } = await api.post("/auth/register/", { username, password });
    return data;
  },

  updateAvatar: async (emoji) => {
    const { data } = await api.patch("/auth/me/avatar/", { avatar_emoji: emoji });
    const user = get().user;
    if (user) {
      set({ user: { ...user, profile: { ...user.profile, avatar_emoji: data.avatar_emoji } } });
    }
  },

  // What everybody else calls you. The username underneath it never moves —
  // it is what the login form asks for and what every stat is filed under.
  updateDisplayName: async (name) => {
    const { data } = await api.patch("/auth/me/display-name/", { display_name: name });
    const user = get().user;
    if (user) {
      set({ user: { ...user, profile: { ...user.profile, display_name: data.display_name } } });
    }
    return data.display_name;
  },

  // A picture, which covers the emoji for as long as it is there. The blob has
  // already been cropped and re-encoded by the browser (see avatarImage.js);
  // this only carries it.
  uploadAvatarImage: async (blob) => {
    const form = new FormData();
    form.append("image", blob, "avatar");
    const { data } = await api.put("/auth/me/avatar/image/", form);
    const user = get().user;
    if (user) {
      set({ user: { ...user, profile: { ...user.profile, avatar_url: data.avatar_url } } });
    }
    return data.avatar_url;
  },

  // Removing the picture is not choosing a new avatar — it uncovers the emoji
  // that was underneath it all along.
  removeAvatarImage: async () => {
    await api.delete("/auth/me/avatar/image/");
    const user = get().user;
    if (user) {
      set({ user: { ...user, profile: { ...user.profile, avatar_url: null } } });
    }
  },

  logout: () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    // The theme is one of this account's belongings, so it leaves with them —
    // otherwise the next player to log in on this browser would inherit the
    // skin, and have it saved onto their own profile.
    useThemeStore.getState().clear();
    // The next person at this browser starts with none of your tables open.
    useTablesStore.getState().clear();
    set({ user: null });
  },
}));

export default useAuthStore;

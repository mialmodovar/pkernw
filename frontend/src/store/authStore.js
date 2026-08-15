import { create } from "zustand";
import api from "../api/http";
import useThemeStore from "./themeStore";

const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,

  init: async () => {
    const token = localStorage.getItem("access");
    if (!token) { set({ loading: false }); return; }
    try {
      const { data } = await api.get("/auth/me/");
      useThemeStore.getState().hydrate(data.profile?.theme);
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
    set({ user: me.data });
  },

  register: async (username, password) => {
    await api.post("/auth/register/", { username, password });
  },

  updateAvatar: async (emoji) => {
    const { data } = await api.patch("/auth/me/avatar/", { avatar_emoji: emoji });
    const user = get().user;
    if (user) {
      set({ user: { ...user, profile: { ...user.profile, avatar_emoji: data.avatar_emoji } } });
    }
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
    set({ user: null });
  },
}));

export default useAuthStore;

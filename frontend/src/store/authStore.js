import { create } from "zustand";
import api from "../api/http";

const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,

  init: async () => {
    const token = localStorage.getItem("access");
    if (!token) { set({ loading: false }); return; }
    try {
      const { data } = await api.get("/auth/me/");
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

  logout: () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    set({ user: null });
  },
}));

export default useAuthStore;

/**
 * Giphy, kept behind one door.
 *
 * Everything that travels between players is a Giphy **id**. URLs are built
 * here, from a fixed host, so a message from another player can never point the
 * table at an arbitrary image somewhere else. The server enforces the same rule
 * (see backend/game/giphy.py); this is the client half of it.
 *
 * The key is a build-time variable. Giphy's web keys are public by design —
 * they identify the app, not the user — so this is the shape they are meant to
 * be used in. Without one the picker says so instead of failing silently, and
 * GIFs already chosen still display: rendering needs no key at all.
 */

const API_KEY = import.meta.env.VITE_GIPHY_API_KEY || "";
const API = "https://api.giphy.com/v1/gifs";

export const giphyConfigured = Boolean(API_KEY);

/** Small, looping, and cheap enough to sit over a seat mid-hand. */
export function gifPreviewUrl(id) {
  return id ? `https://media.giphy.com/media/${encodeURIComponent(id)}/200.gif` : null;
}

/** The size worth showing in the middle of the table. */
export function gifFullUrl(id) {
  return id ? `https://media.giphy.com/media/${encodeURIComponent(id)}/giphy.gif` : null;
}

async function fetchGifs(path, params, signal) {
  if (!API_KEY) return [];
  const query = new URLSearchParams({ api_key: API_KEY, rating: "pg-13", ...params });
  const response = await fetch(`${API}/${path}?${query}`, { signal });
  if (!response.ok) throw new Error(`Giphy responded ${response.status}`);
  const body = await response.json();
  // Only the id and a label survive the trip. Nothing downstream should be
  // holding a URL Giphy handed us when it can build one from the id.
  return (body.data || []).map((gif) => ({ id: gif.id, title: gif.title || "GIF" }));
}

export function searchGifs(term, { limit = 24, signal } = {}) {
  const text = term.trim();
  if (!text) return trendingGifs({ limit, signal });
  return fetchGifs("search", { q: text, limit: String(limit) }, signal);
}

export function trendingGifs({ limit = 24, signal } = {}) {
  return fetchGifs("trending", { limit: String(limit) }, signal);
}

/**
 * Giphy, kept behind one door.
 *
 * Everything that travels between players is a Giphy **id**. URLs are built
 * here, from a fixed host, so a message from another player can never point the
 * table at an arbitrary image somewhere else. The server enforces the same rule
 * (see backend/game/giphy.py); this is the client half of it.
 *
 * The keys are build-time variables. Giphy's web keys are public by design —
 * they identify the app, not the user — so this is the shape they are meant to
 * be used in. Without one the picker says so instead of failing silently, and
 * GIFs already chosen still display: rendering needs no key at all.
 *
 * More than one key, because one key's hourly allowance is small, the whole
 * table shares it, and we were emptying it regularly. Requests go round the
 * keys in turn and a key that answers "too many" is rested for the hour — see
 * giphyKeys.js. Repeated questions are answered from a short-lived cache rather
 * than asked again, which is the cheapest saving there is: the picker opens on
 * trending every single time, and a search is usually one somebody just made.
 */

import {
  keysReady, newRotation, parseKeys, restKey, restingUntil, takeKey,
} from "./giphyKeys";

const API = "https://api.giphy.com/v1/gifs";

// VITE_GIPHY_API_KEYS is the list; VITE_GIPHY_API_KEY is what deploys already
// set, and still counts as one of the keys.
const keys = parseKeys(
  import.meta.env.VITE_GIPHY_API_KEYS,
  import.meta.env.VITE_GIPHY_API_KEY,
);

// Each browser starts at a key of its own: every one of them keeps its own
// rotation, and all starting at the first would put the whole house's first
// request of the evening on the same key.
let rotation = newRotation(keys, Math.floor(Math.random() * (keys.length || 1)));

export const giphyConfigured = keys.length > 0;

/** Every key is inside its cooldown. Not a failure to retry — a wait. */
export class GiphyRateLimited extends Error {
  constructor(retryAt) {
    super("Every Giphy key is rate-limited");
    this.name = "GiphyRateLimited";
    this.retryAt = retryAt;
  }
}

// Long enough to cover a table all opening the picker on the same trending
// list, short enough that trending is still today's.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

function cached(spot, now) {
  const hit = cache.get(spot);
  if (!hit) return null;
  if (hit.at + CACHE_MS <= now) {
    cache.delete(spot);
    return null;
  }
  return hit.gifs;
}

/** Small, looping, and cheap enough to sit over a seat mid-hand. */
export function gifPreviewUrl(id) {
  return id ? `https://media.giphy.com/media/${encodeURIComponent(id)}/200.gif` : null;
}

/** The size worth showing in the middle of the table. */
export function gifFullUrl(id) {
  return id ? `https://media.giphy.com/media/${encodeURIComponent(id)}/giphy.gif` : null;
}

async function fetchGifs(path, params, signal) {
  if (!keys.length) return [];

  const shape = new URLSearchParams({ rating: "pg-13", ...params });
  const spot = `${path}?${shape}`;
  const hit = cached(spot, Date.now());
  if (hit) return hit;

  // One attempt per key that could answer: a key rested along the way is
  // skipped on the next turn, so this ends rather than circling.
  let attempts = keysReady(rotation, Date.now());
  while (attempts > 0) {
    attempts -= 1;
    const turn = takeKey(rotation, Date.now());
    rotation = turn.rotation;
    if (!turn.key) break;

    const query = new URLSearchParams(shape);
    query.set("api_key", turn.key);
    const response = await fetch(`${API}/${path}?${query}`, { signal });

    // 429 is the allowance gone. 403 is Giphy refusing the key, which is also
    // what it does to one over its quota — either way this key answers nothing
    // useful this hour, so rest it and ask the next one.
    if (response.status === 429 || response.status === 403) {
      rotation = restKey(rotation, turn.key, Date.now());
      continue;
    }
    if (!response.ok) throw new Error(`Giphy responded ${response.status}`);

    const body = await response.json();
    // Only the id and a label survive the trip. Nothing downstream should be
    // holding a URL Giphy handed us when it can build one from the id.
    const gifs = (body.data || []).map((gif) => ({ id: gif.id, title: gif.title || "GIF" }));
    cache.set(spot, { at: Date.now(), gifs });
    return gifs;
  }

  throw new GiphyRateLimited(restingUntil(rotation, Date.now()));
}

export function searchGifs(term, { limit = 24, signal } = {}) {
  const text = term.trim();
  if (!text) return trendingGifs({ limit, signal });
  return fetchGifs("search", { q: text, limit: String(limit) }, signal);
}

export function trendingGifs({ limit = 24, signal } = {}) {
  return fetchGifs("trending", { limit: String(limit) }, signal);
}

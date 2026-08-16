import { useEffect, useRef, useState } from "react";

import { giphyConfigured, gifPreviewUrl, searchGifs } from "../../api/giphy";

/** Long enough that typing a word does not cost a request per letter. */
const DEBOUNCE_MS = 350;

/**
 * Pick a GIF. Used both for saying one in chat and for choosing a finisher, so
 * it knows nothing about either — it hands back an id and closes.
 *
 * Opens on trending, because an empty grid with a search box is a worse
 * starting point than something to react to.
 */
export default function GifPicker({ onPick, onClose, title = "Send a GIF" }) {
  const [term, setTerm] = useState("");
  const [gifs, setGifs] = useState([]);
  const [state, setState] = useState("loading");   // loading | ready | error
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!giphyConfigured) return undefined;
    // Aborted on every keystroke, so a slow early request cannot land after a
    // later one and overwrite the results you are actually looking at.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState("loading");
      searchGifs(term, { signal: controller.signal })
        .then((results) => { setGifs(results); setState("ready"); })
        .catch((error) => { if (error.name !== "AbortError") setState("error"); });
    }, term ? DEBOUNCE_MS : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term]);

  return (
    <div className="panel panel-solid rounded-lg shadow-xl shadow-black/60 p-2 w-64 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search GIFs…"
          aria-label={title}
          className="input-field flex-1 min-w-0 rounded px-2 py-1 text-xs transition-colors"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the GIF picker"
          className="text-(--color-text-muted) hover:text-(--color-silver) text-sm leading-none px-1 transition-colors"
        >
          ✕
        </button>
      </div>

      {!giphyConfigured ? (
        <p className="text-[11px] leading-snug text-(--color-text-muted) py-2">
          GIFs need a Giphy API key. Set <code>VITE_GIPHY_API_KEY</code> in the
          frontend environment and rebuild.
        </p>
      ) : state === "error" ? (
        <p className="text-[11px] text-(--color-text-muted) py-2">
          Giphy did not answer. Try again in a moment.
        </p>
      ) : state === "loading" && gifs.length === 0 ? (
        <p className="text-[11px] text-(--color-text-muted) py-2">Looking…</p>
      ) : gifs.length === 0 ? (
        <p className="text-[11px] text-(--color-text-muted) py-2">Nothing for that.</p>
      ) : (
        // The square is on a plain box inside each button, not on the button
        // itself: WebKit does not lay a button out from its aspect-ratio the
        // way it does a div, so the cells came out the wrong height and the
        // rows sat on top of each other — while Chromium looked fine. The rows
        // are pinned to the same height as well, so a slow image cannot
        // reflow the grid under the pointer as it lands.
        <div className="grid grid-cols-3 auto-rows-[4.1rem] gap-1 max-h-52 overflow-y-auto">
          {gifs.map((gif) => (
            <button
              key={gif.id}
              type="button"
              onClick={() => onPick(gif.id)}
              title={gif.title}
              className="block h-full w-full rounded overflow-hidden border border-(--color-border)
                         hover:border-(--color-highlight) transition-colors"
            >
              <img
                src={gifPreviewUrl(gif.id)}
                alt={gif.title}
                loading="lazy"
                className="block w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <p className="text-[9px] text-(--color-text-muted) text-right">via GIPHY</p>
    </div>
  );
}

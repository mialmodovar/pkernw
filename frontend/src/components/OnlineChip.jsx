import { useEffect, useState } from "react";

import api from "../api/http";
import { POLL_MS, onlineLabel, onlineTitle, worthShowing } from "./onlineCount";

/**
 * How many people are in the app, in the corner.
 *
 * Polled rather than pushed. The server could broadcast the number to every
 * client whenever it changed, and that is exactly what it must not do: this
 * shares an event loop with the tournament engine, and a fan-out on every
 * opened tab would land in front of somebody's next hand. Two in-memory sets
 * read on a timer costs nothing at either end, and a count half a minute stale
 * is a count that is fine.
 *
 * Stops asking while the tab is in the background, which on a phone is most of
 * the time.
 *
 * Named ...Chip because its file has to differ from onlineCount.js by more than
 * a capital letter: on a Mac they are the same file, and the import resolves to
 * whichever the filesystem feels like.
 */
export default function OnlineChip() {
  const [count, setCount] = useState(null);

  useEffect(() => {
    let live = true;
    const ask = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data } = await api.get("/auth/online/");
        if (live) setCount(data.online);
      } catch {
        // A count that will not load is not worth an error over the header.
        // The next tick has it, and nothing depends on the number.
      }
    };

    ask();
    const timer = setInterval(ask, POLL_MS);
    // Coming back to the app is its own reason to ask: the number on screen is
    // as old as the last time this tab was looked at.
    document.addEventListener("visibilitychange", ask);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
  }, []);

  if (!worthShowing(count)) return null;

  return (
    <span
      title={onlineTitle(count)}
      className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full
                 border border-(--color-border) text-[11px] font-semibold
                 text-(--color-text-muted) tabular-nums"
    >
      {/* A lit dot, which is what "online" looks like everywhere else. */}
      <span className="w-1.5 h-1.5 rounded-full bg-[#4ea172] shadow-[0_0_6px_#4ea172]" />
      {onlineLabel(count)}
    </span>
  );
}

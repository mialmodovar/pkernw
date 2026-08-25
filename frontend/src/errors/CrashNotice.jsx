import { useState } from "react";

import { blackBoxReport, crashSamples, crashSummary, endedBadly, forgetCrash } from "./blackBox";
import { crashReport, crashes } from "./crashLog";

/**
 * "That tab died." Said once, on the way back in.
 *
 * A killed renderer cannot apologise for itself — by the time anybody could be
 * told, the page that would tell them is gone. This is the next best moment:
 * the reload straight afterwards, when the reading taken twenty seconds before
 * the crash is still in sessionStorage and the person it happened to is sitting
 * right there.
 *
 * It exists to turn "it crashed again" into a report worth reading. Nothing is
 * sent anywhere: the details are put on the clipboard and it is the player's
 * choice whether to pass them on.
 */
export default function CrashNotice() {
  // Read once, at mount: this describes the run BEFORE this one, and it must
  // not change under the reader as the new run starts recording over it.
  const [crash] = useState(() => (endedBadly() ? crashSummary() : null));
  const [record] = useState(() => crashSamples());
  const [thrown] = useState(() => crashes());
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  // Only where it is actually about a table. The tab can be killed for reasons
  // that have nothing to do with us — a laptop running out of memory with forty
  // other tabs open — and telling somebody in the lobby about it is noise.
  const atTable = /\/(tournament|cash)\//.test(crash?.path || "");
  if (!crash || !atTable || dismissed) return null;

  const details = [blackBoxReport(record), crashReport(thrown)].filter(Boolean).join("\n\n");

  const copy = () => {
    navigator.clipboard?.writeText(details)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <div className="px-3 py-2 border-b border-(--color-border) bg-black/40 flex items-center gap-3 text-xs">
      <span className="text-(--color-silver)">
        This tab stopped at {crash.at.slice(11, 16)} while you were at a table
        {crash.peers != null ? ` with ${crash.peers} camera${crash.peers === 1 ? "" : "s"} connected` : ""}.
      </span>
      <button
        type="button"
        onClick={copy}
        className="btn-secondary px-2 py-1 rounded font-semibold shrink-0"
      >
        {copied ? "Copied" : "Copy what it was doing"}
      </button>
      <button
        type="button"
        onClick={() => { forgetCrash(); setDismissed(true); }}
        className="ml-auto text-(--color-text-muted) hover:text-(--color-silver) shrink-0"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

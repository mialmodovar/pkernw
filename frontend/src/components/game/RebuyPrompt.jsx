import { useEffect, useState } from "react";

import api from "../../api/http";
import useGameStore from "../../store/gameStore";

/**
 * The ten seconds after you bust, while the table waits.
 *
 * Being offered a rebuy on a screen that appears once the next hand is already
 * under way is the same as not being offered one, so this arrives the moment
 * you go out and the engine holds the deal until it closes. Deliberately a
 * strip rather than a takeover: the hand that just busted you is still on the
 * felt behind it, and that is the hand you want to look at.
 *
 * The full elimination screen still follows, and still offers a rebuy — this is
 * the fast path, not the only one.
 */
export default function RebuyPrompt({ tournamentId, myUserId, startingChips }) {
  const rebuyWindow = useGameStore((s) => s.rebuyWindow);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mine = Boolean(rebuyWindow && myUserId != null && rebuyWindow.userIds.includes(myUserId));
  const endsAt = mine ? rebuyWindow.endsAt : null;

  useEffect(() => {
    if (endsAt == null) return undefined;
    // Read from the deadline rather than counted down locally, so the number
    // stays honest if this mounts part way through the window.
    const read = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    read();
    const id = setInterval(read, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!mine || left <= 0) return null;

  const rebuy = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/tournaments/${tournamentId}/rebuy/`);
      // The seat comes back through the table roster, so there is nothing to
      // set here — the prompt goes when the window closes.
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Rebuy failed");
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-4 z-30 flex justify-center px-4 animate-fade-in">
      <div className="panel panel-floating rounded-full pl-4 pr-2 py-2 flex items-center gap-3
                      shadow-xl shadow-black/60">
        <span className="text-sm text-(--color-silver) whitespace-nowrap">
          {error || "You're out — buy back in?"}
        </span>
        <span className="text-sm font-mono tabular-nums text-(--color-highlight-text) w-6 text-right">
          {left}
        </span>
        <button
          type="button"
          onClick={rebuy}
          disabled={busy}
          className="btn-accent px-3 py-1 rounded-full text-xs font-semibold transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {busy ? "Rebuying…" : `Rebuy ${startingChips ? startingChips.toLocaleString() : ""}`}
        </button>
      </div>
    </div>
  );
}

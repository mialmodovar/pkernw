import { useState } from "react";
import api from "../../api/http";

const ordinal = (n) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
};

/**
 * Shown to a player who has busted. It has to work from the REST detail alone,
 * because an eliminated player gets no game_state snapshot on reconnect — so a
 * page reload would otherwise leave them staring at an empty table.
 */
export default function EliminationScreen({
  tournamentId, tournament, finishPosition, reason, onRebought, onSpectate, onLeave,
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const entrants = tournament?.players?.length ?? 0;
  const payout = tournament?.payout_structure?.find((row) => row.place === finishPosition);
  const mySeat = tournament?.players?.find((p) => p.finish_position === finishPosition);
  const rebuysUsed = mySeat?.rebuy_count ?? 0;
  // Null is unlimited, so there is no number to count down from.
  const rebuysCapped = tournament?.max_rebuys !== null && tournament?.max_rebuys !== undefined;
  const rebuysLeft = rebuysCapped ? tournament.max_rebuys - rebuysUsed : Infinity;

  // The blind-level cutoff is enforced server-side against the live engine, so
  // offer the button whenever it's plausible and surface the refusal verbatim.
  const canRebuy =
    tournament?.allow_rebuys &&
    rebuysLeft > 0 &&
    ["running", "paused"].includes(tournament?.status);

  const handleRebuy = async () => {
    setError("");
    setBusy(true);
    try {
      await api.post(`/tournaments/${tournamentId}/rebuy/`);
      onRebought();
    } catch (e) {
      setError(e.response?.data?.error || "Rebuy failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="panel rounded-xl p-8 w-full max-w-md text-center shadow-2xl shadow-black/60">
        <p className="text-xs uppercase tracking-wide text-(--color-text-muted)">
          {reason === "offline_timeout" ? "Removed for being offline" : "Knocked out"}
        </p>

        <h1 className="text-3xl font-bold text-(--color-silver) mt-2">
          {finishPosition === 1 ? "🏆 You won" : `You finished ${ordinal(finishPosition)}`}
        </h1>
        {entrants > 0 && finishPosition !== 1 && (
          <p className="text-(--color-text-muted) mt-1">of {entrants} entrants</p>
        )}

        {payout ? (
          <p className="mt-4 text-(--color-highlight-text) font-semibold">
            In the money — {payout.percentage}% of the prize pool
          </p>
        ) : (
          tournament?.payout_structure?.length > 0 && (
            <p className="mt-4 text-(--color-text-muted) text-sm">Outside the paid places.</p>
          )
        )}

        {error && <p className="mt-4 text-sm text-[#c76b7a]">{error}</p>}

        <div className="mt-6 flex flex-col gap-2">
          {canRebuy && (
            <button
              onClick={handleRebuy}
              disabled={busy}
              className="btn-accent px-4 py-2.5 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy
                ? "Rebuying..."
                : `Rebuy — ${tournament.starting_chips.toLocaleString()} chips${
                    rebuysCapped ? ` (${rebuysLeft} left)` : ""
                  }`}
            </button>
          )}
          {onSpectate && (
            <button
              onClick={onSpectate}
              className="btn-secondary px-4 py-2.5 rounded font-semibold transition-colors"
            >
              Keep watching
            </button>
          )}
          <button
            onClick={onLeave}
            className="btn-secondary px-4 py-2.5 rounded font-semibold transition-colors"
          >
            Back home
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import api from "../../api/http";
import { giphyConfigured, gifPreviewUrl } from "../../api/giphy";
import { rebuyLabel, rebuyOffer } from "../lobby/rebuyOffer";
import { findOutcomeGif, outcomeOf } from "./outcomeGif";
import { entryCount, payoutLabel } from "./prizePool";

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
  // The same offer the lobby and the home list make, so busting out and then
  // walking away from the table does not change the answer.
  const offer = rebuyOffer(tournament, {
    eliminated: true,
    rebuysUsed: mySeat?.rebuy_count ?? 0,
  });

  // Something to look at while it sinks in — celebrating with you if you cashed
  // and laughing at you if you did not. Fetched once per finish and seeded on
  // where you came, so it holds still rather than reshuffling on every render,
  // and a table with no Giphy key configured simply carries on without it.
  const [gifId, setGifId] = useState(null);
  const outcome = outcomeOf({ finishPosition, inTheMoney: Boolean(payout) });
  useEffect(() => {
    if (!giphyConfigured) return undefined;
    const controller = new AbortController();
    findOutcomeGif({
      outcome,
      seed: (tournamentId || 0) * 97 + (finishPosition || 0),
      signal: controller.signal,
    })
      .then(setGifId)
      // A picture is the last thing this screen owes anybody: if it does not
      // arrive, the result underneath is still the result.
      .catch(() => {});
    return () => controller.abort();
  }, [outcome, tournamentId, finishPosition]);

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
            {/* What you won, in money. "20% of the prize pool" is a rule for
                splitting a pot, and this is the one screen where the question
                is what you are owed — the share only survives a tournament
                played for nothing, where there is no pot to apply it to. */}
            In the money — {payoutLabel(tournament, payout, entryCount(tournament))}
          </p>
        ) : (
          tournament?.payout_structure?.length > 0 && (
            <p className="mt-4 text-(--color-text-muted) text-sm">Outside the paid places.</p>
          )
        )}

        {gifId && (
          <img
            src={gifPreviewUrl(gifId)}
            alt=""
            // Decorative and unlabelled on purpose: a screen reader announcing
            // the title of a reaction GIF over your own result is noise.
            aria-hidden="true"
            className="mt-4 w-full max-h-48 object-contain rounded-lg border border-(--color-border)
                       bg-black/40 animate-fade-in"
            onError={() => setGifId(null)}
          />
        )}

        {error && <p className="mt-4 text-sm text-[#c76b7a]">{error}</p>}

        <div className="mt-6 flex flex-col gap-2">
          {offer && (
            <button
              onClick={handleRebuy}
              disabled={busy}
              className="btn-accent px-4 py-2.5 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "Rebuying..." : rebuyLabel(offer)}
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

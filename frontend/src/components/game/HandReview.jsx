import { useEffect, useState } from "react";
import api from "../../api/http";
import { SUIT_COLOR, SUIT_CHAR, CARD_FACE } from "./cardStyles";

const STREETS = ["preflop", "flop", "turn", "river"];
const STREET_LABEL = { preflop: "Preflop", flop: "Flop", turn: "Turn", river: "River" };

const VERB = {
  fold: "folds", check: "checks", call: "calls",
  bet: "bets", raise: "raises to", blind: "posts", ante: "antes",
};

function MiniCard({ card }) {
  const rank = card.slice(0, -1);
  const suit = SUIT_CHAR[card.slice(-1)] || card.slice(-1);
  return (
    <span
      className={`inline-flex flex-col items-center justify-center w-6 h-8 rounded text-[10px] font-bold ${CARD_FACE}`}
      style={{ color: SUIT_COLOR[suit] || "#161616" }}
    >
      <span>{rank}</span>
      <span className="text-[8px]">{suit}</span>
    </span>
  );
}

function Hand({ hand }) {
  const byStreet = STREETS.map((street) => ({
    street,
    items: (hand.actions || []).filter((a) => a.street === street),
  })).filter((group) => group.items.length);

  const awards = hand.result?.awards || [];
  const showdown = hand.result?.showdown || [];
  // The showdown and awards only carry seats; the actions carry both, so use
  // them to name people consistently throughout.
  const nameBySeat = new Map((hand.actions || []).map((a) => [a.seat, a.username]));
  const nameFor = (seat) => nameBySeat.get(seat) ?? `Seat ${seat}`;

  return (
    <div className="panel-raised rounded-lg p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-(--color-silver)">Hand #{hand.hand_number}</span>
        <span className="text-xs text-[#d9c07a]">Pot {hand.pot_total?.toLocaleString()}</span>
      </div>

      {hand.community_cards?.length > 0 && (
        <div className="flex gap-1 mt-2">
          {hand.community_cards.map((c) => <MiniCard key={c} card={c} />)}
        </div>
      )}

      <div className="mt-2 space-y-1.5 text-xs">
        {byStreet.map((group) => (
          <div key={group.street}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#a8632c]">
              {STREET_LABEL[group.street]}
            </div>
            {group.items.map((a, i) => (
              <div key={i} className="pl-1.5 text-(--color-text-muted)">
                <span className="text-(--color-silver)">{a.username}</span>{" "}
                {VERB[a.action] || a.action}
                {a.amount ? ` ${a.amount.toLocaleString()}` : ""}
              </div>
            ))}
          </div>
        ))}
      </div>

      {showdown.length > 0 && (
        <div className="mt-2 pt-2 border-t border-(--color-border) space-y-0.5 text-xs">
          {showdown.map((entry) => (
            <div key={entry.seat} className="text-(--color-silver)">
              {nameFor(entry.seat)}: {entry.cards?.join(" ")} — {entry.hand_name}
            </div>
          ))}
        </div>
      )}

      {awards.length > 0 && (
        <div className="mt-1.5 space-y-0.5 text-xs">
          {awards.map((award, i) => (
            <div key={i} className="text-[#d9c07a] font-semibold">
              {nameFor(award.seat)} wins {award.amount?.toLocaleString()} ({award.description})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Replays recently finished hands. The engine has always written nothing to the
 * hand tables, so there was nothing to look back at; now that it does, this
 * reads them.
 */
export default function HandReview({ tournamentId, onClose }) {
  const [hands, setHands] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.get(`/tournaments/${tournamentId}/hands/`, { params: { limit: 5 } })
      .then(({ data }) => { if (!cancelled) setHands(data); })
      .catch(() => { if (!cancelled) setError("Could not load the hand history."); });
    return () => { cancelled = true; };
  }, [tournamentId]);

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center px-4">
      <div className="panel rounded-xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl shadow-black/70">
        <div className="flex items-center justify-between px-4 py-3 border-b border-(--color-border)">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-(--color-silver)">
            Recent hands
          </h2>
          <button
            onClick={onClose}
            className="btn-secondary px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {error && <p className="text-sm text-[#c76b7a]">{error}</p>}
          {!error && hands == null && (
            <p className="text-sm text-(--color-text-muted)">Loading…</p>
          )}
          {hands?.length === 0 && (
            <p className="text-sm text-(--color-text-muted)">
              No completed hands yet.
            </p>
          )}
          {hands?.map((hand) => <Hand key={hand.id} hand={hand} />)}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import useCashStore from "../../store/cashStore";

/**
 * Opening a cash table, for a club.
 *
 * Cash tables belong to somebody. The four public ones are the app's own and
 * are not opened from here — everything else is a club's, which is what makes
 * house rules possible at all: run it twice and bomb pots are things a room
 * agrees between itself, not settings on a lobby.
 *
 * The same dialog from the lobby and from a club page. From a club it already
 * knows whose table it is; from the lobby it has to ask, and it asks only about
 * the clubs this player actually organises, because a picker offering rooms the
 * server will refuse is a picker that lies.
 */
export default function NewCashTableModal({
  clubs = [], club = null, allowPublic = false, onClose, onOpened,
}) {
  const { stakes, seatChoices, fetchLobby, openTable, error } = useCashStore();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    club: club || clubs[0]?.slug || "",
    stake: "micro",
    seats: 6,
    run_it_twice: false,
    bomb_pot_every: 0,
  });

  // The ladder and the shapes come off the lobby, which the club page has not
  // necessarily loaded.
  useEffect(() => { if (stakes.length === 0) fetchLobby({ silent: true }); }, [stakes.length, fetchLobby]);

  useEffect(() => {
    const key = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const made = await openTable(form);
    setBusy(false);
    if (made) {
      onOpened?.(made);
      onClose();
    }
  };

  const shapes = seatChoices.length ? seatChoices : [2, 6, 8, 9];

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={onClose}>
      <form onSubmit={submit} onClick={(event) => event.stopPropagation()}
        className="panel rounded-xl w-full max-w-md shadow-2xl shadow-black/70">
        <div className="flex items-start justify-between gap-3 px-4 py-3
                        border-b border-(--color-border)">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-(--color-highlight-text)">
              Open a cash table
            </h2>
            <p className="text-xs text-(--color-text-muted)">
              It stays open until somebody closes it.
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="btn-secondary shrink-0 px-3 py-1 rounded text-xs font-semibold">
            Close
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Only from the lobby: on a club's own page the answer is the page. */}
          {!club && (
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider
                               text-(--color-text-muted) mb-1">Club</span>
              <select value={form.club}
                onChange={(event) => setForm({ ...form, club: event.target.value })}
                className="input-field w-full rounded py-1.5 px-2 text-sm">
                {clubs.map((one) => (
                  <option key={one.slug} value={one.slug}>{one.name}</option>
                ))}
                {/* Whoever administers the installation can open one of the
                    app's own, which is how the four in the lobby got there. */}
                {allowPublic && <option value="">Public — the app's own</option>}
              </select>
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider
                               text-(--color-text-muted) mb-1">Stake</span>
              <select value={form.stake}
                onChange={(event) => setForm({ ...form, stake: event.target.value })}
                className="input-field w-full rounded py-1.5 px-2 text-sm">
                {stakes.map((one) => (
                  <option key={one.key} value={one.key}>
                    {one.label} · {one.min_buy_in}–{one.max_buy_in}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider
                               text-(--color-text-muted) mb-1">Seats</span>
              <select value={form.seats}
                onChange={(event) => setForm({ ...form, seats: Number(event.target.value) })}
                className="input-field w-full rounded py-1.5 px-2 text-sm">
                {shapes.map((count) => (
                  <option key={count} value={count}>
                    {count === 2 ? "Heads up" : `${count}-max`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* The house rules. This is the whole reason a club opens its own
              table rather than sending everybody to the public ones. */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-(--color-silver)">
              <input type="checkbox" checked={form.run_it_twice}
                onChange={(event) => setForm({ ...form, run_it_twice: event.target.checked })} />
              <span title="All-in pots are dealt two boards, each for half the pot">
                Run it twice
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs text-(--color-silver)">
              <span title="Every so many hands: everybody in before the flop, two boards">
                Bomb pot every
              </span>
              <input type="number" min="0" max="100" value={form.bomb_pot_every}
                onChange={(event) => setForm({
                  ...form, bomb_pot_every: Math.max(0, Number(event.target.value)),
                })}
                className="input-field w-16 text-right rounded py-1 px-1.5 font-mono text-xs" />
              <span className="text-(--color-text-muted)">
                {form.bomb_pot_every > 0 ? "hands" : "— off"}
              </span>
            </label>
          </div>

          {error && <p className="text-xs text-[#c76b7a]">{error}</p>}

          <button type="submit" disabled={busy || (!form.club && !allowPublic)}
            className="btn-accent w-full py-2 rounded text-sm font-semibold disabled:opacity-50">
            {busy ? "Opening…" : "Open the table"}
          </button>
          {!form.club && !allowPublic && (
            <p className="text-[11px] text-(--color-text-muted)">
              A cash table belongs to a club. Make one, or ask to help run one.
            </p>
          )}
        </div>
      </form>
    </div>,
    document.body,
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Icon from "../icons/Icon";
import useCashStore from "../../store/cashStore";
import useWalletStore from "../../store/walletStore";
import { rowActions, tableSummary } from "./cashTables";
import SitDownModal from "./SitDownModal";

/**
 * A club's own cash tables.
 *
 * The public tables are the app's: four rooms at fixed stakes, running the
 * ordinary game, open to anybody. A club is the other thing a cash game is —
 * the same people, the same night, and whatever house rules they have agreed
 * between them. So this is where run-it-twice and bomb pots live, and why
 * opening a table is something the club's staff do rather than something the
 * app does on a schedule.
 */
export default function ClubCashTables({ club, isStaff }) {
  const navigate = useNavigate();
  const { clubTables, stakes, seatChoices, fetchClubTables, openTable, error } = useCashStore();
  const balance = useWalletStore((s) => s.balance);

  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [buyingInto, setBuyingInto] = useState(null);
  const [form, setForm] = useState({
    stake: "micro", seats: 6, run_it_twice: false, bomb_pot_every: 0,
  });

  useEffect(() => { fetchClubTables(club.slug); }, [club.slug, fetchClubTables]);

  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    const made = await openTable({ ...form, club: club.slug });
    setBusy(false);
    if (made) setOpening(false);
  };

  const sitDown = async (amount, seat) => {
    const seated = await useCashStore.getState().sit(buyingInto.id, amount, seat);
    if (!seated) return;
    setBuyingInto(null);
    navigate(`/cash/${seated}`);
  };

  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-(--color-text-muted)">
          Cash tables
        </h2>
        {isStaff && !opening && (
          <button type="button" onClick={() => setOpening(true)}
            className="text-[11px] font-semibold text-(--color-highlight-text) hover:underline">
            Open one
          </button>
        )}
      </div>

      {isStaff && opening && (
        <form onSubmit={create} className="panel-raised rounded-lg p-3 space-y-3">
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
                {(seatChoices.length ? seatChoices : [2, 6, 8, 9]).map((count) => (
                  <option key={count} value={count}>
                    {count === 2 ? "Heads up" : `${count}-max`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* The house rules. This is the whole reason a club opens its own
              table rather than sending everybody to the public ones. */}
          <div className="flex flex-wrap items-center gap-4">
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

          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy}
              className="btn-accent px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50">
              {busy ? "Opening…" : "Open the table"}
            </button>
            <button type="button" onClick={() => setOpening(false)}
              className="px-2 py-1.5 text-xs text-(--color-text-muted)">
              Cancel
            </button>
          </div>
        </form>
      )}

      {clubTables.length === 0 ? (
        <p className="text-sm text-(--color-text-muted)">
          {isStaff
            ? "None open. A club table is where your house rules live — run it twice, bomb pots."
            : "None open. Somebody who helps run the club can open one."}
        </p>
      ) : (
        <ul className="panel-raised rounded-lg divide-y divide-(--color-border)">
          {clubTables.map((table) => {
            const { blocked, watch, seated } = rowActions(table, balance);
            return (
              <li key={table.id} className="px-3 py-2 flex items-center gap-2 text-xs">
                <span className="font-semibold text-(--color-silver) shrink-0 tabular-nums">
                  {table.stake_label}
                </span>
                <span className="flex-1 min-w-0 truncate text-(--color-text-muted)">
                  {tableSummary(table)}
                  {table.run_it_twice && " · RIT"}
                  {table.bomb_pot_every > 0 && ` · bomb /${table.bomb_pot_every}`}
                </span>
                <span className="shrink-0 tabular-nums text-(--color-text-muted)">
                  {table.taken}/{table.seats}
                </span>
                {seated ? (
                  <button onClick={() => navigate(`/cash/${table.id}`)}
                    className="btn-accent px-2 py-1 rounded text-[11px] font-semibold shrink-0">
                    Back to the table
                  </button>
                ) : (
                  <>
                    {watch && (
                      <button onClick={() => navigate(`/cash/${table.id}`)}
                        className="btn-secondary px-2 py-1 rounded text-[11px] font-semibold shrink-0">
                        Watch
                      </button>
                    )}
                    <button
                      onClick={() => { useCashStore.setState({ error: "" }); setBuyingInto(table); }}
                      disabled={Boolean(blocked)}
                      title={blocked || `Sit down at ${table.name}`}
                      className={`px-2 py-1 rounded text-[11px] font-semibold shrink-0 ${
                        blocked ? "btn-secondary opacity-50 cursor-not-allowed" : "btn-accent"
                      }`}
                    >
                      {blocked || "Sit down"}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-(--color-text-muted) flex items-start gap-1.5">
        <Icon name="coin" className="w-3.5 h-3.5 mt-px shrink-0" />
        The chips are coins, and they settle on every pot rather than at the end
        of the night.
      </p>

      {buyingInto && (
        <SitDownModal
          table={clubTables.find((one) => one.id === buyingInto.id) || buyingInto}
          balance={balance}
          busy={busy}
          error={error}
          onSit={sitDown}
          onClose={() => setBuyingInto(null)}
        />
      )}
    </section>
  );
}

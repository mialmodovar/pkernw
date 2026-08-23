import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Icon from "../icons/Icon";
import useCashStore from "../../store/cashStore";
import useWalletStore from "../../store/walletStore";
import { rowActions, tableSummary } from "./cashTables";
import NewCashTableModal from "./NewCashTableModal";
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
  const { clubTables, fetchClubTables, error } = useCashStore();
  const balance = useWalletStore((s) => s.balance);

  const [opening, setOpening] = useState(false);
  const [buyingInto, setBuyingInto] = useState(null);

  useEffect(() => { fetchClubTables(club.slug); }, [club.slug, fetchClubTables]);

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

      {opening && (
        <NewCashTableModal club={club.slug} onClose={() => setOpening(false)} />
      )}

      {buyingInto && (
        <SitDownModal
          table={clubTables.find((one) => one.id === buyingInto.id) || buyingInto}
          balance={balance}
          error={error}
          onSit={sitDown}
          onClose={() => setBuyingInto(null)}
        />
      )}
    </section>
  );
}

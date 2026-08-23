import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Icon from "../icons/Icon";
import useCashStore from "../../store/cashStore";
import useWalletStore from "../../store/walletStore";
import { atStake, sitBlocker, suggestedBuyIn, tableSummary } from "./cashTables";
import PlayerFaces from "./PlayerFaces";

/**
 * The cash lobby: rooms rather than events.
 *
 * A tournament list reads chronologically because a tournament is a thing that
 * happens at a time. A cash table is a place, so this reads by how busy it is —
 * a game with a chair free is what anybody scanning this is looking for, and a
 * table you are already sitting at is above all of it because that is not a
 * choice, it is where you are.
 */
export default function CashBrowser() {
  const navigate = useNavigate();
  const { stakes, tables, loading, error, fetchLobby, sit, busy } = useCashStore();
  const balance = useWalletStore((s) => s.balance);
  // Which table is mid-buy-in. One at a time: the amount belongs to a table.
  const [buyingInto, setBuyingInto] = useState(null);
  const [amount, setAmount] = useState(0);

  useEffect(() => { fetchLobby(); }, [fetchLobby]);

  // A cash lobby moves without you: seats fill, tables empty. Slower than the
  // tournament list, because nothing here starts without warning.
  useEffect(() => {
    const timer = setInterval(() => fetchLobby({ silent: true }).catch(() => {}), 8000);
    return () => clearInterval(timer);
  }, [fetchLobby]);

  const openBuyIn = (table) => {
    setBuyingInto(table.id);
    setAmount(suggestedBuyIn(table, balance));
  };

  const confirm = async (table) => {
    const seated = await sit(table.id, amount);
    setBuyingInto(null);
    if (seated) navigate(`/cash/${seated}`);
  };

  if (loading && tables.length === 0) {
    return <p className="text-(--color-text-muted)">Loading...</p>;
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-5">
      {stakes.map((stake) => {
        const rows = atStake(tables, stake.key);
        if (rows.length === 0) return null;
        return (
          <section key={stake.key} className="space-y-2">
            <header className="flex items-baseline gap-3">
              <h2 className="text-lg font-bold text-(--color-silver) tabular-nums">
                {stake.label}
              </h2>
              <p className="text-xs text-(--color-text-muted) tabular-nums">
                {stake.min_buy_in}–{stake.max_buy_in} to sit down
              </p>
            </header>

            {rows.map((table) => {
              const blocked = sitBlocker(table, balance);
              const seated = table.my_seat != null;
              return (
                <div key={table.id}
                  className={`panel rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2
                              transition-colors ${
                    seated ? "border-(--color-highlight-edge)" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1 basis-44">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="font-semibold text-sm text-(--color-silver) truncate">
                        {table.name}
                      </h3>
                      {table.club_name && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded panel-raised
                                         text-(--color-text-muted)">
                          {table.club_name}
                        </span>
                      )}
                      {/* What this table does differently, where it does. */}
                      {table.run_it_twice && (
                        <span title="All-in pots are run twice"
                          className="shrink-0 text-[10px] font-semibold text-(--color-highlight-text)">
                          RIT
                        </span>
                      )}
                      {table.bomb_pot_every > 0 && (
                        <span title={`Every ${table.bomb_pot_every} hands, everybody in for ${table.bomb_pot_bb}bb and two boards`}
                          className="shrink-0 text-[10px] font-semibold text-(--color-highlight-text)">
                          Bomb /{table.bomb_pot_every}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-(--color-text-muted) truncate">
                      {tableSummary(table)}
                      {table.taken > 0 && ` · avg ${table.average_stack}`}
                    </p>
                  </div>

                  <PlayerFaces players={table.players.map((one) => ({
                    username: one.username,
                    display_name: one.display_name,
                    avatar_emoji: null,
                    avatar_url: null,
                  }))} />

                  <div className="shrink-0 text-right leading-tight">
                    <div className="text-[9px] uppercase tracking-wider text-(--color-text-muted)">
                      Seats
                    </div>
                    <div className="text-sm font-bold tabular-nums text-(--color-silver)">
                      {table.taken}/{table.seats}
                    </div>
                  </div>

                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    {seated ? (
                      <button onClick={() => navigate(`/cash/${table.id}`)}
                        className="btn-accent px-3 py-1 rounded text-xs font-semibold">
                        Back to the table
                      </button>
                    ) : buyingInto === table.id ? (
                      <>
                        <input
                          type="number"
                          value={amount}
                          min={table.min_buy_in}
                          max={table.max_buy_in}
                          onChange={(event) => setAmount(Number(event.target.value))}
                          className="input-field w-24 text-right text-sm rounded py-1 px-1.5 font-mono"
                        />
                        <button onClick={() => confirm(table)} disabled={busy === table.id}
                          className="btn-accent px-3 py-1 rounded text-xs font-semibold disabled:opacity-50">
                          {busy === table.id ? "…" : "Sit"}
                        </button>
                        <button onClick={() => setBuyingInto(null)}
                          className="px-2 py-1 text-xs text-(--color-text-muted)">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => openBuyIn(table)}
                        disabled={Boolean(blocked)}
                        title={blocked || `Sit down at ${table.name}`}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                          blocked ? "btn-secondary opacity-50 cursor-not-allowed" : "btn-accent"
                        }`}
                      >
                        {blocked || "Sit down"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      {tables.length === 0 && !loading && (
        <p className="text-sm text-(--color-text-muted)">
          No tables running. A club you help run can open one.
        </p>
      )}

      {error && <p className="text-xs text-[#c76b7a]">{error}</p>}

      <p className="text-[11px] text-(--color-text-muted) leading-snug flex items-start gap-1.5">
        <Icon name="coin" className="w-3.5 h-3.5 mt-px" />
        The chips in front of you are coins. Take them off the table whenever you
        like — there is nothing to settle at the end, because it settles on every
        pot.
      </p>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import api from "../../api/http";

const euros = (cents) => `${(Math.abs(cents) / 100).toFixed(2)}€`;

function DebtRow({ username, amountCents, onSettle, busy }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-sm text-(--color-silver) truncate">{username}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold tabular-nums">{euros(amountCents)}</span>
        {onSettle && (
          <button
            onClick={onSettle}
            disabled={busy}
            title={`Mark ${euros(amountCents)} as received from ${username}`}
            className="text-[11px] px-2 py-0.5 rounded border border-(--color-border) text-(--color-text-muted)
                       hover:text-(--color-silver) hover:border-(--color-accent) transition-colors
                       disabled:opacity-40 disabled:cursor-wait"
          >
            Got it
          </button>
        )}
      </div>
    </div>
  );
}

/** Who owes whom, after a night that was played for money.
 *
 * The panel speaks English like the rest of the app; the heading does not. A
 * "calote" is a debt nobody is in a hurry to settle, and the nearest English
 * word for it is a paragraph — so the name stays as the one thing everybody at
 * this table already calls it.
 */
export default function CalotesPanel() {
  const [ledger, setLedger] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/ledger/me/");
      setLedger(data);
    } catch {
      // The lobby stays usable without it; the next visit retries.
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const settle = async (username, amountCents) => {
    if (!window.confirm(`Confirm you have received ${euros(amountCents)} from ${username}?`)) return;
    setBusy(username);
    setError(null);
    try {
      await api.post("/ledger/settlements/", {
        from_username: username,
        amount_eur: amountCents / 100,
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "That could not be recorded.");
    } finally {
      setBusy(null);
    }
  };

  // Nothing was ever at stake for this player — no need for an empty box.
  if (!ledger) return null;
  const { balance_cents: balance, owed_to_me: owedToMe, i_owe: iOwe } = ledger;
  if (!balance && !owedToMe.length && !iOwe.length && !ledger.history.length) return null;

  const positive = balance >= 0;

  return (
    <div className="panel rounded-lg p-4 space-y-3 shadow-lg shadow-black/40">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-(--color-silver) uppercase tracking-wide">Calotes</h2>
        <span className={`text-lg font-bold tabular-nums ${positive ? "text-emerald-400" : "text-(--color-accent)"}`}>
          {positive ? "+" : "−"}{euros(balance)}
        </span>
      </div>

      {owedToMe.length > 0 && (
        <div>
          <p className="text-xs text-(--color-text-muted) mb-0.5">Owed to you</p>
          <div className="divide-y divide-(--color-border)">
            {owedToMe.map((row) => (
              <DebtRow
                key={row.username}
                username={row.username}
                amountCents={row.amount_cents}
                busy={busy === row.username}
                onSettle={() => settle(row.username, row.amount_cents)}
              />
            ))}
          </div>
        </div>
      )}

      {iOwe.length > 0 && (
        <div>
          <p className="text-xs text-(--color-text-muted) mb-0.5">You owe</p>
          <div className="divide-y divide-(--color-border)">
            {iOwe.map((row) => (
              <DebtRow key={row.username} username={row.username} amountCents={row.amount_cents} />
            ))}
          </div>
        </div>
      )}

      {!owedToMe.length && !iOwe.length && (
        <p className="text-xs text-(--color-text-muted)">All square.</p>
      )}

      {error && <p className="text-xs text-(--color-accent)">{error}</p>}
    </div>
  );
}

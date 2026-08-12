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
            Recebi
          </button>
        )}
      </div>
    </div>
  );
}

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
    if (!window.confirm(`Confirmas que recebeste ${euros(amountCents)} de ${username}?`)) return;
    setBusy(username);
    setError(null);
    try {
      await api.post("/ledger/settlements/", {
        from_username: username,
        amount_eur: amountCents / 100,
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível registar.");
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
          <p className="text-xs text-(--color-text-muted) mb-0.5">Devem-te</p>
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
          <p className="text-xs text-(--color-text-muted) mb-0.5">Deves</p>
          <div className="divide-y divide-(--color-border)">
            {iOwe.map((row) => (
              <DebtRow key={row.username} username={row.username} amountCents={row.amount_cents} />
            ))}
          </div>
        </div>
      )}

      {!owedToMe.length && !iOwe.length && (
        <p className="text-xs text-(--color-text-muted)">Estás em dia.</p>
      )}

      {error && <p className="text-xs text-(--color-accent)">{error}</p>}
    </div>
  );
}

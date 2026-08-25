import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { connect, disconnect, onMessage, onStatus, send } from "../api/socket";
import api from "../api/http";
import { CASH } from "../api/paths";
import Icon from "../components/icons/Icon";
import ActionPanel from "../components/game/ActionPanel";
import ConnectionBanner from "../components/game/ConnectionBanner";
import PokerTable from "../components/game/PokerTable";
import ErrorBoundary from "../errors/ErrorBoundary";
import { useCompactLayout } from "../components/game/useCompactLayout";
import useAuthStore from "../store/authStore";
import SitDownModal from "../components/lobby/SitDownModal";
import { waitingLine } from "../components/lobby/cashTables";
import useCashStore from "../store/cashStore";
import useGameStore from "../store/gameStore";
import useWalletStore from "../store/walletStore";

/**
 * A cash table.
 *
 * The felt is the same felt. It has to be: the hands are dealt by the same
 * engine and arrive as the same events, so a component that could tell the two
 * rooms apart would be a component with a reason to behave differently in one
 * of them, and there is no such reason. What is different is everything around
 * the edge — you own your seat, your stack is coins, and you can pick them up
 * and walk out between any two hands.
 */
export default function CashTablePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const compact = useCompactLayout();
  const handleEvent = useGameStore((s) => s.handleEvent);
  const reset = useGameStore((s) => s.reset);
  const players = useGameStore((s) => s.players);
  const cash = useGameStore((s) => s.cash);
  const tableWaiting = useGameStore((s) => s.tableWaiting);
  const balance = useWalletStore((s) => s.balance);
  const { leave, addChips, sitOut, sit, busy, error } = useCashStore();

  const [table, setTable] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [notice, setNotice] = useState("");
  // Open when somebody watching decides they want in. The rail is where most
  // people arrive from, so sitting down has to be possible from here rather
  // than only from the lobby they have already left.
  const [sittingDown, setSittingDown] = useState(false);

  const mySeat = players.find((one) => one.user_id === user?.id)?.seat ?? null;
  const myStack = players.find((one) => one.user_id === user?.id)?.chips ?? 0;
  const sittingOut = Boolean(players.find((one) => one.user_id === user?.id)?.is_sitting_out);

  const loadTable = useCallback(async () => {
    try {
      const { data } = await api.get(`${CASH}/${id}/`);
      setTable(data);
    } catch {
      // The felt still works from the socket's own snapshot; this is only the
      // name, the stakes in words and the buy-in limits.
    }
  }, [id]);

  useEffect(() => {
    reset(`cash-${id}`);
    loadTable();
    connect(id, { kind: "cash" });
    const unsub = onMessage(handleEvent);
    const unsubStatus = onStatus(setStatus);
    return () => { unsub(); unsubStatus(); disconnect(); };
  }, [id, handleEvent, reset, loadTable]);

  const act = (action, amount) => send({ type: "player_action", action, amount });

  // Only while the socket is actually up: a table that cannot be heard from is
  // a connection problem, and the banner above already says so.
  const waiting = status === "open" ? waitingLine(tableWaiting) : "";

  const takeASeat = async (amount, seat) => {
    const seated = await sit(id, amount, seat);
    if (!seated) return;      // the dialog stays up and says why
    setSittingDown(false);
    // The snapshot the socket sends on the next hand carries the new seat, but
    // the header's own buttons come off this row, so it is refetched.
    loadTable();
  };

  const walkAway = async () => {
    const result = await leave(id);
    if (result?.leaving) {
      // Mid-hand: the room pays out the moment it ends, and telling somebody
      // that is better than a button that appears to have done nothing.
      setNotice("You will be cashed out when this hand finishes.");
      return;
    }
    navigate("/");
  };

  const topUp = async () => {
    const room = (table?.max_buy_in || 0) - myStack;
    if (room <= 0) {
      setNotice("You are already at the table maximum.");
      return;
    }
    const added = await addChips(id, Math.min(room, balance ?? 0));
    if (added) setNotice("");
  };

  return (
    <div className="h-full flex flex-col overflow-hidden no-select">
      <ConnectionBanner status={status} onRetry={() => connect(id, { kind: "cash" })} />

      {/* What this room is, and the two things you can do to your own money in
          it. A tournament has none of this: there, your stack is not yours
          until it is over. */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 text-xs
                      border-b border-(--color-border) bg-[rgba(10,7,8,0.6)]">
        <span className="font-semibold text-(--color-silver) truncate">
          {table?.name || "Cash table"}
        </span>
        {table && (
          <span className="text-(--color-text-muted) tabular-nums shrink-0">
            {table.stake_label}
          </span>
        )}
        {cash?.options?.run_it_twice && (
          <span title="All-in pots are run twice"
            className="shrink-0 text-[10px] font-semibold text-(--color-highlight-text)">
            RIT
          </span>
        )}
        {cash?.options?.bomb_pot_every > 0 && (
          <span title={`Every ${cash.options.bomb_pot_every} hands: everybody in, two boards`}
            className="shrink-0 text-[10px] font-semibold text-(--color-highlight-text)">
            Bomb /{cash.options.bomb_pot_every}
          </span>
        )}

        {/* Watching, and able to stop. A rail that cannot sit down is a
            television. */}
        {mySeat == null && (
          <span className="ml-auto flex items-center gap-1.5 shrink-0 text-[10px]
                           font-semibold uppercase tracking-wider text-(--color-text-muted)">
            <Icon name="eye" className="w-3.5 h-3.5" />
            Watching
          </span>
        )}

        {mySeat != null && (
          <span className="ml-auto flex items-center gap-1.5 shrink-0 tabular-nums
                           text-(--color-highlight-text) font-semibold">
            <Icon name="coin" className="w-3.5 h-3.5" />
            {myStack.toLocaleString()}
          </span>
        )}

        {mySeat == null && table && (
          <button
            onClick={() => { useCashStore.setState({ error: "" }); setSittingDown(true); }}
            disabled={(table.taken || 0) >= (table.seats || 0)}
            title={(table.taken || 0) >= (table.seats || 0)
              ? "Every seat is taken"
              : "Take a seat at this table"}
            className="btn-accent px-2 py-1 rounded text-[11px] font-semibold disabled:opacity-50"
          >
            {(table.taken || 0) >= (table.seats || 0) ? "Table full" : "Sit down"}
          </button>
        )}

        {mySeat != null && (
          <>
            <button onClick={topUp}
              title="Bring more coins to your stack, up to the table maximum"
              className="btn-secondary px-2 py-1 rounded text-[11px] font-semibold">
              Add chips
            </button>
            <button onClick={() => sitOut(id, !sittingOut)}
              className="btn-secondary px-2 py-1 rounded text-[11px] font-semibold">
              {sittingOut ? "Sit in" : "Sit out"}
            </button>
            <button onClick={walkAway}
              title="Leave and take your chips. Mid-hand, this happens when it ends."
              className="btn-secondary px-2 py-1 rounded text-[11px] font-semibold">
              Cash out
            </button>
          </>
        )}
        <button onClick={() => navigate("/")}
          className="px-2 py-1 rounded text-[11px] font-semibold text-(--color-text-muted)
                     hover:text-(--color-silver) transition-colors">
          Lobby
        </button>
      </div>

      {notice && (
        <p className="shrink-0 px-3 py-1 text-[11px] text-(--color-highlight-pale)
                      bg-(--color-highlight-dim) border-b border-(--color-highlight-edge)">
          {notice}
        </p>
      )}

      <div className="flex-1 min-h-0 relative table-area">
        {/* Guarded on its own, the same as the tournament felt: a failure to
            draw the table must not take the buttons that play the hand. */}
        <ErrorBoundary label="table">
          <PokerTable mySeat={mySeat} capacity={cash?.seats || table?.seats || 6} />
        </ErrorBoundary>

        {/* A table with nobody to deal to, saying so. It is not a hand that has
            stalled and it is not a connection that has dropped — it is a room
            waiting for somebody to walk into it, and the difference is the
            whole message. */}
        {waiting && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none
                          flex items-center gap-2 px-3 py-1.5 rounded-full
                          bg-[rgba(12,7,18,0.9)] border border-(--color-border-strong)
                          text-xs font-semibold text-(--color-highlight-pale)
                          shadow-lg shadow-black/60">
            <span className="w-1.5 h-1.5 rounded-full bg-(--color-highlight-text) animate-pulse" />
            <span>{waiting}</span>
            {tableWaiting?.seats > 0 && (
              <span className="text-(--color-text-muted) tabular-nums font-normal">
                {tableWaiting.seated}/{tableWaiting.seats} seated
              </span>
            )}
          </div>
        )}

        {!compact && mySeat != null && (
          <div className="absolute bottom-2 right-2 z-20 w-[min(42rem,calc(50%-8rem))]
                          scale-95 origin-bottom-right">
            <ActionPanel mySeat={mySeat} onAction={act} disabled={status !== "open"} />
          </div>
        )}
      </div>

      {sittingDown && table && (
        <SitDownModal
          table={table}
          balance={balance}
          busy={Boolean(busy)}
          error={error}
          onSit={takeASeat}
          onClose={() => setSittingDown(false)}
        />
      )}

      {compact && mySeat != null && (
        <div className="shrink-0 px-1 pb-safe">
          <ActionPanel mySeat={mySeat} onAction={act} disabled={status !== "open"} />
        </div>
      )}
    </div>
  );
}

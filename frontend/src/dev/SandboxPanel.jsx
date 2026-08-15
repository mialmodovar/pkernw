import { useEffect, useRef, useState } from "react";
import useSandboxStore from "./sandboxStore";
import useGameStore from "../store/gameStore";
import useAuthStore from "../store/authStore";
import { buildHands, buildPlayers, chatLine, SEAT_STATES } from "./mockTable";

/** The knobs, in a dialog you can drag anywhere and resize.
 *
 * Deliberately a non-modal `<dialog>` (`show()`, not `showModal()`): a modal one
 * would put a backdrop over the table and swallow every click, and the whole
 * point is to keep poking at the felt while the knobs are open. Because it
 * floats, the page underneath keeps its true full width — what you are looking
 * at is the real layout, not one squeezed by a sidebar.
 *
 * The groups are tabs rather than a stack of sections: one reach, no scrolling
 * past the four groups you are not changing to get to the one you are.
 */

const PANEL_WIDTH = 288;

const TABS = [
  ["table", "Table"],
  ["seats", "Seats"],
  ["hand", "Hand"],
  ["blinds", "Blinds"],
  ["cameras", "Cameras"],
  ["chat", "Chat"],
  ["history", "History"],
  ["overlays", "Overlays"],
];

/** Drag by the header, and stay on screen when the window changes size. */
function useDragPosition() {
  const [pos, setPos] = useState(() => ({
    left: Math.max(8, window.innerWidth - PANEL_WIDTH - 16),
    top: 16,
  }));
  const drag = useRef(null);

  useEffect(() => {
    const clamp = () => setPos((p) => ({
      left: Math.min(p.left, Math.max(8, window.innerWidth - 80)),
      top: Math.min(p.top, Math.max(8, window.innerHeight - 60)),
    }));
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  const onPointerDown = (event) => {
    // Let the buttons in the header be buttons.
    if (event.target.closest("button")) return;
    drag.current = { dx: event.clientX - pos.left, dy: event.clientY - pos.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!drag.current) return;
    setPos({
      left: Math.min(Math.max(0, event.clientX - drag.current.dx), window.innerWidth - 80),
      top: Math.min(Math.max(0, event.clientY - drag.current.dy), window.innerHeight - 60),
    });
  };

  const onPointerUp = (event) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return { pos, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}

const LABEL = "text-[11px] text-(--color-text-muted)";
const FIELD = "input-field rounded px-1.5 py-0.5 text-xs w-full";
const BTN = "btn-secondary px-2 py-1 rounded text-[11px] font-semibold transition-colors";
const NOTE = "text-[10px] text-(--color-text-muted) leading-snug";

function Pane({ id, tab, children }) {
  if (id !== tab) return null;
  return (
    <div role="tabpanel" id={`sandbox-pane-${id}`} aria-labelledby={`sandbox-tab-${id}`}
      className="px-3 py-3 space-y-2">
      {children}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className={LABEL}>{label}</span>
      <span className="w-32 shrink-0">{children}</span>
    </label>
  );
}

function Num({ value, onChange, min, max, step = 1 }) {
  return (
    <input type="number" className={FIELD} value={value} min={min} max={max} step={step}
      onChange={(e) => onChange(Number(e.target.value))} />
  );
}

function Pick({ value, onChange, options }) {
  return (
    <select className={FIELD} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  );
}

function Check({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span className={LABEL}>{label}</span>
    </label>
  );
}

export default function SandboxPanel() {
  const { config, patch, setSeatState, panelOpen, togglePanel, reset, setServerData, hands } =
    useSandboxStore();
  const handleEvent = useGameStore((s) => s.handleEvent);
  const username = useAuthStore((s) => s.user?.username) || "you";
  const dialog = useRef(null);
  const tabStrip = useRef(null);
  const [tab, setTab] = useState("table");
  const { pos, handlers } = useDragPosition();

  // `show()` rather than `showModal()` — see the note at the top of the file.
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (panelOpen && !node.open) node.show();
    if (!panelOpen && node.open) node.close();
  }, [panelOpen]);

  const players = buildPlayers(config, username);
  const seatOptions = [
    ["none", "Nobody"],
    ["hero", "Me"],
    ...players.filter((p) => p.seat !== config.heroSeat).map((p) => [String(p.seat), p.name]),
  ];

  const floodChat = (count) => {
    for (let index = 0; index < count; index += 1) {
      handleEvent({
        type: "chat_message",
        user_id: 900 + (index % 6),
        name: players[index % players.length]?.name || "someone",
        text: chatLine(config, index),
      });
    }
  };

  const floodHistory = (count) =>
    setServerData({ hands: buildHands(config, players, count) });

  // Left/right walk the strip, the way a tab list is expected to behave.
  const onTabKeyDown = (event) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const at = TABS.findIndex(([id]) => id === tab);
    const next = TABS[(at + step + TABS.length) % TABS.length][0];
    setTab(next);
    tabStrip.current?.querySelector(`#sandbox-tab-${next}`)?.focus();
  };

  return (
    <>
      {!panelOpen && (
        <button onClick={togglePanel}
          className="fixed top-2 right-2 z-50 btn-accent px-3 py-1 rounded text-xs font-bold shadow-lg">
          DEV
        </button>
      )}

      {/* `open:flex`, never a plain `flex`: an author `display:flex` would beat
          the user-agent rule that hides a closed dialog, and Hide would stop
          hiding anything. */}
      <dialog
        ref={dialog}
        aria-label="Layout sandbox controls"
        style={{ left: pos.left, top: pos.top }}
        className="fixed right-auto bottom-auto m-0 p-0 z-50 w-72 min-w-56 max-h-[85vh]
                   open:flex open:flex-col panel rounded-xl overflow-hidden resize
                   shadow-2xl shadow-black/70 text-(--color-silver) backdrop:hidden"
      >
        <div
          {...handlers}
          title="Drag to move; drag the bottom-right corner to resize"
          className="shrink-0 panel border-x-0 border-t-0 px-3 py-2
                     flex items-center justify-between gap-2 cursor-move select-none touch-none"
        >
          <span className="text-xs font-bold uppercase tracking-wide text-(--color-silver)">
            Layout sandbox
          </span>
          <div className="flex gap-1.5">
            <button onClick={reset} className={BTN}>Reset</button>
            <button onClick={togglePanel} className={BTN}>Hide</button>
          </div>
        </div>

        <div
          ref={tabStrip}
          role="tablist"
          aria-label="Sandbox groups"
          onKeyDown={onTabKeyDown}
          className="shrink-0 flex flex-wrap gap-1 px-2 py-2 panel border-x-0 border-t-0"
        >
          {TABS.map(([id, label]) => {
            const selected = id === tab;
            return (
              <button
                key={id}
                id={`sandbox-tab-${id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`sandbox-pane-${id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(id)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  selected
                    ? "bg-[linear-gradient(135deg,#d4af37,#8a6c18)] text-[#1a1208]"
                    : "border border-(--color-border) text-(--color-text-muted) hover:text-(--color-silver)"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Pane id="table" tab={tab}>
            <Row label="Players">
              <Num value={config.playerCount} min={2} max={10}
                onChange={(v) => patch({ playerCount: v, heroSeat: Math.min(config.heroSeat, v - 1) })} />
            </Row>
            <Row label="Seats (capacity)">
              <Num value={config.capacity} min={2} max={10} onChange={(v) => patch({ capacity: v })} />
            </Row>
            <Row label="My seat">
              <Num value={config.heroSeat} min={0} max={config.playerCount - 1}
                onChange={(v) => patch({ heroSeat: v })} />
            </Row>
            <Row label="Names">
              <Pick value={config.nameStyle} onChange={(v) => patch({ nameStyle: v })}
                options={[["normal", "Normal"], ["long", "Long / unicode"]]} />
            </Row>
            <Row label="Stacks">
              <Pick value={config.stackSize} onChange={(v) => patch({ stackSize: v })}
                options={[["short", "Short"], ["normal", "Normal"], ["deep", "Millions"]]} />
            </Row>
            <Row label="Active tables">
              <Num value={config.tableCount} min={1} max={12} onChange={(v) => patch({ tableCount: v })} />
            </Row>
            <p className={NOTE}>
              The phone layout keys off the real window width — use the browser's
              device toolbar to see it, not this panel.
            </p>
          </Pane>

          <Pane id="seats" tab={tab}>
            <div className="space-y-1.5">
              {players.map((p) => (
                <label key={p.seat} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 truncate text-[11px] text-(--color-silver)"
                    title={p.name}>
                    {p.seat === config.heroSeat ? `${p.name} (me)` : p.name}
                  </span>
                  <select
                    className={`${FIELD} flex-1`}
                    value={config.seatStates[p.seat] || "active"}
                    onChange={(e) => setSeatState(p.seat, e.target.value)}
                  >
                    {SEAT_STATES.map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </Pane>

          <Pane id="hand" tab={tab}>
            <Row label="Street">
              <Pick value={config.street} onChange={(v) => patch({ street: v })}
                options={[["preflop", "Preflop"], ["flop", "Flop"], ["turn", "Turn"], ["river", "River"]]} />
            </Row>
            <Row label="Pot">
              <Num value={config.pot} min={0} step={100} onChange={(v) => patch({ pot: v })} />
            </Row>
            <Row label="My cards">
              <input className={FIELD} value={config.heroCards}
                onChange={(e) => patch({ heroCards: e.target.value })} />
            </Row>
            <Row label="My hand reads">
              <input className={FIELD} value={config.handStrength}
                onChange={(e) => patch({ handStrength: e.target.value })} />
            </Row>
            <Row label="Action on">
              <Pick value={String(config.actionSeat)} onChange={(v) => patch({ actionSeat: v })}
                options={seatOptions} />
            </Row>
            <Row label="Clock (s)">
            <Num value={config.actionSeconds} min={1} max={120}
              onChange={(v) => patch({ actionSeconds: v })} />
          </Row>
          <Row label="Time bank (s)">
            <Num value={config.timeBankSeconds} min={0} max={120}
              onChange={(v) => patch({ timeBankSeconds: v })} />
          </Row>
          <Row label="Reveal">
              <Pick value={config.reveal} onChange={(v) => patch({ reveal: v })}
                options={[
                  ["none", "Nothing"], ["showdown", "Showdown"],
                  ["winner", "Winner + pot"], ["allin", "All-in equity"],
                ]} />
            </Row>
            <Check label="Chips bet on the felt" value={config.showBets}
              onChange={(v) => patch({ showBets: v })} />
          </Pane>

          <Pane id="blinds" tab={tab}>
            <Row label="Level">
              <Num value={config.levelNumber} min={1} max={30} onChange={(v) => patch({ levelNumber: v })} />
            </Row>
            <Row label="Small blind">
              <Num value={config.smallBlind} min={0} step={25} onChange={(v) => patch({ smallBlind: v })} />
            </Row>
            <Row label="Big blind">
              <Num value={config.bigBlind} min={1} step={50} onChange={(v) => patch({ bigBlind: v })} />
            </Row>
            <Row label="Ante">
              <Num value={config.ante} min={0} step={25} onChange={(v) => patch({ ante: v })} />
            </Row>
            <Row label="Seconds left">
              <Num value={config.levelRemaining} min={0} step={10}
                onChange={(v) => patch({ levelRemaining: v })} />
            </Row>
            <Check label="On a break" value={config.onBreak} onChange={(v) => patch({ onBreak: v })} />
          </Pane>

          <Pane id="cameras" tab={tab}>
            <Row label="Dummy cameras">
              <Pick value={config.cameras} onChange={(v) => patch({ cameras: v })}
                options={[["none", "Off"], ["half", "Every other seat"], ["all", "Everyone"]]} />
            </Row>
            <Check label="Mix in connecting / failed / no picture"
              value={config.cameraFaults} onChange={(v) => patch({ cameraFaults: v })} />
            <Check label="Microphones on the rest"
              value={config.micOnly} onChange={(v) => patch({ micOnly: v })} />
            <p className={NOTE}>
              Canvas streams, not webcams — no device permission is ever requested.
            </p>
          </Pane>

          <Pane id="chat" tab={tab}>
            <Row label="Style">
              <Pick value={config.chatStyle} onChange={(v) => patch({ chatStyle: v })}
                options={[["normal", "Normal"], ["long", "Very long"], ["emoji", "Emoji spam"]]} />
            </Row>
            <div className="flex gap-1.5">
              <button className={BTN} onClick={() => floodChat(10)}>+10</button>
              <button className={BTN} onClick={() => floodChat(60)}>+60</button>
              <button className={BTN} onClick={() => useGameStore.setState({ chat: [] })}>Clear</button>
            </div>
            <Check label="Keep flooding" value={config.chatAuto} onChange={(v) => patch({ chatAuto: v })} />
            {config.chatAuto && (
              <Row label="Every (ms)">
                <Num value={config.chatRate} min={120} step={100} onChange={(v) => patch({ chatRate: v })} />
              </Row>
            )}
          </Pane>

          <Pane id="history" tab={tab}>
            <div className="flex gap-1.5">
              <button className={BTN} onClick={() => floodHistory(5)}>5 hands</button>
              <button className={BTN} onClick={() => floodHistory(40)}>40 hands</button>
              <button className={BTN} onClick={() => setServerData({ hands: [] })}>Empty</button>
            </div>
            <p className={NOTE}>
              {hands == null
                ? "Not generated yet — the Hand history button will say it is loading."
                : `${hands.length} hand${hands.length === 1 ? "" : "s"} behind the Hand history button.`}
            </p>
          </Pane>

          <Pane id="overlays" tab={tab}>
            <Row label="Connection">
              <Pick value={config.connection} onChange={(v) => patch({ connection: v })}
                options={[
                  ["open", "Open"], ["connecting", "Connecting"],
                  ["reconnecting", "Reconnecting"], ["failed", "Failed"],
                ]} />
            </Row>
            <Row label="Countdown (s)">
              <Num value={config.countdown} min={0} max={60} onChange={(v) => patch({ countdown: v })} />
            </Row>
            <Check label="Paused" value={config.paused} onChange={(v) => patch({ paused: v })} />
            <Check label="Host controls row" value={config.hostControls}
              onChange={(v) => patch({ hostControls: v })} />
            <Check label="Table move notice" value={config.moveNotice}
              onChange={(v) => patch({ moveNotice: v })} />
            <Check label="I busted (elimination screen)" value={config.heroOut}
              onChange={(v) => patch({ heroOut: v })} />
            <Check label="Tournament finished (standings)" value={config.finished}
              onChange={(v) => patch({ finished: v })} />
            <p className={NOTE}>
              The elimination screen waits six seconds on purpose, so the hand can
              finish playing out first.
            </p>
          </Pane>
        </div>
      </dialog>
    </>
  );
}

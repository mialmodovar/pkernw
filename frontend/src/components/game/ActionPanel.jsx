import { useState, useEffect, useCallback, useMemo } from "react";
import useGameStore from "../../store/gameStore";
import { formatChips } from "./formatChips";
import { useActionCountdown } from "./useActionCountdown";

// Keyboard shortcuts arm on the first press and commit on the second, so a
// stray keystroke can't fold your hand. The mouse commits immediately.
const SHORTCUT_HINT = { fold: "F", check: "C", call: "C", raise: "R", allin: "A" };

const BTN = "px-4 py-2.5 rounded font-semibold text-sm transition-colors min-w-[6.5rem]";
const ARMED_RING = "ring-2 ring-offset-1 ring-offset-black/40 ring-[#d4af37]";

export default function ActionPanel({ mySeat, onAction, disabled = false }) {
  const { actionOnSeat, actionContext, showBB, level, players } = useGameStore();
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [raiseText, setRaiseText] = useState(null); // non-null only while typing
  const [armed, setArmed] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const countdown = useActionCountdown();

  const bb = level?.big_blind || 0;
  const fmt = (v) => formatChips(v, showBB, bb);
  const useBBControls = showBB && bb > 0;

  const isMyTurn = actionOnSeat === mySeat && actionContext;
  const locked = submitted || disabled;
  const ctx = actionContext || {};
  const minRaise = ctx.min_raise || 0;
  const maxRaise = ctx.max_raise || 0;

  const can = useMemo(() => {
    const valid = ctx.valid_actions || [];
    return {
      fold: valid.includes("fold") && !valid.includes("check"),
      check: valid.includes("check"),
      call: valid.includes("call"),
      // Nothing to size when the only raise left is the whole stack.
      raise: valid.includes("raise") && maxRaise > minRaise,
      allin: valid.includes("raise") && maxRaise > 0,
    };
  }, [ctx.valid_actions, minRaise, maxRaise]);

  // A fresh action_required means a new decision: clear any armed key and
  // re-enable the buttons.
  useEffect(() => {
    setArmed(null);
    setSubmitted(false);
    setRaiseText(null);
  }, [actionContext]);

  useEffect(() => {
    if (isMyTurn && minRaise) setRaiseAmount(minRaise);
  }, [isMyTurn, minRaise]);

  const commit = useCallback((action) => {
    if (submitted || disabled) return;
    setArmed(null);
    setSubmitted(true);
    if (action === "raise") onAction("raise", raiseAmount);
    else if (action === "allin") onAction("raise", maxRaise);
    else onAction(action, 0);
  }, [submitted, disabled, onAction, raiseAmount, maxRaise]);

  useEffect(() => {
    if (!isMyTurn || submitted || disabled) return undefined;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return; // don't fight the raise field
      if (e.key === "Escape") { setArmed(null); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const action = {
        f: "fold",
        c: can.check ? "check" : "call",
        r: "raise",
        a: "allin",
      }[e.key.toLowerCase()];

      if (!action || !can[action]) { setArmed(null); return; }
      e.preventDefault();
      // First press arms, second press of the same key commits.
      if (armed === action) commit(action);
      else setArmed(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMyTurn, submitted, disabled, armed, can, commit]);

  if (!isMyTurn) {
    const waitingOn = players.find((p) => p.seat === actionOnSeat);
    return (
      <div className="panel rounded-lg p-3 text-center text-sm text-(--color-text-muted)">
        {actionOnSeat !== null
          ? `Waiting for ${waitingOn?.name ?? `seat ${actionOnSeat}`}...`
          : "Waiting for next hand..."}
      </div>
    );
  }

  const toChips = (value) => (useBBControls ? Math.round(value * bb) : Math.round(value));
  const fromChips = (chips) => (useBBControls ? Number((chips / bb).toFixed(1)) : chips);
  const clampChips = (chips) => Math.min(Math.max(chips, minRaise), maxRaise);

  const setRaiseFromControl = (value) => {
    setRaiseText(null);
    setRaiseAmount(clampChips(toChips(Number(value))));
  };

  // The text field holds raw input while typing and only clamps on commit, so
  // it doesn't fight you mid-entry.
  const commitRaiseText = () => {
    const n = Number(raiseText);
    if (raiseText !== null && raiseText !== "" && !Number.isNaN(n)) {
      setRaiseAmount(clampChips(toChips(n)));
    }
    setRaiseText(null);
  };

  const inputValue = raiseText !== null ? raiseText : String(fromChips(raiseAmount));
  const sliderStep = useBBControls
    ? 0.1
    : Math.max(1, Math.floor((maxRaise - minRaise) / 20) || 1);

  const presets = ctx.street === "preflop"
    ? [2, 2.5, 3, 4].map((m) => ({ label: `${m}x`, chips: clampChips(Math.round(minRaise * m)) }))
    : [25, 33, 75, 100].map((pct) => ({ label: `${pct}%`, chips: clampChips(Math.round((ctx.pot || 0) * pct / 100)) }));

  const armedLabel = armed && (armed === "allin" ? "All-in" : armed[0].toUpperCase() + armed.slice(1));

  return (
    <div className="panel rounded-lg overflow-hidden">
      {/* Sizing row — kept clear of the commit buttons */}
      {can.raise && (
        <div className="px-3 pt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-(--color-text-muted) whitespace-nowrap">
            {ctx.street === "preflop" ? "Raise to" : "Pot %"}
          </span>
          {presets.map((preset) => (
            <button key={preset.label}
              onClick={() => { setRaiseText(null); setRaiseAmount(preset.chips); }}
              className="btn-secondary px-2 py-1 rounded text-xs font-semibold transition-colors">
              {preset.label}
            </button>
          ))}
          <input type="range"
            min={fromChips(minRaise)}
            max={fromChips(maxRaise)}
            step={sliderStep}
            value={fromChips(raiseAmount)}
            onChange={(e) => setRaiseFromControl(e.target.value)}
            className="flex-1 min-w-24"
          />
          <div className="relative">
            <input type="number"
              value={inputValue}
              onChange={(e) => setRaiseText(e.target.value)}
              onBlur={commitRaiseText}
              onKeyDown={(e) => { if (e.key === "Enter") commitRaiseText(); }}
              className={`input-field text-sm text-right font-mono rounded py-1 ${useBBControls ? "w-24 pr-8 pl-1.5" : "w-24 px-1.5"}`}
            />
            {useBBControls && (
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs font-semibold text-(--color-text-muted)">
                BB
              </span>
            )}
          </div>
          <span className="text-xs text-(--color-text-muted) whitespace-nowrap">
            min {fmt(minRaise)} · max {fmt(maxRaise)}
          </span>
        </div>
      )}

      {/* Timer bar — regular clock first, then the time bank */}
      <div className="h-1.5 bg-black/50 w-full mt-2">
        <div
          className={`h-full transition-all duration-1000 ease-linear ${
            countdown.inTimeBank
              ? "bg-[#8a1c2b]"
              : countdown.displaySeconds != null && countdown.displaySeconds <= 3
              ? "bg-[#b3243a]"
              : "bg-[#c9a227]"
          }`}
          style={{ width: `${countdown.pct}%` }}
        />
      </div>

      <div className="p-3 flex items-center gap-3">
        {/* Clock */}
        <div className="flex flex-col items-center w-14 shrink-0">
          <span className={`text-lg font-bold font-mono ${
            countdown.inTimeBank ? "text-[#c76b7a]" : "text-(--color-silver)"
          }`}>
            {countdown.displaySeconds ?? ""}
          </span>
          {countdown.inTimeBank && (
            <span className="text-[9px] uppercase tracking-wide text-[#c76b7a]">Time bank</span>
          )}
        </div>

        {armed && (
          <span className="text-xs text-[#d9c07a]">
            Press {SHORTCUT_HINT[armed]} again to confirm {armedLabel}
          </span>
        )}

        {/* Commit cluster — the choices sit together, under the mouse */}
        <div className="ml-auto flex items-center gap-2">
          {can.fold && (
            <button onClick={() => commit("fold")} disabled={locked}
              className={`${BTN} bg-[#3a1016] hover:bg-[#4d151d] border border-[rgba(196,178,165,0.2)] text-[#e3cdd1]
                          disabled:opacity-40 disabled:cursor-not-allowed ${armed === "fold" ? ARMED_RING : ""}`}>
              Fold
            </button>
          )}
          {can.check && (
            <button onClick={() => commit("check")} disabled={locked}
              className={`${BTN} btn-secondary disabled:opacity-40 disabled:cursor-not-allowed ${armed === "check" ? ARMED_RING : ""}`}>
              Check
            </button>
          )}
          {can.call && (
            <button onClick={() => commit("call")} disabled={locked}
              className={`${BTN} btn-accent disabled:opacity-40 disabled:cursor-not-allowed ${armed === "call" ? ARMED_RING : ""}`}>
              Call {fmt(ctx.to_call)}
            </button>
          )}
          {can.raise && (
            <button onClick={() => commit("raise")} disabled={locked}
              className={`${BTN} bg-[linear-gradient(135deg,#d4af37,#8a6c18)] hover:bg-[linear-gradient(135deg,#e3c250,#a17c1e)]
                          border border-[#e0c66b] text-[#1a1208]
                          disabled:opacity-40 disabled:cursor-not-allowed ${armed === "raise" ? ARMED_RING : ""}`}>
              Raise {fmt(raiseAmount)}
            </button>
          )}
          {can.allin && (
            <button onClick={() => commit("allin")} disabled={locked}
              className={`${BTN} bg-[#5a1420] hover:bg-[#6e1a28] border border-[#e0c66b] text-[#f0e2d6]
                          disabled:opacity-40 disabled:cursor-not-allowed ${armed === "allin" ? ARMED_RING : ""}`}>
              All-in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo } from "react";
import useGameStore from "../../store/gameStore";
import { formatChips } from "./formatChips";
import { useActionCountdown } from "./useActionCountdown";

// Keyboard shortcuts arm on the first press and commit on the second, so a
// stray keystroke can't fold your hand. The mouse commits immediately.
const SHORTCUT_HINT = { fold: "F", check: "C", call: "C", raise: "R" };

const BTN = "px-2.5 py-1.5 rounded font-semibold text-xs transition-colors min-w-[4.75rem]";
const ARMED_RING = "ring-2 ring-offset-1 ring-offset-black/40 ring-[#d4af37]";

// What you can commit to before the action reaches you. Each one names the
// condition it survives: anything else voids it and hands the decision back.
const PRESELECTS = [
  { key: "fold", label: "Fold" },
  { key: "check", label: "Check" },
  { key: "checkfold", label: "Check/Fold" },
  { key: "callany", label: "Call any" },
];

export default function ActionPanel({ mySeat, onAction, disabled = false, amSittingOut = false, onSitIn }) {
  const { actionOnSeat, actionContext, showBB, level, players, handNumber } = useGameStore();
  const [preselect, setPreselect] = useState(null);
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
      raise: valid.includes("raise"),
    };
  }, [ctx.valid_actions]);

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

  // A pre-selection belongs to the hand it was made in. Carrying one into the
  // next hand would act on cards you have not seen.
  useEffect(() => { setPreselect(null); }, [handNumber]);

  // A pre-selected action fires the moment the turn arrives, but only while it
  // still means what it meant when it was ticked. Somebody raising behind you
  // voids a Check and hands you the decision back rather than guessing.
  useEffect(() => {
    if (!isMyTurn || !preselect || submitted || disabled) return;
    const choice = {
      fold: can.fold ? "fold" : can.check ? "check" : null,
      check: can.check ? "check" : null,
      checkfold: can.check ? "check" : "fold",
      callany: can.call ? "call" : can.check ? "check" : null,
    }[preselect];

    setPreselect(null);
    if (!choice) return;   // no longer applies: you decide
    setSubmitted(true);
    onAction(choice, 0);
  }, [isMyTurn, preselect, submitted, disabled, can, onAction]);

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

      const key = e.key.toLowerCase();
      const action = { f: "fold", c: can.check ? "check" : "call", r: "raise" }[key]
        || (key === "a" && can.raise ? "raise" : undefined);

      if (!action || !can[action]) { setArmed(null); return; }
      e.preventDefault();
      if (key === "a") setRaiseAmount(maxRaise);
      // First press arms, second press of the same key commits.
      if (armed === action) commit(action);
      else setArmed(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMyTurn, submitted, disabled, armed, can, commit, maxRaise]);

  if (!isMyTurn) {
    const waitingOn = players.find((p) => p.seat === actionOnSeat);
    // Sitting out is otherwise invisible from here: the panel would just say
    // "waiting", with nothing explaining why your turns keep passing.
    if (amSittingOut) {
      return (
        <div className="panel rounded-lg p-3 text-center text-sm">
          <p className="text-[#d9c07a] font-semibold">You are sitting out</p>
          <p className="text-(--color-text-muted) text-xs mt-1">
            Your turns pass automatically, and you keep paying blinds and antes.
          </p>
          {onSitIn && (
            <button
              onClick={onSitIn}
              className="btn-accent px-4 py-1.5 rounded font-semibold text-sm transition-colors mt-3"
            >
              Sit back in
            </button>
          )}
        </div>
      );
    }
    const inHand = players.find((p) => p.seat === mySeat && !p.is_folded && !p.is_eliminated);
    return (
      <div className="panel rounded-lg p-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs shadow-lg shadow-black/50">
        <span className="text-(--color-text-muted)">
          {actionOnSeat !== null
            ? `Waiting for ${waitingOn?.name ?? `seat ${actionOnSeat}`}...`
            : "Waiting for next hand..."}
        </span>
        {/* Deciding early only makes sense while you still hold cards. */}
        {inHand && actionOnSeat !== null && (
          <div className="flex items-center gap-2">
            {PRESELECTS.map((option) => (
              <label key={option.key}
                className="flex items-center gap-1.5 text-xs text-(--color-silver) cursor-pointer select-none">
                <input type="checkbox"
                  checked={preselect === option.key}
                  onChange={(e) => setPreselect(e.target.checked ? option.key : null)}
                />
                {option.label}
              </label>
            ))}
          </div>
        )}
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
  // One chip per step. It used to be a twentieth of the whole range, which gave
  // a short slider twenty positions — small drags changed nothing at all, so the
  // amount on the Raise button looked stuck.
  const sliderStep = useBBControls ? 0.1 : 1;

  const presets = [
    ...(ctx.street === "preflop"
      ? [2, 2.5, 3.5].map((bbs) => ({ label: `${bbs}bb`, chips: clampChips(Math.round(bbs * bb)) }))
      : [25, 40, 75].map((pct) => ({ label: `${pct}%`, chips: clampChips(Math.round((ctx.pot || 0) * pct / 100)) }))),
    { label: "All in", chips: maxRaise, emphasis: true },
  ];

  const armedLabel = armed && armed[0].toUpperCase() + armed.slice(1);

  return (
    // It lives in the corner of the felt now, so it is sized to be read at a
    // glance rather than to fill a row.
    <div className="panel rounded-lg overflow-hidden w-full shadow-lg shadow-black/50">
      {/* Sizing row — kept clear of the commit buttons */}
      {can.raise && maxRaise > minRaise && (
        <div className="px-2 pt-2 flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1.5">
          <span className="mr-auto text-xs text-(--color-text-muted) whitespace-nowrap">
            min {fmt(minRaise)} · max {fmt(maxRaise)}
          </span>
          {presets.map((preset) => (
            <button key={preset.label}
              onClick={() => { setRaiseText(null); setRaiseAmount(preset.chips); }}
              className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                preset.emphasis
                  ? "bg-[#5a1420] hover:bg-[#6e1a28] border border-[#e0c66b] text-[#f0e2d6]"
                  : "btn-secondary"
              }`}>
              {preset.label}
            </button>
          ))}
          <input type="range"
            min={fromChips(minRaise)}
            max={fromChips(maxRaise)}
            step={sliderStep}
            value={fromChips(raiseAmount)}
            onChange={(e) => setRaiseFromControl(e.target.value)}
            className="w-24 accent-[#d4af37] cursor-pointer"
          />
          <div className="relative">
            <input type="number"
              value={inputValue}
              onChange={(e) => setRaiseText(e.target.value)}
              onBlur={commitRaiseText}
              onKeyDown={(e) => { if (e.key === "Enter") commitRaiseText(); }}
              className={`input-field text-sm text-right font-mono rounded py-1 ${useBBControls ? "w-20 pr-7 pl-1.5" : "w-20 px-1.5"}`}
            />
            {useBBControls && (
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs font-semibold text-(--color-text-muted)">
                BB
              </span>
            )}
          </div>
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

      <div className="p-2 flex items-center gap-2">
        {/* Clock */}
        <div className="flex flex-col items-center w-10 shrink-0">
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
        <div className="ml-auto flex items-center gap-1.5">
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
        </div>
      </div>
    </div>
  );
}

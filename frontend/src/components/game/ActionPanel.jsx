import { useState, useEffect, useCallback, useMemo } from "react";
import useGameStore from "../../store/gameStore";
import { formatChips } from "./formatChips";
import ShowCardsBar from "./ShowCardsBar";
import { timerToneClass, useActionCountdown } from "./useActionCountdown";

// Keyboard shortcuts arm on the first press and commit on the second, so a
// stray keystroke can't fold your hand. The mouse commits immediately.
const SHORTCUT_HINT = { fold: "F", check: "C", call: "C", raise: "R" };

// The one control anybody aims at under time pressure, so it is the one that
// gets the room: a single row of equal buttons across the whole panel, each
// sized off the window rather than pinned to a pixel count. On a laptop that is
// a comfortable target; on a large screen it grows with everything else instead
// of staying a chip in the corner.
const BTN = "flex-1 min-w-0 rounded-lg font-semibold whitespace-nowrap transition-colors touch-manipulation " +
  "px-[clamp(0.4rem,1.1vw,1.5rem)] py-[clamp(0.55rem,1vw,1rem)] " +
  "text-[clamp(0.8rem,1.05vw,1.15rem)]";
const ARMED_RING = "ring-2 ring-offset-1 ring-offset-black/40 ring-(--color-highlight-bright)";
// Kept on every size now: in a column the slider is short, and a short
// slider is a poor way to move one chip at a time.
const STEPPER = "btn-secondary w-8 shrink-0 rounded text-base font-bold leading-none py-1 touch-manipulation";

// What you can commit to before the action reaches you. Each one names the
// condition it survives: anything else voids it and hands the decision back.
const PRESELECTS = [
  { key: "fold", label: "Fold", hint: "Fold the moment it reaches you" },
  { key: "check", label: "Check", hint: "Check if you can — a bet behind you hands the decision back" },
  { key: "checkfold", label: "Check/Fold", hint: "Check if it is free, fold if it is not" },
  { key: "callany", label: "Call any", hint: "Call whatever it costs when it reaches you" },
];

/**
 * The one thing you have decided to do before your turn arrives.
 *
 * Only ever one of them, which is what was wrong with the tick boxes these
 * replace: a checkbox says "and also", and ticking a second one silently
 * cleared the first. These read as what they are — one choice out of four, the
 * chosen one lit — and the lit one can be pressed again to take it back, which
 * is the one thing a radio group cannot do and this needs.
 */
function PreselectChoice({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Decide before your turn" className="flex flex-wrap items-center gap-1">
      {PRESELECTS.map((option) => {
        const chosen = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={chosen}
            title={chosen ? `${option.hint} — press again to cancel` : option.hint}
            onClick={() => onChange(chosen ? null : option.key)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-semibold
                        transition-colors select-none ${
                          chosen
                            ? "bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deeper))] text-(--color-highlight-ink) border-(--color-highlight-deeper)"
                            : "bg-black/40 text-(--color-text-muted) border-(--color-border) hover:text-(--color-silver) hover:border-(--color-border-strong)"
                        }`}
          >
            {/* The dot is what says "one of these", before the colour does. */}
            <span className={`w-2.5 h-2.5 rounded-full border shrink-0 ${
              chosen ? "border-(--color-highlight-ink) bg-(--color-highlight-ink)" : "border-(--color-text-muted)"
            }`} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ActionPanel({
  mySeat, onAction, disabled = false, amSittingOut = false, onSitIn, bare = false,
}) {
  // `bare` is the form used inside a FloatingPanel, which draws the frame itself.
  const shell = bare ? "" : "panel rounded-lg shadow-lg shadow-black/50";
  const { actionOnSeat, actionContext, showBB, level, players, handNumber, holeCards } = useGameStore();
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
        <div className={`${shell} p-3 text-center text-sm`}>
          <p className="text-(--color-highlight-text) font-semibold">You are sitting out</p>
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
      <div className={`${shell} p-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs`}>
        <span className="text-(--color-text-muted)">
          {actionOnSeat !== null
            ? `Waiting for ${waitingOn?.name ?? `seat ${actionOnSeat}`}...`
            : "Waiting for next hand..."}
        </span>
        {/* Between hands, in the place your hands are already resting: showing
            a card is a decision like any other, and every other one is made
            from this panel rather than from the middle of the felt. */}
        <ShowCardsBar myCards={holeCards} mySeat={mySeat} />
        {/* Deciding early only makes sense while you still hold cards. */}
        {inHand && actionOnSeat !== null && (
          <PreselectChoice value={preselect} onChange={setPreselect} />
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

  // Touch targets for the slider: dragging a 4px rail with a thumb is hopeless.
  const nudge = (direction) => {
    setRaiseText(null);
    setRaiseAmount(clampChips(toChips(fromChips(raiseAmount) + direction * sliderStep)));
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
    // Two blocks side by side rather than stacked: how much, on the left, and
    // what you are doing about it, on the right. Stacked, choosing an amount
    // changed the height of the block above the buttons and moved them under
    // your hand. The phone keeps the stack — a band that narrow has no room
    // for two columns.
    <div className={`${shell} overflow-hidden w-full`}>
      {/* Timer bar — regular clock first, then the time bank. Left exactly
          where it was: a full-width line above the decision. */}
      <div className="h-1.5 bg-black/50 w-full">
        <div
          className={`h-full transition-all duration-1000 ease-linear ${timerToneClass(countdown)}`}
          style={{ width: `${countdown.pct}%` }}
        />
      </div>

      <div className="p-2 flex flex-col md:flex-row md:items-stretch gap-2 md:gap-3">
      {/* How much — on the left, and staying there */}
      {can.raise && maxRaise > minRaise && (
        <div className="flex flex-col justify-center gap-1.5 min-w-0 md:w-[14.5rem] md:shrink-0">
          <span className="text-center md:text-left text-xs text-(--color-text-muted) whitespace-nowrap">
            min {fmt(minRaise)} · max {fmt(maxRaise)}
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {presets.map((preset) => (
              <button key={preset.label}
                onClick={() => { setRaiseText(null); setRaiseAmount(preset.chips); }}
                className={`px-2 py-2 md:py-1 rounded text-xs font-semibold transition-colors touch-manipulation ${
                  preset.emphasis
                    ? "bg-[#5a1420] hover:bg-[#6e1a28] border border-(--color-highlight-text) text-[#f0e2d6]"
                    : "btn-secondary"
                }`}>
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative shrink-0">
              <input type="number"
                value={inputValue}
                onChange={(e) => setRaiseText(e.target.value)}
                onBlur={commitRaiseText}
                onKeyDown={(e) => { if (e.key === "Enter") commitRaiseText(); }}
                // A decimal keypad on a phone. The spinner is gone for every
                // .input-field number input — see index.css.
                inputMode="decimal"
                className={`input-field text-sm text-right font-mono rounded py-1.5 md:py-1 ${useBBControls ? "w-20 pr-7 pl-1.5" : "w-20 px-1.5"}`}
              />
              {useBBControls && (
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs font-semibold text-(--color-text-muted)">
                  BB
                </span>
              )}
            </div>
            <button type="button" onClick={() => nudge(-1)} aria-label="Lower raise" className={STEPPER}>−</button>
            <input type="range"
              min={fromChips(minRaise)}
              max={fromChips(maxRaise)}
              step={sliderStep}
              value={fromChips(raiseAmount)}
              onChange={(e) => setRaiseFromControl(e.target.value)}
              className="flex-1 min-w-0 h-6 md:h-auto accent-(--color-highlight-bright) cursor-pointer touch-manipulation"
            />
            <button type="button" onClick={() => nudge(1)} aria-label="Raise more" className={STEPPER}>+</button>
          </div>
        </div>
      )}

      {/* What you are doing — on the right, taking whatever is left */}
      <div className="flex flex-1 flex-col justify-center gap-1 min-w-0">
        {armed && (
          <span className="truncate text-[11px] text-(--color-highlight-text)">
            Press {SHORTCUT_HINT[armed]} again to confirm {armedLabel}
          </span>
        )}
        <div className="flex items-stretch gap-2">
        {/* Clock */}
        <div className="flex flex-col items-center justify-center w-10 shrink-0">
          <span className={`text-lg font-bold font-mono ${
            countdown.inTimeBank ? "text-[#c76b7a]" : "text-(--color-silver)"
          }`}>
            {countdown.displaySeconds ?? ""}
          </span>
          {countdown.inTimeBank && (
            <span className="text-[9px] uppercase tracking-wide text-[#c76b7a]">Time bank</span>
          )}
        </div>

        {/* Commit cluster — the choices sit together, under the mouse or thumb,
            always on one row: a decision that wraps onto a second line is one
            where the button you meant to press moved while you were reaching
            for it. */}
        <div className="ml-auto flex flex-1 flex-nowrap items-stretch gap-2">
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
              className={`${BTN} grid place-items-center bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deeper))] hover:bg-[linear-gradient(135deg,var(--color-highlight-lift),var(--color-highlight-deep))]
                          border border-(--color-highlight-text) text-[#1a1208]
                          disabled:opacity-40 disabled:cursor-not-allowed ${armed === "raise" ? ARMED_RING : ""}`}>
              {/* The widest this button will ever have to be this hand, drawn
                  invisibly under the real label in the same grid cell. Without
                  it the panel resized on every step of the slider and the
                  controls slid about under the hand dragging them; with it the
                  room for the biggest raise available is taken up front. */}
              <span aria-hidden="true" className="col-start-1 row-start-1 invisible">
                Raise {fmt(maxRaise)}
              </span>
              <span className="col-start-1 row-start-1">Raise {fmt(raiseAmount)}</span>
            </button>
          )}
        </div>
        </div>
      </div>
      </div>
    </div>
  );
}

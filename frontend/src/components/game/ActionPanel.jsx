import { useState, useEffect, useCallback, useMemo } from "react";
import useGameStore from "../../store/gameStore";
import { turnSlots, waitingSlots } from "./actionSlots";
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
//
// The row is a three-column grid rather than a flex row, so the slots are
// exactly equal by construction: sized from their contents, "Call 12,400" was a
// wider target than "Fold" and every button moved when the amount changed, and
// flexing them to fill left two or three pixels of rounding between one face of
// the panel and the other.
const BTN = "w-full min-w-0 rounded-lg font-semibold whitespace-nowrap transition-colors touch-manipulation " +
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
 * cleared the first. These read as what they are — one choice, the chosen one
 * lit — and the lit one can be pressed again to take it back, which is the one
 * thing a radio group cannot do and this needs.
 *
 * Two of them are drawn as full-size buttons standing exactly where the buttons
 * they anticipate will stand; see actionSlots.js. The other two are conditional
 * rather than positional and are drawn small, in the line above, which a turn
 * fills with text and never with a button.
 */
function PreselectButton({ option, chosen, onChange, className = "" }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      title={chosen ? `${option.hint} — press again to cancel` : option.hint}
      onClick={() => onChange(chosen ? null : option.key)}
      className={`${BTN} border ${className} ${
        chosen
          ? "bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deeper))]"
            + " text-(--color-highlight-ink) border-(--color-highlight-deeper)"
          : "bg-black/40 text-(--color-text-muted) border-(--color-border)"
            + " hover:text-(--color-silver) hover:border-(--color-border-strong)"
      }`}
    >
      <span className="flex items-center justify-center gap-1.5">
        {/* The dot is what says "one of these", before the colour does. */}
        <span className={`w-2.5 h-2.5 rounded-full border shrink-0 ${
          chosen ? "border-(--color-highlight-ink) bg-(--color-highlight-ink)" : "border-(--color-text-muted)"
        }`} />
        {option.label}
      </span>
    </button>
  );
}

/** The conditional pre-selections, in the line a turn gives to its hint text. */
function PreselectChips({ value, onChange, keys }) {
  return (
    <>
      {keys.map((key) => {
        const option = PRESELECTS.find((one) => one.key === key);
        const chosen = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={chosen}
            title={chosen ? `${option.hint} — press again to cancel` : option.hint}
            onClick={() => onChange(chosen ? null : option.key)}
            className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold leading-tight
                        transition-colors select-none whitespace-nowrap ${
              chosen
                ? "bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deeper))]"
                  + " text-(--color-highlight-ink) border-(--color-highlight-deeper)"
                : "bg-black/40 text-(--color-text-muted) border-(--color-border)"
                  + " hover:text-(--color-silver) hover:border-(--color-border-strong)"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </>
  );
}

/**
 * The panel's shape, which does not depend on whose turn it is.
 *
 * Both faces are drawn through this, so every part of one lands on the matching
 * part of the other: the same timer strip, the same block on the left, the same
 * line of text above, the same three slots. The width is fixed rather than
 * taken from the contents for the same reason — the panel is pinned to the
 * bottom-right corner of the felt and grows leftwards, so a wider Call button
 * used to push Fold out from under the cursor.
 */
function PanelShell({ shell, timerBar, left, above, clock, slots }) {
  return (
    <div className={`${shell} overflow-hidden w-full md:w-[34rem] lg:w-[46rem] max-w-full`}>
      {/* Timer bar — regular clock first, then the time bank. Left exactly
          where it was: a full-width line above the decision, and drawn empty
          while you wait so the rows below it do not shift up. */}
      <div className="h-1.5 bg-black/50 w-full">{timerBar}</div>

      <div className="p-2 flex flex-col lg:flex-row lg:items-stretch gap-2 lg:gap-3">
        {/* The sizing block's place. While you wait it holds what is happening
            and the offer to show a card — anything but a button that commits,
            because at a turn this is where the raise presets are. */}
        <div className="flex flex-col justify-center gap-1.5 min-w-0 min-h-[4.75rem]
                        lg:w-[14.5rem] lg:shrink-0">
          {left}
        </div>

        {/* Anchored to the bottom rather than centred. The panel is pinned to
            the bottom of the felt and grows upwards, so the last row is the one
            with a fixed distance to the edge of the screen — centring this
            column inside a taller sizing block moved the buttons a few pixels
            up, which is a few pixels of somebody's cursor. */}
        <div className="flex flex-1 flex-col justify-end gap-1 min-w-0">
          {/* One line, always drawn, whether or not there is anything in it. */}
          <div className="h-6 flex items-center justify-end gap-1 overflow-hidden">
            {above}
          </div>

          <div className="flex items-stretch gap-2">
            <div className="flex flex-col items-center justify-center w-10 shrink-0">{clock}</div>
            <div className="grid flex-1 grid-cols-3 items-stretch gap-2">{slots}</div>
          </div>
        </div>
      </div>
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
    const inHand = Boolean(
      players.find((p) => p.seat === mySeat && !p.is_folded && !p.is_eliminated),
    );
    // Deciding early only makes sense while you still hold cards and somebody
    // is still to act.
    const canDecideEarly = inHand && actionOnSeat !== null;
    const cells = waitingSlots({ inHand: canDecideEarly });

    return (
      <PanelShell
        shell={shell}
        left={(
          <>
            <span className="text-xs text-center lg:text-left text-(--color-text-muted)">
              {actionOnSeat !== null
                ? `Waiting for ${waitingOn?.name ?? `seat ${actionOnSeat}`}...`
                : "Waiting for next hand..."}
            </span>
            {/* Between hands, in the place your hands are already resting:
                showing a card is a decision like any other, and every other one
                is made from this panel rather than from the middle of the felt. */}
            <ShowCardsBar myCards={holeCards} mySeat={mySeat} />
          </>
        )}
        above={canDecideEarly && (
          <div role="radiogroup" aria-label="Decide before your turn"
            className="flex items-center gap-1">
            <PreselectChips
              value={preselect}
              onChange={setPreselect}
              keys={["checkfold", "callany"]}
            />
          </div>
        )}
        clock={null}
        slots={cells.map((cell) => {
          if (cell.kind !== "preselect") {
            // Drawn and empty. The slot has to hold its place — that is the
            // whole point — and it must not be pressable, so a cursor waiting
            // over the raise slot has nothing under it to hit.
            return <div key={cell.slot} className={`${BTN} invisible`} aria-hidden="true" />;
          }
          const option = PRESELECTS.find((one) => one.key === cell.preselect);
          return (
            <PreselectButton
              key={cell.slot}
              option={option}
              chosen={preselect === option.key}
              onChange={setPreselect}
            />
          );
        })}
      />
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

  const cells = turnSlots(can);
  // Each slot's button, or an empty one holding its place. Written as a lookup
  // rather than in the JSX below so that the row is unmistakably the same three
  // slots in the same order as the one you were just looking at.
  const buttons = {
    fold: (
      <button key="fold" onClick={() => commit("fold")} disabled={locked}
        className={`${BTN} bg-[#3a1016] hover:bg-[#4d151d] border border-[rgba(196,178,165,0.2)] text-[#e3cdd1]
                    disabled:opacity-40 disabled:cursor-not-allowed ${armed === "fold" ? ARMED_RING : ""}`}>
        Fold
      </button>
    ),
    check: (
      <button key="check" onClick={() => commit("check")} disabled={locked}
        className={`${BTN} btn-secondary disabled:opacity-40 disabled:cursor-not-allowed ${
          armed === "check" ? ARMED_RING : ""}`}>
        Check
      </button>
    ),
    call: (
      <button key="call" onClick={() => commit("call")} disabled={locked}
        className={`${BTN} btn-accent disabled:opacity-40 disabled:cursor-not-allowed ${
          armed === "call" ? ARMED_RING : ""}`}>
        Call {fmt(ctx.to_call)}
      </button>
    ),
    raise: (
      <button key="raise" onClick={() => commit("raise")} disabled={locked}
        className={`${BTN} grid place-items-center bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deeper))] hover:bg-[linear-gradient(135deg,var(--color-highlight-lift),var(--color-highlight-deep))]
                    border border-(--color-highlight-text) text-[#1a1208]
                    disabled:opacity-40 disabled:cursor-not-allowed ${armed === "raise" ? ARMED_RING : ""}`}>
        {/* The widest this button will ever have to be this hand, drawn
            invisibly under the real label in the same grid cell. Without it the
            label wrapped as the slider moved; the slot itself no longer
            resizes, since all three are one width by construction. */}
        <span aria-hidden="true" className="col-start-1 row-start-1 invisible">
          Raise {fmt(maxRaise)}
        </span>
        <span className="col-start-1 row-start-1">Raise {fmt(raiseAmount)}</span>
      </button>
    ),
  };

  return (
    // The same shell the waiting face uses, so that every part of one lands on
    // the matching part of the other. How much, on the left; what you are doing
    // about it, on the right, in three slots that never move.
    <PanelShell
      shell={shell}
      timerBar={(
        <div
          className={`h-full transition-all duration-1000 ease-linear ${timerToneClass(countdown)}`}
          style={{ width: `${countdown.pct}%` }}
        />
      )}
      left={can.raise && maxRaise > minRaise ? (
        <>
          <span className="text-center lg:text-left text-xs text-(--color-text-muted) whitespace-nowrap">
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
        </>
      ) : null}
      above={armed && (
        <span className="truncate text-[11px] text-(--color-highlight-text)">
          Press {SHORTCUT_HINT[armed]} again to confirm {armedLabel}
        </span>
      )}
      clock={(
        <>
          <span className={`text-lg font-bold font-mono ${
            countdown.inTimeBank ? "text-[#c76b7a]" : "text-(--color-silver)"
          }`}>
            {countdown.displaySeconds ?? ""}
          </span>
          {countdown.inTimeBank && (
            <span className="text-[9px] uppercase tracking-wide text-[#c76b7a]">Time bank</span>
          )}
        </>
      )}
      slots={cells.map((cell) => (
        cell.kind === "empty"
          ? <div key={cell.slot} className={`${BTN} invisible`} aria-hidden="true" />
          : buttons[cell.kind]
      ))}
    />
  );
}

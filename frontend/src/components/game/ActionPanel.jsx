import { useState, useEffect, useRef } from "react";
import useGameStore from "../../store/gameStore";

export default function ActionPanel({ mySeat, onAction }) {
  const { actionOnSeat, actionContext, isPaused, showBB, level } = useGameStore();
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [timer, setTimer] = useState(null);
  const timerRef = useRef(null);
  const pausedRef = useRef(isPaused);
  const bb = level?.big_blind || 0;
  const fmt = (v) => showBB && bb > 0 ? `${(v / bb).toFixed(1)} BB` : v?.toLocaleString();
  const useBBControls = showBB && bb > 0;

  const isMyTurn = actionOnSeat === mySeat && actionContext;
  const ctx = actionContext || {};
  const valid = ctx.valid_actions || [];
  const timerSec = ctx.timer_sec || 10;
  const timeBankRemaining = ctx.time_bank_seconds_remaining || 0;

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    if (isMyTurn && ctx.min_raise) setRaiseAmount(ctx.min_raise);
  }, [isMyTurn, ctx.min_raise]);

  // Start / reset countdown when it becomes my turn
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (isMyTurn) {
      setTimer(timerSec);
      timerRef.current = setInterval(() => {
        setTimer((prev) => {
          if (pausedRef.current) return prev;
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTimer(null);
    }

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isMyTurn, timerSec]);

  if (!isMyTurn) {
    return (
      <div className="panel rounded-lg p-3 text-center text-sm text-(--color-text-muted)">
        {actionOnSeat !== null ? `Waiting for seat ${actionOnSeat}...` : "Waiting for next hand..."}
      </div>
    );
  }

  const timerPct = timer != null ? (timer / timerSec) * 100 : 100;
  const timerColor = timer != null && timer <= 3 ? "bg-[#b3243a]" : "bg-[#c9a227]";

  const sliderMin = useBBControls ? (ctx.min_raise || 0) / bb : (ctx.min_raise || 0);
  const sliderMax = useBBControls ? (ctx.max_raise || 0) / bb : (ctx.max_raise || 0);
  const sliderValue = useBBControls ? raiseAmount / bb : raiseAmount;
  const sliderStep = useBBControls
    ? 0.1
    : (ctx.min_raise ? Math.max(1, Math.floor((ctx.max_raise - ctx.min_raise) / 20)) : 1);
  const inputValue = useBBControls ? (raiseAmount / bb).toFixed(1) : raiseAmount;

  const clampRaise = (val) => {
    const n = Number(val);
    if (isNaN(n)) return;
    const chipAmount = useBBControls ? Math.round(n * bb) : n;
    setRaiseAmount(Math.min(Math.max(chipAmount, ctx.min_raise || 0), ctx.max_raise || 0));
  };

  return (
    <div className="panel rounded-lg overflow-hidden">
      {/* Quick raise presets — above timer bar, right-aligned */}
      {valid.includes("raise") && (
        <div className="flex gap-1.5 justify-end px-3 pt-2">
          {ctx.street === "preflop"
            ? [2, 2.5, 3, 4].map((mult) => {
                const val = Math.min(Math.round(ctx.min_raise * mult), ctx.max_raise);
                return (
                  <button key={mult} onClick={() => setRaiseAmount(val)}
                    className="btn-secondary px-2 py-0.5 rounded text-xs font-semibold transition-colors">
                    {mult}x
                  </button>
                );
              })
            : [25, 33, 75, 100].map((pct) => {
                const val = Math.min(Math.max(Math.round(ctx.pot * pct / 100), ctx.min_raise), ctx.max_raise);
                return (
                  <button key={pct} onClick={() => setRaiseAmount(val)}
                    className="btn-secondary px-2 py-0.5 rounded text-xs font-semibold transition-colors">
                    {pct}%
                  </button>
                );
              })
          }
        </div>
      )}

      {/* Timer bar */}
      <div className="h-1.5 bg-black/50 w-full mt-1.5">
        <div
          className={`h-full ${timerColor} transition-all duration-1000 ease-linear`}
          style={{ width: `${timerPct}%` }}
        />
      </div>

      <div className="p-3 flex items-center gap-3">
        {/* Timer number */}
        <span className={`text-lg font-bold font-mono w-8 text-center ${timer != null && timer <= 3 ? "text-[#c76b7a]" : "text-(--color-silver)"}`}>
          {timer != null ? timer : ""}
        </span>
        {timeBankRemaining > 0 && (
          <span className="text-xs text-[#d9c07a] whitespace-nowrap">
            Bank {timeBankRemaining}s
          </span>
        )}

        {valid.includes("fold") && !valid.includes("check") && (
          <button onClick={() => onAction("fold", 0)}
            className="px-4 py-2 rounded font-semibold text-sm bg-[#3a1016] hover:bg-[#4d151d] border border-[rgba(196,178,165,0.2)] text-[#e3cdd1] transition-colors">Fold</button>
        )}
        {valid.includes("check") && (
          <button onClick={() => onAction("check", 0)}
            className="btn-secondary px-4 py-2 rounded font-semibold text-sm transition-colors">Check</button>
        )}
        {valid.includes("call") && (
          <button onClick={() => onAction("call", 0)}
            className="btn-accent px-4 py-2 rounded font-semibold text-sm transition-colors">
            Call {fmt(ctx.to_call)}
          </button>
        )}
        {valid.includes("raise") && (
          <div className="flex items-center gap-2 ml-auto">
            <input type="range"
              min={sliderMin}
              max={sliderMax}
              step={sliderStep}
              value={sliderValue}
              onChange={(e) => clampRaise(e.target.value)}
              className="w-28"
            />
            <div className="relative">
              <input type="number"
                min={sliderMin}
                max={sliderMax}
                step={sliderStep}
                value={inputValue}
                onChange={(e) => clampRaise(e.target.value)}
                onBlur={() => clampRaise(inputValue)}
                className={`input-field text-sm text-right font-mono rounded py-1 ${useBBControls ? "w-24 pr-8 pl-1.5" : "w-20 px-1.5"}`}
              />
              {useBBControls && (
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs font-semibold text-(--color-text-muted)">
                  BB
                </span>
              )}
            </div>
            <button onClick={() => onAction("raise", raiseAmount)}
              className="px-4 py-2 rounded font-semibold text-sm bg-[linear-gradient(135deg,#d4af37,#8a6c18)] hover:bg-[linear-gradient(135deg,#e3c250,#a17c1e)] border border-[#e0c66b] text-[#1a1208] transition-colors">
              Raise
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

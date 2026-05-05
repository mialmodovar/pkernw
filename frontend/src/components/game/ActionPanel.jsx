import { useState, useEffect, useRef } from "react";
import useGameStore from "../../store/gameStore";

export default function ActionPanel({ mySeat, onAction }) {
  const { actionOnSeat, actionContext, showBB, level } = useGameStore();
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [timer, setTimer] = useState(null);
  const timerRef = useRef(null);
  const bb = level?.big_blind || 0;
  const fmt = (v) => showBB && bb > 0 ? `${(v / bb).toFixed(1)} BB` : v?.toLocaleString();
  const useBBControls = showBB && bb > 0;

  const isMyTurn = actionOnSeat === mySeat && actionContext;
  const ctx = actionContext || {};
  const valid = ctx.valid_actions || [];
  const timerSec = ctx.timer_sec || 10;
  const timeBankRemaining = ctx.time_bank_seconds_remaining || 0;

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
      <div className="bg-gray-800 rounded-lg p-3 text-center text-sm text-gray-500">
        {actionOnSeat !== null ? `Waiting for seat ${actionOnSeat}...` : "Waiting for next hand..."}
      </div>
    );
  }

  const timerPct = timer != null ? (timer / timerSec) * 100 : 100;
  const timerColor = timer != null && timer <= 3 ? "bg-red-500" : "bg-green-500";

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
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {/* Quick raise presets — above timer bar, right-aligned */}
      {valid.includes("raise") && (
        <div className="flex gap-1.5 justify-end px-3 pt-2">
          {ctx.street === "preflop"
            ? [2, 2.5, 3, 4].map((mult) => {
                const val = Math.min(Math.round(ctx.min_raise * mult), ctx.max_raise);
                return (
                  <button key={mult} onClick={() => setRaiseAmount(val)}
                    className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-semibold text-gray-300">
                    {mult}x
                  </button>
                );
              })
            : [25, 33, 75, 100].map((pct) => {
                const val = Math.min(Math.max(Math.round(ctx.pot * pct / 100), ctx.min_raise), ctx.max_raise);
                return (
                  <button key={pct} onClick={() => setRaiseAmount(val)}
                    className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-semibold text-gray-300">
                    {pct}%
                  </button>
                );
              })
          }
        </div>
      )}

      {/* Timer bar */}
      <div className="h-1.5 bg-gray-700 w-full mt-1.5">
        <div
          className={`h-full ${timerColor} transition-all duration-1000 ease-linear`}
          style={{ width: `${timerPct}%` }}
        />
      </div>

      <div className="p-3 flex items-center gap-3">
        {/* Timer number */}
        <span className={`text-lg font-bold font-mono w-8 text-center ${timer != null && timer <= 3 ? "text-red-400" : "text-gray-300"}`}>
          {timer != null ? timer : ""}
        </span>
        {timeBankRemaining > 0 && (
          <span className="text-xs text-blue-300 whitespace-nowrap">
            Bank {timeBankRemaining}s
          </span>
        )}

        {valid.includes("fold") && !valid.includes("check") && (
          <button onClick={() => onAction("fold", 0)}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded font-semibold text-sm">Fold</button>
        )}
        {valid.includes("check") && (
          <button onClick={() => onAction("check", 0)}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded font-semibold text-sm">Check</button>
        )}
        {valid.includes("call") && (
          <button onClick={() => onAction("call", 0)}
            className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded font-semibold text-sm">
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
                className={`text-sm text-right font-mono bg-gray-700 border border-gray-600 rounded py-1 text-white ${useBBControls ? "w-24 pr-8 pl-1.5" : "w-20 px-1.5"}`}
              />
              {useBBControls && (
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs font-semibold text-gray-300">
                  BB
                </span>
              )}
            </div>
            <button onClick={() => onAction("raise", raiseAmount)}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded font-semibold text-sm">
              Raise
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import Icon from "../icons/Icon";
import { MODES } from "./modes";

/**
 * What there is to play, before anybody has to guess.
 *
 * Three tabs is not obvious from looking at three tabs, and the difference
 * between them is minutes versus an evening — which is the thing a new player
 * actually wants to know. One card each, and then the lobby.
 */
export default function ModesStep({ onDone }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-(--color-text-muted) leading-snug">
        Three ways to play, all of them in the lobby.
      </p>

      <div className="space-y-2">
        {MODES.map((mode) => (
          <div key={mode.key} className="panel-raised rounded-lg p-3 flex gap-3">
            <Icon name={mode.icon} className="w-7 h-7 mt-0.5" tone="gold" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-(--color-silver)">
                {mode.label}
                <span className="ml-2 text-[11px] font-normal text-(--color-highlight-text)">
                  {mode.detail}
                </span>
              </p>
              <p className="text-xs text-(--color-text-muted) leading-snug mt-0.5">{mode.blurb}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onDone}
        className="btn-accent w-full py-2 rounded font-semibold transition-colors"
      >
        Start playing
      </button>
    </div>
  );
}

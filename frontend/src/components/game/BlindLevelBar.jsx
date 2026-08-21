import useGameStore from "../../store/gameStore";
import { levelIsEnding, levelRemainingLabel, useLevelCountdown } from "./useLevelCountdown";

/**
 * How the table reads out, and whether it makes a noise.
 *
 * Drawn down in the table row beside Sit out rather than up here beside your
 * avatar: both of these change what the felt does, as everything else in that
 * row does. Up here they sat among things about you.
 */
export function DisplayToggles() {
  const showBB = useGameStore((s) => s.showBB);
  const toggleBB = useGameStore((s) => s.toggleBB);
  const soundEnabled = useGameStore((s) => s.soundEnabled);
  const toggleSound = useGameStore((s) => s.toggleSound);

  return (
    <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
      <span className="hidden lg:inline text-xs text-(--color-text-muted)">Show</span>
      <div className="flex rounded overflow-hidden border border-(--color-border)">
        {[["Chips", false], ["BB", true]].map(([label, value]) => (
          <button
            key={label}
            onClick={() => { if (showBB !== value) toggleBB(); }}
            className={`px-2 py-0.5 text-xs font-semibold transition-colors ${
              showBB === value
                ? "bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deeper))] text-(--color-highlight-ink)"
                : "text-(--color-text-muted) hover:text-(--color-silver)"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        onClick={toggleSound}
        title={soundEnabled ? "Turn alert sound on (click to mute)" : "Turn alert sound muted"}
        aria-label={soundEnabled ? "Mute turn alert" : "Unmute turn alert"}
        className="btn-secondary px-2 py-0.5 rounded text-xs font-semibold transition-colors"
      >
        {soundEnabled ? "\u{1F509}" : "\u{1F507}"}
        <span className="hidden lg:inline">{soundEnabled ? " Sound" : " Muted"}</span>
      </button>
    </div>
  );
}

/** Which tournament this is, in the corner. Easy to forget you are in two. */
function TournamentName({ name }) {
  if (!name) return null;
  return (
    <span
      className="max-w-[8rem] md:max-w-[16rem] truncate font-semibold text-(--color-highlight-text)"
      title={name}
    >
      {name}
    </span>
  );
}

/**
 * How long this level has left, beside the level it belongs to.
 *
 * It used to sit at the far end of the bar, past the avatar, which put the
 * question ("when do the blinds go up?") and its answer at opposite corners of
 * the screen — and in a Spin n Go, where the levels are minutes long and the
 * blinds climb fast, the number nobody could find was the one that decides
 * whether you have time to wait for a hand. Reading the two together is the
 * whole point, so they are one group now.
 *
 * What is left, not what has gone: a timed level says how long you have, and a
 * level counted in hands answers the same question in its own units rather than
 * making you subtract. The tally stays in the tooltip.
 */
function LevelClock({ level, remaining }) {
  const label = levelRemainingLabel(level, remaining);
  if (!label) return null;

  const isTimed = level.duration_minutes != null;
  const urgent = levelIsEnding(level, remaining);

  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 font-mono font-semibold tabular-nums
                  border border-(--color-border) ${
        urgent ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
      }`}
      title={
        isTimed
          ? "Time until the blinds go up"
          : `Hand ${level.hands_in_level || 0} of ${level.duration_hands} — until the blinds go up`
      }
    >
      {label}
    </span>
  );
}

export default function BlindLevelBar({ name = null, controls = null }) {
  const level = useGameStore((s) => s.level);
  const remaining = useLevelCountdown();

  if (!level) {
    return (
      <div className="panel px-2 md:px-4 py-1.5 md:py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs md:text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
        <TournamentName name={name} />
          <span className="text-(--color-text-muted)">Waiting for level info...</span>
          {controls}
        </div>
      </div>
    );
  }

  const isBreak = Boolean(level.is_break);

  return (
    <div className="panel px-2 md:px-4 py-1.5 md:py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs md:text-sm">
      {/* Pausing and skipping a level are things you do to the clock, so they
          sit with it rather than on a row of their own. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
        <TournamentName name={name} />
        <span className="text-(--color-silver)">
          {isBreak
            ? `Break after level ${level.blind_level_number || 0}`
            : `Level ${level.blind_level_number || 1} - SB ${level.small_blind} / BB ${level.big_blind}`}
          {!isBreak && level.ante > 0 && <> / Ante {level.ante}</>}
        </span>
        <LevelClock level={level} remaining={remaining} />
        {controls}
      </div>
    </div>
  );
}

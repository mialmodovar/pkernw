import { useEffect, useState } from "react";

import Icon from "../icons/Icon";
import useMissionStore from "../../store/missionStore";
import {
  PERIODS, barPct, claimableCount, forPeriod, headline, periodSummary, progressLabel,
  resetNote,
  unclaimedCoins,
} from "./missions";

/**
 * Coins for playing, rather than for logging in.
 *
 * The daily claim is a faucet: press a button, money appears. These are the
 * other kind — a reason to open a game rather than a reason to open the app.
 * Both instant formats count, because a mission that can only be finished in
 * one of them is a mission telling somebody which one to play.
 *
 * Collapsed to a line and a number until there is something to collect, at
 * which point it says so and opens itself. A panel of six progress bars in a
 * sidebar somebody is scanning for a game is six bars in the way.
 */
export default function MissionPanel() {
  const {
    missions, fetchMissions, claim, claiming, error, loaded, reachable,
  } = useMissionStore();
  const [open, setOpen] = useState(false);
  const waiting = claimableCount(missions);

  useEffect(() => { fetchMissions(); }, [fetchMissions]);

  // Opens itself the first time there is money in it, and does not close
  // itself again — somebody who shut it meant to shut it.
  useEffect(() => {
    if (waiting > 0) setOpen(true);
  }, [waiting > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nothing at all while the first answer is on its way — but if it never
  // arrives, say so. Vanishing silently is what made a wrong URL look like a
  // feature that had never been built.
  if (!missions.length) {
    if (loaded || reachable) return null;
    return (
      <div className="panel rounded-lg p-4 shadow-lg shadow-black/40">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-(--color-silver)">
            Missions
          </h2>
          <button
            type="button"
            onClick={() => fetchMissions()}
            className="text-[11px] font-semibold text-(--color-text-muted)
                       hover:text-(--color-silver) transition-colors"
          >
            Try again
          </button>
        </div>
        <p className="mt-1 text-[11px] text-(--color-text-muted)">
          Could not load them just now.
        </p>
      </div>
    );
  }

  return (
    <div className="panel rounded-lg p-4 space-y-3 shadow-lg shadow-black/40">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide
                     text-(--color-silver) hover:text-(--color-highlight-text) transition-colors"
        >
          <span className={`text-[10px] leading-none transition-transform ${open ? "rotate-90" : ""}`}
            aria-hidden="true">
            ▶
          </span>
          Missions
        </button>

        {waiting > 0 && (
          <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold
                           bg-(--color-highlight-dim) border border-(--color-highlight-edge)
                           text-(--color-highlight-pale) animate-pulse-soft tabular-nums">
            <Icon name="coin" className="w-3 h-3" />
            {unclaimedCoins(missions).toLocaleString()}
          </span>
        )}
      </div>

      {/* The one line most people will ever read of this. It says the thing
          worth acting on — coins sitting there, or how much is still on offer
          today — rather than a score. */}
      <p className={`text-[11px] ${
        waiting > 0 ? "text-(--color-highlight-text) font-semibold" : "text-(--color-text-muted)"
      }`}>
        {headline(missions)}
      </p>

      {open && (
        <p className="text-[11px] text-(--color-text-muted) leading-snug">
          Coins for playing rather than for turning up. Both instant formats
          count.
        </p>
      )}

      {open && PERIODS.map((period) => (
        <section key={period.key} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-(--color-text-muted)">
              {period.label}
            </h3>
            {/* When it turns over, on the reader's own clock — the server
                counts these in UTC, and "midnight" is not midnight for most
                people reading it. */}
            <span title={resetNote(period.key)} className="text-[10px] text-(--color-text-muted)">
              {periodSummary(missions, period.key)}
            </span>
          </div>

          {forPeriod(missions, period.key).map((mission) => (
            <div
              key={mission.key}
              className={`rounded-md px-2 py-1.5 border transition-colors ${
                mission.claimable
                  ? "border-(--color-highlight-edge) bg-(--color-highlight-dim)"
                  : "border-(--color-border) panel-raised"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                {/* The label is three words; what actually counts takes a
                    sentence, and guessing at it was the complaint. On its own
                    line under the name rather than in a `title` nobody hovers
                    on a phone — and the tooltip carries the long form for
                    anybody who does. */}
                <span
                  title={mission.detail || mission.blurb}
                  className={`text-xs truncate ${
                    mission.claimed ? "text-(--color-text-muted) line-through" : "text-(--color-silver)"
                  }`}
                >
                  {mission.label}
                </span>

                {mission.claimable ? (
                  <button
                    type="button"
                    disabled={claiming === mission.key}
                    onClick={() => claim(mission.key)}
                    className="btn-accent shrink-0 rounded px-2 py-0.5 text-[11px] font-bold
                               tabular-nums disabled:opacity-50"
                  >
                    {claiming === mission.key ? "…" : `+${mission.coins}`}
                  </button>
                ) : (
                  <span className={`shrink-0 flex items-center gap-1 text-[11px] tabular-nums ${
                    mission.claimed ? "text-(--color-text-muted)" : "text-(--color-highlight-text)"
                  }`}>
                    <Icon name="coin" className="w-3 h-3" />
                    {mission.coins}
                  </span>
                )}
              </div>

              {/* What counts, said plainly. Gone once the coins are in: a
                  finished mission has nothing left to explain. */}
              {!mission.claimed && (
                <p className="mt-0.5 text-[10px] leading-snug text-(--color-text-muted)">
                  {mission.blurb}
                </p>
              )}

              {/* The bar, and what it is a bar of. Gone once the coins are in:
                  a full bar on a finished mission is a row still asking to be
                  read. */}
              {!mission.claimed && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="flex-1 h-1 rounded-full overflow-hidden bg-black/40
                                   border border-(--color-border)">
                    <span
                      className="block h-full transition-all duration-500"
                      style={{
                        width: `${barPct(mission)}%`,
                        background: mission.done
                          ? "var(--color-highlight-bright)"
                          : "linear-gradient(90deg, #4a0f18, var(--color-accent))",
                      }}
                    />
                  </span>
                  <span className="text-[10px] text-(--color-text-muted) tabular-nums shrink-0">
                    {progressLabel(mission)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </section>
      ))}

      {error && <p className="text-[11px] text-[#c76b7a]">{error}</p>}
    </div>
  );
}

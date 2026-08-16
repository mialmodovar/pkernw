/**
 * The presets the scoring editor offers, and a sentence describing a scheme.
 *
 * The numbers here mirror `backend/clubs/scoring.py` — the server is the
 * authority on what a table is worth, and this is only what the editor starts
 * from. Keep the two in step; a preset that disagrees would show one thing and
 * score another.
 */

export const PRESETS = {
  placement_only: {
    label: "Placement only",
    preset: "placement_only",
    placement: [10, 7, 5, 3, 2],
    rest: 1,
    per_knockout: 0,
    attendance: 0,
  },
  placement_ko: {
    label: "Placement + knockouts",
    preset: "placement_ko",
    placement: [10, 7, 5, 3, 2],
    rest: 1,
    per_knockout: 2,
    attendance: 1,
  },
};

export const PRESET_NAMES = ["placement_only", "placement_ko"];

/** What this scheme means, in a sentence somebody can check at a glance. */
export function describeScheme(scheme) {
  if (!scheme) return "";
  const places = (scheme.placement || []).slice(0, 5).join("/");
  const parts = [`${places} down the places, ${scheme.rest} for the rest`];
  if (scheme.per_knockout > 0) parts.push(`${scheme.per_knockout} per knockout`);
  if (scheme.attendance > 0) parts.push(`${scheme.attendance} for turning up`);
  return `${parts.join(", ")}.`;
}

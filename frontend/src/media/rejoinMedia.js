/**
 * Turning the camera back on after a reload, and only then.
 *
 * Nothing about the devices is remembered between sessions, and that stays
 * true: a microphone that turns itself on tomorrow leaks more than a bad tell.
 * What was wrong is narrower — pressing reload at a table dropped a camera that
 * was on a second ago, and turning it back on is two clicks and a permission
 * dialogue the browser has already been through.
 *
 * So it is remembered in sessionStorage, which is exactly the lifetime wanted:
 * it survives a reload of this tab and dies with the tab. A new session starts
 * with nothing, because there is nothing there.
 *
 * And it is only ever acted on when the browser already says the permission is
 * granted. Restoring must not be able to raise a prompt: a page that asks for
 * your camera on load, for a reason you cannot see, is the surprise this whole
 * rule exists to avoid.
 */

const KEY = "poker.media.session";

/** What to write down when somebody turns a device on or off. */
export function remember(state, { at } = {}) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({
      table: state.table || "",
      cameraOn: Boolean(state.cameraOn),
      micOn: Boolean(state.micOn),
      at: at ?? Date.now(),
    }));
  } catch {
    // Private mode, or a full quota. Not remembering is the old behaviour and
    // is no worse than it was.
  }
}

export function forget() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do about it, and nothing depends on it.
  }
}

export function stored() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

/**
 * What to turn back on at this table, or null for nothing.
 *
 * The table has to match: a camera you had on at one table is not consent to
 * open it at another one, and a reload is the only thing this is for. `granted`
 * is what the browser says about the permission — without it, nothing is
 * restored, because asking would be the surprise.
 */
export function toRestore(saved, { table, granted }) {
  if (!saved || !granted) return null;
  if (!saved.table || saved.table !== table) return null;
  if (!saved.cameraOn && !saved.micOn) return null;
  return { audio: Boolean(saved.micOn), video: Boolean(saved.cameraOn) };
}

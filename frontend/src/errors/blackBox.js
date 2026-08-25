/**
 * The last few minutes before the tab died.
 *
 * A renderer that is killed — "Aw, Snap", a numbered error code, the page
 * simply gone — takes its console, its network panel and every breakpoint with
 * it. There is nothing to read afterwards and nothing reached the server, so
 * the report we get is a player saying it happened again. That is the whole
 * reason this exists.
 *
 * sessionStorage is the one place a note survives it: it belongs to the tab
 * rather than the process, so a reading written twenty seconds before the crash
 * is still there when the tab reloads itself. So the page writes down what it
 * is holding, over and over, and throws away all but the last few minutes.
 *
 * What it records is chosen to answer one question — what was growing? A
 * browser is killed for holding too much, and the things this page can hold too
 * much of are peer connections, video elements and heap. Counting the peer
 * connections it has ever OPENED matters more than counting the ones it has
 * open: a table that quietly opens and closes one every few seconds looks
 * perfectly healthy in a snapshot and is the thing that kills the tab.
 */

// The run happening now, and — kept apart from it — the record of a run that
// died. They have to be two keys: this run starts writing the moment the page
// loads, and it must not write over the evidence it was loaded to explain.
const KEY = "poker.blackbox";
const CRASH_KEY = "poker.blackbox.crash";
const ALIVE_KEY = "poker.blackbox.alive";
// Twenty seconds apart, twenty of them: the last seven minutes, which is long
// enough to show a trend and short enough to stay well inside the quota.
export const SAMPLE_MS = 20_000;
const SAMPLES = 20;

const MB = 1024 * 1024;

const read = (key) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Private mode or a full quota. Nothing here is worth failing over.
  }
};

const drop = (key) => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // As above.
  }
};

const parse = (key) => {
  try {
    const raw = JSON.parse(read(key) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

/** Everything this run has written down, oldest first. */
export function samples() {
  return parse(KEY);
}

/** The last few minutes of a run that was killed, if the last one was. */
export function crashSamples() {
  return parse(CRASH_KEY);
}

/** Said, and done with — the notice is shown once. */
export function forgetCrash() {
  drop(CRASH_KEY);
}

/**
 * What the page is holding right now.
 *
 * `sources` is injected so this can be tested and so nothing in here has to
 * import the media layer — the recorder must not be a reason the media layer
 * stays alive in memory.
 */
export function takeSample(sources = {}, now = Date.now()) {
  const {
    media = () => ({}),
    documentRef = typeof document === "undefined" ? null : document,
    perf = typeof performance === "undefined" ? null : performance,
    locationRef = typeof location === "undefined" ? null : location,
  } = sources;

  const vitals = media() || {};
  const heap = perf?.memory || null;

  return {
    at: new Date(now).toISOString(),
    // Which table, so a crash can be tied to a game rather than to "the app".
    path: locationRef?.pathname || "",
    hidden: Boolean(documentRef?.hidden),
    // Connections open at this instant…
    peers: vitals.open ?? null,
    // …and every one this page has ever opened. The difference between the two
    // is the whole diagnosis: a steady 7 open against a created count climbing
    // into the hundreds is a table churning connections, not a table with
    // seven cameras on it.
    pcOpened: vitals.created ?? null,
    pcClosed: vitals.closed ?? null,
    iceRestarts: vitals.iceRestarts ?? null,
    // Connections the rate limit refused. Anything above zero is the backstop
    // catching something, and names the crash before it happens.
    refused: vitals.refused ?? null,
    // Decoders, near enough: one live <video> is one video being decoded.
    videos: documentRef?.querySelectorAll?.("video").length ?? null,
    // Chrome only, and JS heap only — a renderer is usually killed over native
    // memory rather than this. Worth having anyway: a heap climbing without
    // pause says the leak is in our own objects rather than in the pipeline.
    heapMB: heap ? Math.round(heap.usedJSHeapSize / MB) : null,
    heapCapMB: heap ? Math.round(heap.jsHeapSizeLimit / MB) : null,
  };
}

/** Write one down, keeping only the last few minutes. */
export function record(sources, now = Date.now()) {
  const sample = takeSample(sources, now);
  write(KEY, JSON.stringify([...samples(), sample].slice(-SAMPLES)));
  return sample;
}

/**
 * Did the last run of this tab end properly?
 *
 * A reload, a closed tab and a navigation all fire `pagehide`, and that is what
 * clears the flag. A renderer that is killed fires nothing — so a flag still
 * standing at the next load means the tab died where it stood, and that is when
 * the run's record is set aside as a crash. This is the one signal the file
 * exists to produce, and no other part of the app can produce it.
 */
export function endedBadly() {
  return read(CRASH_KEY) != null;
}

/** What to show somebody whose tab has just been killed. */
export function crashSummary(entries = crashSamples()) {
  const last = entries[entries.length - 1];
  if (!last) return null;
  const first = entries[0];
  return {
    at: last.at,
    path: last.path,
    peers: last.peers,
    // How hard the connections were churning over the window we have. This is
    // the number that names the cause.
    openedOverWindow: first == null || last.pcOpened == null || first.pcOpened == null
      ? null
      : last.pcOpened - first.pcOpened,
    minutes: first && last
      ? Math.max(1, Math.round((Date.parse(last.at) - Date.parse(first.at)) / 60_000))
      : null,
    heapMB: last.heapMB,
  };
}

/** The whole record, as something a player can paste into a message. */
export function blackBoxReport(entries = samples()) {
  if (!entries.length) return "";
  const head = [
    `agent: ${typeof navigator === "undefined" ? "" : navigator.userAgent}`,
    `cores: ${typeof navigator === "undefined" ? "" : navigator.hardwareConcurrency}`,
    `device memory: ${typeof navigator === "undefined" ? "" : navigator.deviceMemory || "?"} GB`,
    `build: ${typeof __BUILD_STAMP__ === "undefined" ? "" : __BUILD_STAMP__}`,
    "",
    "time                 peers  opened  closed  ice  refused  videos  heapMB  path",
  ];
  const rows = entries.map((one) => [
    one.at.slice(11, 19).padEnd(20),
    String(one.peers ?? "-").padStart(5),
    String(one.pcOpened ?? "-").padStart(7),
    String(one.pcClosed ?? "-").padStart(7),
    String(one.iceRestarts ?? "-").padStart(4),
    String(one.refused ?? "-").padStart(8),
    String(one.videos ?? "-").padStart(7),
    String(one.heapMB ?? "-").padStart(7),
    `  ${one.path}${one.hidden ? " (hidden)" : ""}`,
  ].join(""));
  return [...head, ...rows].join("\n");
}

/**
 * Start recording.
 *
 * Returns the stop function, and marks the tab as running until something
 * orderly happens to it.
 */
export function startBlackBox(sources = {}, { interval = SAMPLE_MS } = {}) {
  // First, before anything of this run is written: was the last run still
  // marked as running? Then it never got to say goodbye, and what it had
  // written is the only account of how it died. Keep it; start our own afresh.
  if (read(ALIVE_KEY) === "1") write(CRASH_KEY, read(KEY) || "[]");
  else drop(CRASH_KEY);
  drop(KEY);
  write(ALIVE_KEY, "1");
  record(sources);
  const timer = setInterval(() => record(sources), interval);

  // Whatever ends the tab properly clears the flag. pagehide covers the reload,
  // the close and the navigation, and is the one event mobile Safari reliably
  // fires; visibilitychange is the belt to its braces on iOS, where a tab can
  // be discarded without ever hiding first.
  const settle = () => {
    record(sources);
    drop(ALIVE_KEY);
  };
  const onHide = () => {
    if (document.visibilityState === "hidden") record(sources);
  };
  window.addEventListener("pagehide", settle);
  document.addEventListener("visibilitychange", onHide);

  return () => {
    clearInterval(timer);
    window.removeEventListener("pagehide", settle);
    document.removeEventListener("visibilitychange", onHide);
    drop(ALIVE_KEY);
  };
}

/**
 * Turn the icon set into review cards.
 *
 * The paths live in one place (src/components/icons/glyphs.js) and are drawn in
 * two: the app, and a Claude Design project where they can be looked at side by
 * side and argued about. This writes the second from the first, so a glyph that
 * changes cannot leave a stale picture of itself behind.
 *
 *   node scripts/build-icon-preview.mjs <outDir>
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { GLYPHS, VIEWBOX } from "../src/components/icons/glyphs.js";

// The groups the Design System pane shows, and what belongs in each. Written
// out rather than derived: this is the order somebody reads them in.
const GROUPS = [
  { key: "modes", title: "Game modes", names: ["trophy", "spin", "duel", "shove"] },
  { key: "money", title: "Money & prizes", names: ["coin", "medal-1", "medal-2", "medal-3", "envelope"] },
  { key: "navigation", title: "Navigation", names: ["brand", "home", "clubs", "ledger", "stats", "eye", "logout"] },
  { key: "actions", title: "Actions", names: ["check", "close", "tools"] },
];

const PAGE_CSS = `
  :root {
    color-scheme: dark;
    --bg: #16090c;
    --panel: rgba(56, 34, 38, 0.55);
    --border: rgba(196, 178, 165, 0.2);
    --silver: #c9c3bd;
    --muted: #9c9490;
    --gold: #d4af36;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px;
    background: var(--bg); color: var(--silver);
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  h1 { font-size: 17px; letter-spacing: .04em; margin: 0 0 4px; }
  p.lede { color: var(--muted); font-size: 12px; margin: 0 0 22px; max-width: 62ch; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 12px; }
  .cell {
    background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
    padding: 14px 10px 10px; text-align: center;
  }
  .row { display: flex; align-items: flex-end; justify-content: center; gap: 12px; min-height: 46px; }
  .name { margin-top: 10px; font-size: 11px; color: var(--muted); font-family: ui-monospace, monospace; }
  .label { font-size: 12px; color: var(--silver); }
  .gold { color: var(--gold); }
  .sizes { display: flex; align-items: flex-end; gap: 10px; justify-content: center; }
`;

/** One glyph as standalone SVG markup, in whichever tone. */
function svg(name, { size = 28, tone = "mono", stroke = 1.5 } = {}) {
  const found = GLYPHS[name];
  const accent = tone === "gold" ? "var(--gold)" : "currentColor";
  const opacity = tone === "gold" ? 1 : 0.55;
  const paths = found.paths.map((path) => {
    const transform = path.transform ? ` transform="${path.transform}"` : "";
    if (path.kind === "fill") {
      return `<path d="${path.d}"${transform} fill="currentColor" stroke="none"/>`;
    }
    if (path.kind === "accent") {
      return `<path d="${path.d}"${transform} stroke="${accent}"`
        + ` stroke-opacity="${opacity}" stroke-width="${stroke * 0.75}"/>`;
    }
    return `<path d="${path.d}"${transform}/>`;
  }).join("");
  return `<svg viewBox="${VIEWBOX}" width="${size}" height="${size}" fill="none"`
    + ` stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round"`
    + ` stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function page({ card, title, lede, body }) {
  return `<!-- @dsCard group="${card.group}" -->
<!doctype html>
<meta charset="utf-8">
<title>${title}</title>
<style>${PAGE_CSS}</style>
<h1>${title}</h1>
<p class="lede">${lede}</p>
${body}
`;
}

function groupPage(group) {
  const cells = group.names.map((name) => `
    <div class="cell">
      <div class="row">
        ${svg(name, { size: 34 })}
        <span class="gold">${svg(name, { size: 34, tone: "gold" })}</span>
      </div>
      <div class="label">${GLYPHS[name].label}</div>
      <div class="name">${name}</div>
    </div>`).join("");
  return page({
    card: { group: group.title },
    title: group.title,
    lede: "Left: the icon in the colour of whatever it sits in. Right: the same "
      + "glyph with the table's gold on its engraved detail, for the places "
      + "where the icon is the point rather than a label's companion.",
    body: `<div class="grid">${cells}</div>`,
  });
}

function anatomyPage() {
  const sizes = [14, 18, 24, 40, 64]
    .map((size) => `<div><div class="sizes">${svg("coin", { size })}</div>
      <div class="name">${size}px</div></div>`).join("");
  const strokes = [1, 1.5, 2]
    .map((stroke) => `<div><div class="sizes">${svg("trophy", { size: 40, stroke })}</div>
      <div class="name">${stroke}</div></div>`).join("");
  return page({
    card: { group: "Foundations" },
    title: "Anatomy",
    lede: "One 24×24 grid, one stroke weight, two tones. The shape carries the "
      + "current colour so an icon is styled by styling the thing it sits in; "
      + "the engraved detail steps back from it. Nothing is filled except the "
      + "small ornaments, which is what keeps a glyph readable at 14px.",
    body: `<h1 style="margin-top:22px">The same glyph, five sizes</h1>
      <div class="grid">${sizes}</div>
      <h1 style="margin-top:26px">Stroke weights</h1>
      <div class="grid">${strokes}</div>`,
  });
}

/**
 * The icons where they actually go.
 *
 * A grid of glyphs says whether they are drawn well; only a row of chrome says
 * whether they are the right size beside a word, which is the mistake that does
 * not show up until it is in front of somebody.
 */
function inPlacePage() {
  const tab = (name, label, on) => `<button class="tab${on ? " on" : ""}">`
    + `${svg(name, { size: 16, tone: on ? "gold" : "mono" })}${label}</button>`;
  return page({
    card: { group: "Foundations" },
    title: "In place",
    lede: "The lobby's own chrome, at the sizes it uses: 16px beside a word, "
      + "20px where the figure is the point.",
    body: `
      <div class="chrome">
        <div class="strip">
          ${tab("trophy", "Tournaments", true)}
          ${tab("spin", "Spin n Go", false)}
          ${tab("duel", "Sit n Go", false)}
        </div>
        <div class="bar">
          <span class="pill">${svg("home", { size: 16 })}Lobby</span>
          <span class="pill">${svg("clubs", { size: 16 })}Clubs</span>
          <span class="spacer"></span>
          <span class="coins">${svg("coin", { size: 16, tone: "gold" })}610</span>
          <span class="pill">${svg("logout", { size: 16 })}Logout</span>
        </div>
        <div class="card">
          <div class="cardrow"><span class="k">Buy-in</span>
            <span class="v">${svg("coin", { size: 20, tone: "gold" })}25</span></div>
          <div class="cardrow rule"><span class="k">Prize</span>
            <span class="vg">${svg("coin", { size: 14 })}50 – 2,500</span></div>
          <div class="cardrow"><span class="vg">${svg("check", { size: 12 })}You are in</span></div>
        </div>
        <ol class="board">
          <li>${svg("medal-1", { size: 16, tone: "gold" })}<span>ana</span><b>100×</b></li>
          <li>${svg("medal-2", { size: 16, tone: "gold" })}<span>bea</span><b>50×</b></li>
          <li>${svg("medal-3", { size: 16, tone: "gold" })}<span>caro</span><b>25×</b></li>
        </ol>
      </div>
      <style>
        .chrome { display: grid; gap: 16px; max-width: 480px; }
        .strip { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px;
                 background: var(--panel); border: 1px solid var(--border); width: max-content; }
        .tab { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
               border: 0; border-radius: 8px; background: none; color: var(--muted);
               font: inherit; font-weight: 600; font-size: 13px; }
        .tab.on { background: #8a1c2b; color: #f1e9e6; }
        .bar { display: flex; align-items: center; gap: 8px; padding: 8px 10px;
               border: 1px solid var(--border); border-radius: 10px; font-size: 12px; }
        .pill { display: inline-flex; align-items: center; gap: 5px; color: var(--muted);
                font-weight: 600; }
        .spacer { flex: 1; }
        .coins { display: inline-flex; align-items: center; gap: 6px; color: #d8c175;
                 font-weight: 700; }
        .card { border: 1px solid var(--border); border-radius: 12px; padding: 12px;
                background: var(--panel); display: grid; gap: 8px; width: 240px; }
        .cardrow { display: flex; align-items: center; justify-content: space-between; }
        .rule { border-top: 1px solid var(--border); padding-top: 8px; }
        .k { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
        .v { display: inline-flex; align-items: center; gap: 6px; font-size: 20px; font-weight: 700; }
        .vg { display: inline-flex; align-items: center; gap: 5px; color: #d8c175;
              font-size: 13px; font-weight: 600; }
        .board { list-style: none; margin: 0; padding: 0; width: 240px; }
        .board li { display: flex; align-items: center; gap: 8px; padding: 5px 0;
                    border-bottom: 1px solid var(--border); font-size: 12px; }
        .board span { flex: 1; }
        .board b { color: #d8c175; }
      </style>`,
  });
}

const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/build-icon-preview.mjs <outDir>");
  process.exit(1);
}

const files = [
  ["components/icons/anatomy.html", anatomyPage()],
  ["components/icons/in-place.html", inPlacePage()],
  ...GROUPS.map((group) => [`components/icons/${group.key}.html`, groupPage(group)]),
];

for (const [path, html] of files) {
  const full = join(out, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, html, "utf8");
  console.log(path);
}

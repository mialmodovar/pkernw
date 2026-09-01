/**
 * How big the betting buttons are, and against what.
 *
 * Against the panel, never against the window. The panel has a definite width —
 * 46rem once there is room for it — so sizing its buttons in `vw` meant that on
 * a large monitor the type and the padding grew to their maximum while the
 * buttons stayed exactly as wide as they had always been. At 2560px a button
 * had 89px of room and "Raise 148,600" wanted 123px of it, and the label was
 * simply cut off. The bigger the screen, the worse it got.
 *
 * `cqw` is a percentage of the panel (which declares itself a container; see
 * .bet-bar in index.css), so a button and the words on it grow and shrink
 * together — which is the only relationship between them that survives a
 * change of screen. Above the `lg` breakpoint the panel stops growing, so these
 * stop changing too: the bar looks the same on a laptop and on a 4K monitor,
 * which is what anybody would expect of a control with a fixed width.
 *
 * The floors are for the phone, where the panel is as wide as the screen and a
 * percentage of it would be far too small to read under time pressure.
 */

/** Padding and type for one of the three commit buttons. */
export const BUTTON_SIZE =
  "px-[clamp(0.3rem,1.15cqw,0.6rem)] py-[clamp(0.55rem,1.6cqw,0.95rem)] " +
  "text-[clamp(0.75rem,1.95cqw,0.92rem)]";

/**
 * The widest thing the row is ever asked to print, for anybody checking the fit
 * by hand. A seven-figure raise is beyond any table this app deals; it is here
 * because the button has to hold whatever the engine sends it, and the two
 * currencies say the same amount at different lengths.
 */
export const WIDEST_LABELS = ["Raise 1,485,600", "Raise 1,743.5 BB", "Call 148,600"];

/* ------------------------------------------------------------------------- *
 * Where the panel's two halves sit, by the same argument.
 *
 * The type was sized against the panel because the panel has a definite width
 * and the window does not tell you what it is. The layout was never given the
 * same treatment: the sizing block moved up beside the buttons at `lg`, which
 * is the WINDOW at 1024px, and at 1024px the panel was 384px wide. Half the
 * felt less a seat is what the placement allows it — see PANEL_WIDTH_FLOOR —
 * so the panel is at its narrowest exactly where the old rule made it carry
 * two columns. Three buttons, 232px of sizing block and 104px of clock and
 * gaps inside 384px leaves about twenty pixels a button. At 1280px, which is
 * a laptop, "Call 12,400" was already cut in half.
 *
 * So the switch is a container query on the panel, like everything else here.
 * ------------------------------------------------------------------------- */

const REM = 16;

/**
 * The panel's placement cap, for the wrapper it is positioned in — GamePage.
 *
 * `calc(50% - 8rem)` is half the felt less the widest a seat gets, which is
 * what stops the panel growing over the hero's own box. It was the whole rule,
 * and on its own it is a percentage of the viewport rather than of anything the
 * panel needs: 256px at 768, 384px at 1024, 512px at 1280. The panel only
 * reached the 42rem it asks for on a monitor 1600px wide.
 *
 * The floor is the width at which the widest label the engine can send still
 * fits on a button at the smallest type this file allows — 26rem, checked in
 * the test. Below that the buttons are lying about what they will do, which is
 * worse than a panel that reaches a little way over the seat below it.
 */
export const PANEL_WIDTH_FLOOR = "max-w-[max(26rem,calc(50%-8rem))]";

/** The panel width at which the sizing block moves up beside the buttons. */
export const TWO_COLUMN_REM = 40;

/**
 * The panel's own row/column switch, and the two things that follow it.
 *
 * `@[40rem]/panel` reads the panel, not the window — `panel` is the container
 * named on the shell, which was already declaring `container-type: inline-size`
 * for the type. One column until the panel itself is 40rem wide, whatever the
 * window is doing: a 768px tablet and a 1280px laptop both get the stacked
 * layout, because at those sizes that is the only one the buttons fit in.
 */
export const PANEL_ROW = "flex flex-col @[40rem]/panel:flex-row "
  + "@[40rem]/panel:items-stretch @[40rem]/panel:gap-3";
export const PANEL_LEFT_BLOCK = "@[40rem]/panel:w-[14.5rem] @[40rem]/panel:shrink-0 "
  + "@[40rem]/panel:min-h-[4.75rem]";
export const PANEL_LEFT_TEXT = "@[40rem]/panel:text-left";

/**
 * One `clamp(a, b, c)` out of BUTTON_SIZE, in pixels, at a given panel width.
 *
 * Read off the class string rather than written out again, so that the fit
 * below is measuring the buttons this file actually ships and not a copy of
 * their numbers that stopped being true.
 */
function sizePx(property, panelPx) {
  const found = BUTTON_SIZE.match(new RegExp(`${property}-\\[clamp\\(([^)]*)\\)\\]`));
  const resolve = (token) => {
    const n = Number.parseFloat(token);
    return token.includes("cqw") ? (n / 100) * panelPx : n * REM;
  };
  const [low, scaled, high] = found[1].split(",").map(resolve);
  return Math.min(Math.max(scaled, low), high);
}

/**
 * Roughly how many ems of line a label is.
 *
 * Advance widths for Inter SemiBold, which is what the buttons are set in,
 * for the characters a bet label can contain and nothing else. Approximate on
 * purpose and slightly generous: this exists so the fit can be checked in a
 * test rather than on a monitor nobody on the team owns, and two per cent
 * either way changes none of the answers it is asked.
 */
const ADVANCE_EM = {
  " ": 0.26, ",": 0.257, ".": 0.257,
  A: 0.66, B: 0.658, C: 0.677, F: 0.58, R: 0.653,
  a: 0.549, c: 0.516, d: 0.585, e: 0.556, h: 0.573, i: 0.253, k: 0.55,
  l: 0.253, n: 0.573, o: 0.573, s: 0.516,
};

export function labelEm(label) {
  // 0.6 is a digit, which is every character these labels have that is not a
  // letter or a separator.
  return [...label].reduce((sum, ch) => sum + (ADVANCE_EM[ch] ?? 0.6), 0);
}

/** How wide a button has to be to print `label`, padding included. */
export function labelNeedsPx(label, panelPx) {
  return labelEm(label) * sizePx("text", panelPx) + 2 * sizePx("px", panelPx);
}

/**
 * How wide one of the three buttons actually gets.
 *
 * Everything in the row that is not a button, measured off PanelShell: the
 * shell's padding, the clock column and the gap after it, and the two gaps in
 * the three-column grid. The two-column layout adds the sizing block and the
 * gap beside it — 244px, which is more than a third of the widest the panel is
 * ever allowed to be, and the reason the switch is set where it is.
 */
export function buttonRoomPx(panelPx, { twoColumn }) {
  const shellPadding = 2 * 8;
  const clockColumn = 40 + 8;
  const gridGaps = 2 * 8;
  const sizingBlock = twoColumn ? 14.5 * REM + 12 : 0;
  return (panelPx - shellPadding - clockColumn - gridGaps - sizingBlock) / 3;
}

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

/**
 * The multipliers a Spin n Go can draw, as the reel scrolls through them.
 *
 * The server owns the odds and does the drawing; nothing here decides anything.
 * This is only what the wheel looks like while it lands, which is why it is a
 * plain list and not the weighted table — what matters is that these are the
 * real multipliers and that there are enough of them to read as a wheel.
 */
export const MULTIPLIER_LADDER = [2, 3, 5, 10, 25, 50, 100];

/**
 * A message that is nothing but faces.
 *
 * The reaction buttons send their emoji as ordinary chat text, so a 👍 arrived
 * at the same eleven pixels as a sentence — a thumb the size of a full stop,
 * in a bubble built to hold a line of words. A reaction is not a short message;
 * it is a different kind of message, and the whole of it is the picture.
 *
 * Only a short burst counts. Someone typing a paragraph of emoji is writing,
 * not reacting, and blowing that up would fill the felt.
 */

// Pictographs, their skin-tone modifiers, the variation selector that makes a
// character render as emoji, the joiner that welds a family together, and any
// spaces between them. Deliberately no \p{Emoji_Component}: that class takes in
// the ASCII digits and #, so "123" would read as an emoji message.
const ONLY_PICTURES = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|️|‍|\s)+$/u;

const MAX_GLYPHS = 3;

/** How many separate emoji this is, counting a joined sequence as one. */
export function countEmoji(text) {
  const trimmed = (text || "").replace(/\s+/g, "");
  if (!trimmed) return 0;
  // Segmenter knows that 👨‍👩‍👧 is one thing and not four. Where it is missing,
  // code points are a rough count, which only ever errs towards "too many" and
  // so towards leaving the message at its ordinary size.
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)].length;
  }
  return [...trimmed].length;
}

/** Whether this message should be drawn big. */
export function isEmojiMessage(text) {
  const trimmed = (text || "").trim();
  if (!trimmed || !ONLY_PICTURES.test(trimmed)) return false;
  const count = countEmoji(trimmed);
  return count > 0 && count <= MAX_GLYPHS;
}

import { describe, expect, it } from "vitest";

import { countEmoji, isEmojiMessage } from "./emojiMessage";

describe("isEmojiMessage", () => {
  it("is a reaction sent on its own", () => {
    expect(isEmojiMessage("\u{1F44D}")).toBe(true);
    expect(isEmojiMessage("\u{1F602}\u{1F602}")).toBe(true);
    // The heart the reaction row sends carries a variation selector.
    expect(isEmojiMessage("❤️")).toBe(true);
  });

  it("is not a sentence, however short", () => {
    expect(isEmojiMessage("nh")).toBe(false);
    expect(isEmojiMessage("gg \u{1F44D}")).toBe(false);
    expect(isEmojiMessage("")).toBe(false);
    expect(isEmojiMessage("   ")).toBe(false);
  });

  it("is not a wall of them", () => {
    expect(isEmojiMessage("\u{1F602}".repeat(4))).toBe(false);
  });

  it("does not mistake digits for emoji", () => {
    // Digits are Emoji_Component — the class this deliberately does not use.
    expect(isEmojiMessage("123")).toBe(false);
    expect(isEmojiMessage("#")).toBe(false);
    expect(isEmojiMessage("*")).toBe(false);
  });
});

describe("countEmoji", () => {
  it("counts a joined sequence as the one thing it looks like", () => {
    expect(countEmoji("\u{1F468}‍\u{1F469}‍\u{1F467}")).toBe(1);
    expect(countEmoji("\u{1F44D}\u{1F3FD}")).toBe(1);
  });

  it("counts what is there, ignoring the spaces", () => {
    expect(countEmoji(" \u{1F44D} \u{1F525} ")).toBe(2);
    expect(countEmoji("")).toBe(0);
  });
});

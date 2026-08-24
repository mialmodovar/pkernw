import { describe, expect, it, vi } from "vitest";

import { shareText, shareTournament, tournamentUrl } from "./shareTournament";

const night = { id: 7, name: "Friday Game", host_name: "dancast", host_display_name: "Dan" };

describe("tournamentUrl", () => {
  it("points at the lobby page, which is the one that says what the night is", () => {
    expect(tournamentUrl({ id: 7 }, "https://poker.example")).toBe("https://poker.example/tournament/7");
  });

  it("uses the name when the tournament has one", () => {
    // What lands in a group chat should say which night it is.
    expect(tournamentUrl({ id: 7, slug: "friday-game" }, "https://poker.example"))
      .toBe("https://poker.example/tournament/friday-game");
  });

  it("does not double the slash on an origin that came with one", () => {
    expect(tournamentUrl({ id: 7 }, "https://poker.example/")).toBe("https://poker.example/tournament/7");
  });
});

describe("shareText", () => {
  it("names the night and whose it is", () => {
    expect(shareText(night)).toBe("Friday Game — Dan's tournament");
  });

  it("copes with a tournament that has not told us much", () => {
    expect(shareText({})).toBe("a tournament");
  });
});

describe("shareTournament", () => {
  it("uses the phone's share sheet when there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const copy = vi.fn();

    const result = await shareTournament(night, { url: "https://x/t/7", share, copy });

    expect(result).toBe("shared");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: "https://x/t/7" }));
    expect(copy).not.toHaveBeenCalled();
  });

  it("says nothing happened when the sheet is dismissed", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("no"), { name: "AbortError" }));
    const copy = vi.fn().mockResolvedValue(true);

    expect(await shareTournament(night, { url: "https://x/t/7", share, copy })).toBe("cancelled");
    // Backing out of a share is a decision. Quietly copying instead would put
    // the link somewhere they did not ask for it.
    expect(copy).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard when the sheet fails for any other reason", async () => {
    const share = vi.fn().mockRejectedValue(new Error("not allowed"));
    const copy = vi.fn().mockResolvedValue(true);

    expect(await shareTournament(night, { url: "https://x/t/7", share, copy })).toBe("copied");
    expect(copy).toHaveBeenCalledWith("https://x/t/7");
  });

  it("copies where there is no share sheet at all", async () => {
    const copy = vi.fn().mockResolvedValue(true);

    expect(await shareTournament(night, { url: "https://x/t/7", share: null, copy })).toBe("copied");
  });

  it("admits it when the clipboard refuses", async () => {
    const copy = vi.fn().mockResolvedValue(false);

    expect(await shareTournament(night, { url: "https://x/t/7", share: null, copy })).toBe("failed");
  });
});

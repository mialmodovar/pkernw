import { describe, expect, it } from "vitest";

import {
  CHIPS, actionButtons, activeHand, bettingState, canAfford, canCoverSecondStake, chipsFor,
  dealerLine, handLabel, handTotal, isHiddenCard, outcomeLine, roundSummary, stakeLimits,
  drawerVisible,
} from "./blackjack";

const game = { id: "blackjack", min_stake: 5, max_stake: 500 };

/** A hand as the server sends one, with only the fields a test cares about set. */
const hand = (over = {}) => ({
  cards: ["9s", "2h"],
  total: 11,
  soft: false,
  stake: 25,
  doubled: false,
  from_split: false,
  status: "playing",
  outcome: null,
  returned: 0,
  can: { hit: true, stand: true, double: true, split: false },
  ...over,
});

const round = (over = {}) => ({
  id: 12,
  stake: 25,
  status: "playing",
  dealer: { cards: ["Kd", "??"], total: 10, soft: false, blackjack: false },
  hands: [hand()],
  active: 0,
  net: 0,
  ...over,
});

describe("chipsFor", () => {
  it("builds the pile out of the biggest chips first", () => {
    expect(chipsFor(130)).toEqual([100, 25, 5]);
    expect(chipsFor(75)).toEqual([25, 25, 25]);
  });

  it("makes a table-maximum bet out of five chips and no more", () => {
    expect(chipsFor(500)).toEqual([100, 100, 100, 100, 100]);
  });

  it("never draws a denomination this table does not have", () => {
    // 37 is not a run of 5s, 25s and 100s: the odd 2 is left undrawn rather
    // than made up out of a chip that does not exist.
    expect(chipsFor(37)).toEqual([25, 5, 5]);
    for (const amount of [5, 55, 130, 245, 499]) {
      expect(chipsFor(amount).every((chip) => CHIPS.includes(chip))).toBe(true);
    }
  });

  it("has nothing to draw for a bet nobody has made", () => {
    expect(chipsFor(0)).toEqual([]);
    expect(chipsFor(-25)).toEqual([]);
    expect(chipsFor(undefined)).toEqual([]);
  });
});

describe("stakeLimits", () => {
  it("takes the limits off the wallet's game row", () => {
    expect(stakeLimits(game)).toEqual({ min: 5, max: 500 });
    expect(stakeLimits({ min_stake: 10, max_stake: 250 })).toEqual({ min: 10, max: 250 });
  });

  it("understands a caller that says min and max in its own words", () => {
    expect(stakeLimits({ min: 20, max: 100 })).toEqual({ min: 20, max: 100 });
  });

  it("falls back to the house limits before the wallet has loaded", () => {
    expect(stakeLimits(null)).toEqual({ min: 5, max: 500 });
    expect(stakeLimits(undefined)).toEqual({ min: 5, max: 500 });
  });
});

describe("canAfford", () => {
  it("takes a bet inside the limits that the wallet covers", () => {
    expect(canAfford(25, 100, game)).toBe(true);
    expect(canAfford(100, 100, game)).toBe(true);
  });

  it("refuses a bet over the table maximum however rich the player is", () => {
    expect(canAfford(600, 10000, game)).toBe(false);
  });

  it("refuses a bet under the minimum", () => {
    expect(canAfford(1, 100, game)).toBe(false);
    expect(canAfford(0, 100, game)).toBe(false);
  });

  it("refuses a bet the wallet cannot cover", () => {
    expect(canAfford(100, 40, game)).toBe(false);
  });

  it("refuses everything while the balance is still unknown", () => {
    expect(canAfford(25, null, game)).toBe(false);
  });

  it("holds a table to its own limits rather than the house ones", () => {
    expect(canAfford(300, 1000, { min: 10, max: 250 })).toBe(false);
    expect(canAfford(300, 1000, {})).toBe(true);
  });
});

describe("canCoverSecondStake", () => {
  it("lets a player double when there is another stake in the wallet", () => {
    expect(canCoverSecondStake(hand({ stake: 25 }), 25)).toBe(true);
  });

  it("refuses the second stake to somebody who bet their whole balance", () => {
    // The rule out of the contract: a split or a double takes a second stake,
    // so a 500 bet with 500 coins behind it is a hand that cannot be doubled.
    expect(canCoverSecondStake(hand({ stake: 500 }), 0)).toBe(false);
    expect(canCoverSecondStake(hand({ stake: 500 }), 499)).toBe(false);
  });

  it("asks for the doubled stake once a hand has been doubled", () => {
    expect(canCoverSecondStake(hand({ stake: 50, doubled: true }), 40)).toBe(false);
  });

  it("has nothing to cover for a hand that is not there", () => {
    expect(canCoverSecondStake(null, 500)).toBe(false);
  });
});

describe("bettingState", () => {
  it("says the bet so far and offers the cards once it is legal", () => {
    const state = bettingState({ bet: 130, balance: 500, game });
    expect(state).toMatchObject({ bet: 130, label: "130", canDeal: true, reason: null });
    expect(state.chips).toEqual([100, 25, 5]);
  });

  it("will not deal nothing, and asks for a bet rather than telling anybody off", () => {
    // `reason` is the dead Deal button's own label, so at zero it has to be
    // the instruction and not a complaint about a mistake nobody has made.
    expect(bettingState({ bet: 0, balance: 500, game }))
      .toMatchObject({ canDeal: false, reason: "Place a bet", canClear: false });
  });

  it("names the table maximum rather than only refusing", () => {
    expect(bettingState({ bet: 600, balance: 5000, game }))
      .toMatchObject({ canDeal: false, reason: "Table maximum is 500" });
  });

  it("says which one is short when the wallet is", () => {
    expect(bettingState({ bet: 100, balance: 40, game }))
      .toMatchObject({ canDeal: false, reason: "Not enough coins" });
  });

  it("blames the table before the wallet for a bet no table would take", () => {
    // Over the maximum and over the balance at once: sending somebody to the
    // shop for a bet that would be refused anyway helps nobody.
    expect(bettingState({ bet: 900, balance: 40, game }).reason).toBe("Table maximum is 500");
  });

  it("asks for the minimum before it lets the cards out", () => {
    expect(bettingState({ bet: 3, balance: 500, game }))
      .toMatchObject({ canDeal: false, reason: "Minimum bet is 5" });
  });

  it("falls back to 5 and 500 when the wallet has not sent its games", () => {
    expect(bettingState({ bet: 25, balance: 500 })).toMatchObject({ min: 5, max: 500, canDeal: true });
    expect(bettingState({ bet: 600, balance: 5000 }).reason).toBe("Table maximum is 500");
  });

  it("keeps the chip row in one order and kills the chips that cannot be added", () => {
    const state = bettingState({ bet: 450, balance: 500, game });
    expect(state.chipButtons.map((chip) => chip.value)).toEqual([5, 25, 100]);
    expect(state.chipButtons.map((chip) => chip.enabled)).toEqual([true, true, false]);
  });

  it("kills a chip the wallet cannot pay for, not only one the table refuses", () => {
    const state = bettingState({ bet: 25, balance: 40, game });
    expect(state.chipButtons.map((chip) => chip.enabled)).toEqual([true, false, false]);
  });

  it("survives being called before anything at all has loaded", () => {
    expect(bettingState()).toMatchObject({ bet: 0, canDeal: false, reason: "Place a bet" });
  });
});

describe("handTotal", () => {
  it("shows both readings of a soft hand, which is the point of one", () => {
    expect(handTotal(hand({ cards: ["Ah", "6d"], total: 17, soft: true }))).toBe("7 / 17");
  });

  it("shows an ace on its own as the two things it might be", () => {
    expect(handTotal(hand({ cards: ["As"], total: 11, soft: true }))).toBe("1 / 11");
  });

  it("shows one number for a hard hand", () => {
    expect(handTotal(hand({ cards: ["Kd", "9s"], total: 19, soft: false }))).toBe("19");
  });

  it("prints what the server counted rather than counting the cards itself", () => {
    // The server is the authority on the count. Given a payload whose total
    // does not match the cards, the payload wins — a client that argued would
    // be arguing about somebody's coins.
    expect(handTotal(hand({ cards: ["2h", "3h"], total: 19, soft: false }))).toBe("19");
  });

  it("has nothing to print for a hand that is not there", () => {
    expect(handTotal(null)).toBe("");
  });
});

describe("handLabel", () => {
  it("names a blackjack", () => {
    expect(handLabel(hand({ status: "blackjack", total: 21 }))).toBe("Blackjack");
  });

  it("names a bust", () => {
    expect(handLabel(hand({ status: "bust", total: 23 }))).toBe("Bust");
  });

  it("says 21 rather than stood, because it is the better news", () => {
    expect(handLabel(hand({ status: "stood", total: 21 }))).toBe("21");
  });

  it("says stood for a hand the player is done with", () => {
    expect(handLabel(hand({ status: "stood", total: 18 }))).toBe("Stood");
  });

  it("says nothing at all about a hand still being played", () => {
    expect(handLabel(hand({ status: "playing", total: 11 }))).toBe(null);
    expect(handLabel(null)).toBe(null);
  });
});

describe("outcomeLine", () => {
  it("says what a blackjack made, not what came back", () => {
    // 25 in, 62 back at 3:2 — what the player made is 37.
    expect(outcomeLine(hand({ stake: 25, returned: 62, outcome: "blackjack" })))
      .toBe("Blackjack · +37");
  });

  it("says what a won hand made", () => {
    expect(outcomeLine(hand({ stake: 50, returned: 100, outcome: "win" }))).toBe("Won · +50");
  });

  it("puts a separator in the big ones", () => {
    expect(outcomeLine(hand({ stake: 1000, returned: 2000, outcome: "win" })))
      .toBe("Won · +1,000");
  });

  it("says push without a figure, because nothing moved", () => {
    expect(outcomeLine(hand({ stake: 25, returned: 25, outcome: "push" }))).toBe("Push");
  });

  it("says lost without rubbing the number in", () => {
    expect(outcomeLine(hand({ stake: 25, returned: 0, outcome: "lose", status: "bust" })))
      .toBe("Lost");
  });

  it("says nothing about a hand that has not been settled", () => {
    expect(outcomeLine(hand())).toBe(null);
    expect(outcomeLine(null)).toBe(null);
  });
});

describe("roundSummary", () => {
  it("has nothing to say while the round is still being played", () => {
    expect(roundSummary(round())).toBe(null);
    expect(roundSummary(null)).toBe(null);
  });

  it("says a hand won, by how much, and in what colour", () => {
    const won = round({
      status: "finished",
      active: null,
      hands: [hand({ status: "stood", total: 20, outcome: "win", returned: 50 })],
      net: 25,
    });
    expect(roundSummary(won)).toEqual({
      headline: "Won", net: 25, netLabel: "+25", tone: "win",
    });
  });

  it("names a blackjack, which is the line worth reading", () => {
    const bj = round({
      status: "finished",
      active: null,
      hands: [hand({ status: "blackjack", total: 21, outcome: "blackjack", returned: 62 })],
      net: 37,
    });
    expect(roundSummary(bj)).toMatchObject({ headline: "Blackjack", netLabel: "+37", tone: "win" });
  });

  it("calls a bust a bust rather than a loss", () => {
    const bust = round({
      status: "finished",
      active: null,
      hands: [hand({ status: "bust", total: 24, outcome: "lose", returned: 0 })],
      net: -25,
    });
    expect(roundSummary(bust)).toMatchObject({
      headline: "Bust", net: -25, netLabel: "-25", tone: "lose",
    });
  });

  it("says push, and gives it no number to print", () => {
    const push = round({
      status: "finished",
      active: null,
      hands: [hand({ status: "stood", total: 19, outcome: "push", returned: 25 })],
      net: 0,
    });
    expect(roundSummary(push)).toEqual({
      headline: "Push", net: 0, netLabel: null, tone: "push",
    });
  });

  it("is honest about a split that came out both ways", () => {
    const split = round({
      status: "finished",
      active: null,
      hands: [
        hand({ from_split: true, status: "stood", total: 20, outcome: "win", returned: 50 }),
        hand({ from_split: true, status: "bust", total: 23, outcome: "lose", returned: 0 }),
      ],
      net: 0,
    });
    // Nothing moved, so the colour is a push — but the sentence says what
    // actually happened, which is two different things.
    expect(roundSummary(split)).toMatchObject({
      headline: "One won, one lost", net: 0, tone: "push",
    });
  });

  it("tells the good half of a split first", () => {
    const split = round({
      status: "finished",
      active: null,
      hands: [
        hand({ from_split: true, outcome: "lose", returned: 0 }),
        hand({ from_split: true, outcome: "win", returned: 50 }),
      ],
      net: 0,
    });
    expect(roundSummary(split).headline).toBe("One won, one lost");
  });

  it("says when both hands went the same way", () => {
    const both = (outcome, net) => roundSummary(round({
      status: "finished",
      active: null,
      hands: [hand({ from_split: true, outcome }), hand({ from_split: true, outcome })],
      net,
    }));
    expect(both("win", 50).headline).toBe("Both hands won");
    expect(both("lose", -50).headline).toBe("Both hands lost");
    expect(both("push", 0).headline).toBe("Both hands pushed");
  });

  it("says a hand pushed and the other lost without pretending either won", () => {
    const mixed = round({
      status: "finished",
      active: null,
      hands: [
        hand({ from_split: true, outcome: "push", returned: 25 }),
        hand({ from_split: true, outcome: "lose", returned: 0 }),
      ],
      net: -25,
    });
    expect(roundSummary(mixed)).toMatchObject({
      headline: "One lost, one pushed", tone: "lose",
    });
  });
});

describe("actionButtons", () => {
  it("draws the same four buttons in the same order every time", () => {
    expect(actionButtons(round()).map((button) => button.key))
      .toEqual(["hit", "stand", "double", "split"]);
    const split = round({
      hands: [hand({ can: { hit: true, stand: true, double: false, split: true } })],
    });
    expect(split && actionButtons(split).map((button) => button.key))
      .toEqual(["hit", "stand", "double", "split"]);
  });

  it("offers no more than the server says is legal", () => {
    const noDouble = round({
      hands: [hand({ can: { hit: true, stand: true, double: false, split: false } })],
    });
    expect(actionButtons(noDouble).map((button) => button.enabled))
      .toEqual([true, true, false, false]);
  });

  it("offers a split only when the server has seen a pair", () => {
    const pair = round({
      hands: [hand({
        cards: ["8s", "8d"], total: 16,
        can: { hit: true, stand: true, double: true, split: true },
      })],
    });
    expect(actionButtons(pair).map((button) => button.enabled))
      .toEqual([true, true, true, true]);
  });

  it("offers nothing once the round is finished", () => {
    const over = round({ status: "finished", active: null, hands: [hand({ status: "stood" })] });
    expect(actionButtons(over).every((button) => !button.enabled)).toBe(true);
  });

  it("offers nothing at all before a round has been dealt", () => {
    expect(actionButtons(null).map((button) => button.enabled))
      .toEqual([false, false, false, false]);
  });

  it("greys out double and split for a wallet with no second stake in it", () => {
    const pair = round({
      hands: [hand({
        stake: 500,
        can: { hit: true, stand: true, double: true, split: true },
      })],
    });
    expect(actionButtons(pair, { balance: 100 }).map((button) => button.enabled))
      .toEqual([true, true, false, false]);
    expect(actionButtons(pair, { balance: 500 }).map((button) => button.enabled))
      .toEqual([true, true, true, true]);
  });

  it("leaves the wallet out of it when no balance is given", () => {
    const pair = round({
      hands: [hand({ stake: 500, can: { hit: true, stand: true, double: true, split: true } })],
    });
    expect(actionButtons(pair).map((button) => button.enabled)).toEqual([true, true, true, true]);
  });

  it("reads the buttons off the hand being played, not the first one", () => {
    const split = round({
      active: 1,
      hands: [
        hand({ status: "stood", can: { hit: false, stand: false, double: false, split: false } }),
        hand({ can: { hit: true, stand: true, double: true, split: false } }),
      ],
    });
    expect(actionButtons(split).map((button) => button.enabled))
      .toEqual([true, true, true, false]);
  });
});

describe("activeHand", () => {
  it("is the hand the player is being asked about", () => {
    const split = round({ active: 1, hands: [hand({ stake: 25 }), hand({ stake: 50 })] });
    expect(activeHand(split).stake).toBe(50);
  });

  it("is nobody's hand once the round belongs to the dealer", () => {
    expect(activeHand(round({ status: "finished", active: null }))).toBe(null);
    expect(activeHand(null)).toBe(null);
  });
});

describe("dealerLine", () => {
  it("says what is face up, and that a card is not", () => {
    expect(dealerLine(round())).toBe("10 \u00b7 one card down");
  });

  it("keeps both readings of a face-up ace, which is the card it turns on", () => {
    const ace = round({ dealer: { cards: ["As", "??"], total: 11, soft: true, blackjack: false } });
    expect(dealerLine(ace)).toBe("1 / 11 \u00b7 one card down");
  });

  it("says the settled total once the round is over and the card is turned", () => {
    const done = round({
      status: "finished",
      dealer: { cards: ["Kd", "8h"], total: 18, soft: false, blackjack: false },
    });
    expect(dealerLine(done)).toBe("18");
  });

  it("prints a settled soft seventeen as the one number it now is", () => {
    const done = round({
      status: "finished",
      dealer: { cards: ["Ah", "6d"], total: 17, soft: true, blackjack: false },
    });
    expect(dealerLine(done)).toBe("17");
  });

  it("calls a dealer bust", () => {
    const done = round({
      status: "finished",
      dealer: { cards: ["Kd", "8h", "7c"], total: 25, soft: false, blackjack: false },
    });
    expect(dealerLine(done)).toBe("25 \u00b7 Bust");
  });

  it("names a dealer blackjack", () => {
    const done = round({
      status: "finished",
      dealer: { cards: ["As", "Th"], total: 21, soft: true, blackjack: true },
    });
    expect(dealerLine(done)).toBe("21 \u00b7 Blackjack");
  });

  it("gives nothing away while the hole card is still face down on screen", () => {
    const done = round({
      status: "finished",
      dealer: { cards: ["As", "Th"], total: 21, soft: true, blackjack: true },
    });
    expect(dealerLine(done, false)).toBe("one card down");
  });

  it("survives a table with no round on it", () => {
    expect(dealerLine(null)).toBe("");
    expect(dealerLine(undefined, false)).toBe("");
  });
});

describe("isHiddenCard", () => {
  it("knows the hole card from a real one", () => {
    expect(isHiddenCard("??")).toBe(true);
    expect(isHiddenCard("Th")).toBe(false);
    expect(isHiddenCard(undefined)).toBe(false);
  });
});

describe("drawerVisible", () => {
  it("shows blackjack only while the poker table does not need you", () => {
    expect(drawerVisible({ open: true, isMyTurn: false })).toBe(true);
    expect(drawerVisible({ open: false, isMyTurn: false })).toBe(false);
  });

  it("takes it off the screen the moment it is your turn", () => {
    // The rule this whole function exists for. Poker is the game; a card game
    // covering the buttons at a money table is how somebody times out of a
    // hand they had chips in.
    expect(drawerVisible({ open: true, isMyTurn: true })).toBe(false);
  });

  it("is shut by default, whatever it is asked with", () => {
    expect(drawerVisible()).toBe(false);
    expect(drawerVisible({})).toBe(false);
  });
});

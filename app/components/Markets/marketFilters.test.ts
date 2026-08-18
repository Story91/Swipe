import { describe, it, expect } from "vitest";
import {
  categoryOptions,
  countMatching,
  matchesStatus,
  playerCount,
  selectMarkets,
  worthShowing,
  type FilterableMarket,
} from "./marketFilters";

const NOW = 1_700_000_000;

function market(over: Partial<FilterableMarket> & { deadline?: number } = {}): FilterableMarket {
  return {
    category: "Crypto",
    deadline: NOW + 3600,
    resolved: false,
    cancelled: false,
    needsApproval: false,
    participants: [],
    ...over,
  };
}

describe("the approval gate", () => {
  // The live bug. pred_v4_2 on Base is needsApproval: true, resolved: false,
  // cancelled: false, with a deadline in the future, and the grid drew it as an
  // open market you could bet on.
  const proposal = market({ needsApproval: true });

  it("keeps an unapproved proposal out of the open filter", () => {
    const out = selectMarkets([proposal], { status: "open", category: null, now: NOW });
    expect(out).toEqual([]);
  });

  it("keeps an unapproved proposal out of the all filter", () => {
    const out = selectMarkets([proposal], { status: "all", category: null, now: NOW });
    expect(out).toEqual([]);
  });

  it("keeps an unapproved market out of the resolved filter even with backers", () => {
    const settled = market({
      needsApproval: true,
      resolved: true,
      participants: ["0xa", "0xb"],
    });
    const out = selectMarkets([settled], { status: "resolved", category: null, now: NOW });
    expect(out).toEqual([]);
  });

  it("does not offer a category that only unapproved markets are in", () => {
    const options = categoryOptions(
      [market({ needsApproval: true, category: "Politics" })],
      "all",
      NOW
    );
    expect(options).toEqual([]);
  });

  it("still shows an approved market next to it", () => {
    const approved = market({ deadline: NOW + 60 });
    const out = selectMarkets([proposal, approved], {
      status: "open",
      category: null,
      now: NOW,
    });
    expect(out).toEqual([approved]);
  });

  it("treats a record with no needsApproval field as approved", () => {
    const legacy = market();
    delete legacy.needsApproval;
    const out = selectMarkets([legacy], { status: "open", category: null, now: NOW });
    expect(out).toEqual([legacy]);
  });
});

describe("the resolved filter", () => {
  it("shows a resolved market that has backers", () => {
    const resolved = market({ resolved: true, participants: ["0xa"] });
    const out = selectMarkets([resolved], { status: "resolved", category: null, now: NOW });
    expect(out).toEqual([resolved]);
  });

  // The shape that used to disappear. /api/sync/usdc writes
  // usdcParticipantCount on every pass, including as 0, and only writes
  // usdcParticipants when the count is above zero. A `??` chain stops at the 0
  // and never reaches the V2 array, so a settled market with nine backers read
  // as empty and worthShowing dropped it.
  it("shows an archived market whose backers are only in the V2 array", () => {
    const archived = market({
      resolved: true,
      usdcParticipantCount: 0,
      participants: ["0xA1", "0xB2", "0xC3"],
    });
    expect(playerCount(archived)).toBe(3);
    expect(worthShowing(archived)).toBe(true);
    const out = selectMarkets([archived], { status: "resolved", category: null, now: NOW });
    expect(out).toEqual([archived]);
  });

  it("counts a bettor in both arrays once", () => {
    // pred_v2_226 on Base: nine in the V2 array, four in the collateral one,
    // and the two lists overlap.
    const both = market({
      resolved: true,
      participants: ["0xF1", "0xF7", "0xE3"],
      usdcParticipants: ["0xf1", "0xf7", "0x9d"],
      usdcParticipantCount: 3,
    });
    expect(playerCount(both)).toBe(4);
  });

  it("still drops a settled market nobody bet on", () => {
    const empty = market({ resolved: true, participants: [], usdcParticipantCount: 0 });
    const out = selectMarkets([empty], { status: "resolved", category: null, now: NOW });
    expect(out).toEqual([]);
  });

  it("keeps an open market with no players", () => {
    const fresh = market({ participants: [] });
    const out = selectMarkets([fresh], { status: "open", category: null, now: NOW });
    expect(out).toEqual([fresh]);
  });
});

describe("the two filters compose", () => {
  const openCrypto = market({ category: "Crypto", deadline: NOW + 100 });
  const openSports = market({ category: "Sports", deadline: NOW + 200 });
  const doneCrypto = market({
    category: "Crypto",
    resolved: true,
    deadline: NOW - 100,
    participants: ["0xa"],
  });
  const doneSports = market({
    category: "Sports",
    resolved: true,
    deadline: NOW - 200,
    participants: ["0xb"],
  });
  const all = [openCrypto, openSports, doneCrypto, doneSports];

  it("open plus crypto is only the open crypto market", () => {
    const out = selectMarkets(all, { status: "open", category: "Crypto", now: NOW });
    expect(out).toEqual([openCrypto]);
  });

  it("resolved plus sports is only the settled sports market", () => {
    const out = selectMarkets(all, { status: "resolved", category: "Sports", now: NOW });
    expect(out).toEqual([doneSports]);
  });

  it("all plus crypto crosses the status boundary", () => {
    const out = selectMarkets(all, { status: "all", category: "Crypto", now: NOW });
    expect(out).toEqual([openCrypto, doneCrypto]);
  });

  it("open plus no category is every open market, soonest first", () => {
    const out = selectMarkets(all, { status: "open", category: null, now: NOW });
    expect(out).toEqual([openCrypto, openSports]);
  });

  it("settled markets sort most recent first", () => {
    const out = selectMarkets(all, { status: "resolved", category: null, now: NOW });
    expect(out).toEqual([doneCrypto, doneSports]);
  });

  it("counts the combination, not the status alone", () => {
    expect(countMatching(all, "all", null, NOW)).toBe(4);
    expect(countMatching(all, "all", "Crypto", NOW)).toBe(2);
    expect(countMatching(all, "open", "Crypto", NOW)).toBe(1);
    expect(countMatching(all, "resolved", "Crypto", NOW)).toBe(1);
  });

  it("can be given a combination with nothing in it", () => {
    const onlyOpenSports = [openSports];
    expect(selectMarkets(onlyOpenSports, { status: "resolved", category: "Sports", now: NOW })).toEqual([]);
  });
});

describe("the category options", () => {
  const all = [
    market({ category: "Crypto" }),
    market({ category: "Crypto" }),
    market({ category: "Sports" }),
    market({ category: "Other", resolved: true, deadline: NOW - 5, participants: ["0xa"] }),
  ];

  it("offers only the categories present, busiest first", () => {
    expect(categoryOptions(all, "all", NOW)).toEqual([
      { name: "Crypto", count: 2 },
      { name: "Other", count: 1 },
      { name: "Sports", count: 1 },
    ]);
  });

  it("narrows to the status filter that is on", () => {
    expect(categoryOptions(all, "open", NOW)).toEqual([
      { name: "Crypto", count: 2 },
      { name: "Sports", count: 1 },
    ]);
  });

  it("keeps the current selection listed at zero rather than dropping it", () => {
    expect(categoryOptions(all, "open", NOW, "Other")).toEqual([
      { name: "Crypto", count: 2 },
      { name: "Sports", count: 1 },
      { name: "Other", count: 0 },
    ]);
  });

  it("ignores a record with no category", () => {
    expect(categoryOptions([market({ category: "  " })], "all", NOW)).toEqual([]);
  });
});

/**
 * Proposals are their own bucket.
 *
 * The grid first learned to hide them outright, which was right for the open
 * view and wrong as the whole answer: a proposal nobody can see is a proposal
 * nobody can want, and the admin's queue had no signal in it but arrival order.
 * They are visible under their own filter now, and still absent from the three
 * that are about markets which exist.
 */
describe("proposals waiting for an admin", () => {
  const NOW = 1_800_000_000;
  const proposal = (over: Partial<FilterableMarket> = {}): FilterableMarket => ({
    category: "Crypto",
    deadline: NOW + 86_400,
    resolved: false,
    cancelled: false,
    needsApproval: true,
    ...over,
  });

  it("appears under proposed", () => {
    expect(matchesStatus(proposal(), "proposed", NOW)).toBe(true);
  });

  it("stays out of open, resolved and all", () => {
    for (const status of ["open", "resolved", "all"] as const) {
      expect(matchesStatus(proposal(), status, NOW)).toBe(false);
    }
  });

  it("does not put a registered market in the proposed bucket", () => {
    const live = proposal({ needsApproval: false });
    expect(matchesStatus(live, "proposed", NOW)).toBe(false);
    expect(matchesStatus(live, "open", NOW)).toBe(true);
  });

  it("drops a proposal whose deadline has already passed", () => {
    // Registering it would create a market that closed before it opened, so it
    // is not waiting for anything and should not collect likes.
    expect(matchesStatus(proposal({ deadline: NOW - 1 }), "proposed", NOW)).toBe(false);
  });

  it("composes with the category filter like every other status", () => {
    const markets = [proposal(), proposal({ category: "Sports" })];
    expect(selectMarkets(markets, { status: "proposed", category: "Crypto", now: NOW })).toHaveLength(1);
    expect(countMatching(markets, "proposed", null, NOW)).toBe(2);
    expect(categoryOptions(markets, "proposed", NOW).map((o) => o.name).sort())
      .toEqual(["Crypto", "Sports"]);
  });
});

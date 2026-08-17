import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  archivedVolume,
  decodeMarket,
  rollupMarkets,
  type MarketRow,
} from './liveMarketStats';

/**
 * The stats tab prints these numbers as fact, so each one has to be the thing it
 * is labelled as.
 *
 * The screen this replaces printed an average stake that was written into the
 * markup, a resolution rate labelled "win rate", and a trending order computed
 * as `volumeETH + volumeSWIPE`. None of those could fail a test, because none of
 * them came from anywhere. What follows pins the parts that do.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT = path.join(HERE, '../../../contracts/PredictionMarket_V4.sol');

/** Field order of the `predictions(id)` getter, taken from the contract below. */
const NAMES = [
  'registered',
  'creator',
  'deadline',
  'yesPool',
  'noPool',
  'weightedYesPool',
  'weightedNoPool',
  'resolved',
  'cancelled',
  'outcome',
  'refundable',
  'createdAt',
  'resolvedAt',
  'netLosersPool',
  'weightedWinnersPool',
  'participantCount',
];

/** A successful multicall entry for one market, built from named fields. */
function entry(fields: Partial<Record<string, unknown>>) {
  const defaults: Record<string, unknown> = {
    registered: true,
    creator: '0x0000000000000000000000000000000000000001',
    deadline: BigInt(2_000),
    yesPool: BigInt(0),
    noPool: BigInt(0),
    weightedYesPool: BigInt(0),
    weightedNoPool: BigInt(0),
    resolved: false,
    cancelled: false,
    outcome: false,
    refundable: false,
    createdAt: BigInt(1_000),
    resolvedAt: BigInt(0),
    netLosersPool: BigInt(0),
    weightedWinnersPool: BigInt(0),
    participantCount: BigInt(0),
  };
  const row = { ...defaults, ...fields };
  return { status: 'success', result: NAMES.map((n) => row[n]) };
}

function row(over: Partial<MarketRow> = {}): MarketRow {
  return {
    deadline: 2_000,
    yesPool: BigInt(0),
    noPool: BigInt(0),
    resolved: false,
    cancelled: false,
    participants: 0,
    ...over,
  };
}

describe('the struct this decoder indexes into', () => {
  const source = readFileSync(CONTRACT, 'utf8');

  it('still declares its fields in the order the getter is read by', () => {
    // The public mapping getter returns the struct in declaration order, so a
    // field inserted anywhere above participantCount silently shifts every
    // index after it. Pools would then be read out of resolvedAt.
    const block = source.match(/struct Prediction \{([\s\S]*?)\n {4}\}/);
    expect(block).not.toBeNull();

    const declared = [...(block as RegExpMatchArray)[1].matchAll(
      /^\s*(?:bool|address|uint256)\s+(\w+);/gm
    )].map((m) => m[1]);

    expect(declared).toEqual(NAMES);
  });
});

describe('reading one market out of a multicall', () => {
  it('takes the pools, the clock and the headcount from the right slots', () => {
    const decoded = decodeMarket(
      entry({
        deadline: BigInt(1_700_000_000),
        yesPool: BigInt(25_000_000),
        noPool: BigInt(4_000_000),
        resolved: true,
        participantCount: BigInt(7),
      })
    );

    expect(decoded).toEqual({
      deadline: 1_700_000_000,
      yesPool: BigInt(25_000_000),
      noPool: BigInt(4_000_000),
      resolved: true,
      cancelled: false,
      participants: 7,
    });
  });

  it('refuses an id nobody has been given', () => {
    // An unregistered id returns a zeroed struct rather than reverting. Counted,
    // it turns the probe window into a market list 64 long.
    expect(decodeMarket(entry({ registered: false }))).toBeNull();
  });

  it('refuses a call that did not succeed, and anything that is not a call', () => {
    expect(decodeMarket({ status: 'failure', error: new Error('rpc') })).toBeNull();
    expect(decodeMarket({ status: 'success', result: undefined })).toBeNull();
    expect(decodeMarket(null)).toBeNull();
    expect(decodeMarket('registered')).toBeNull();
  });

  it('refuses a tuple shorter than the struct rather than reading past the end', () => {
    // A different ABI reaching this function must not produce a market with
    // undefined pools. BigInt(undefined) throws, so the length check is what
    // stands between a stale artifact and a crashed tab.
    const short = entry({});
    short.result = short.result.slice(0, NAMES.length - 1);
    expect(decodeMarket(short)).toBeNull();
  });
});

describe('counting a chain', () => {
  const NOW = 1_500;

  it('reports one empty market as one market with nothing in it', () => {
    // The state on both live chains today. A true zero is the answer, and the
    // page is not allowed to round it up into something friendlier.
    const out = rollupMarkets([row({ deadline: NOW + 500 })], NOW);
    expect(out.registered).toBe(1);
    expect(out.open).toBe(1);
    expect(out.staked).toBe(BigInt(0));
    expect(out.backers).toBe(0);
    expect(out.settled).toBe(0);
  });

  it('puts every market in exactly one state', () => {
    const out = rollupMarkets(
      [
        row({ deadline: NOW + 100 }),
        row({ deadline: NOW - 100 }),
        row({ deadline: NOW - 100, resolved: true }),
        row({ deadline: NOW - 100, cancelled: true }),
        null,
      ],
      NOW
    );

    expect(out.registered).toBe(4);
    expect(out.open).toBe(1);
    expect(out.awaiting).toBe(1);
    expect(out.settled).toBe(1);
    expect(out.cancelled).toBe(1);
    expect(out.open + out.awaiting + out.settled + out.cancelled).toBe(out.registered);
  });

  it('lets cancelled win over resolved, the way the contract does', () => {
    const out = rollupMarkets([row({ resolved: true, cancelled: true })], NOW);
    expect(out.cancelled).toBe(1);
    expect(out.settled).toBe(0);
  });

  it('counts a market past its deadline as waiting, not as open', () => {
    // Betting closes on the deadline. Calling it open would invite a bet the
    // contract refuses.
    expect(rollupMarkets([row({ deadline: NOW })], NOW).open).toBe(0);
    expect(rollupMarkets([row({ deadline: NOW })], NOW).awaiting).toBe(1);
  });

  it('adds the pools in raw units without going through a float', () => {
    // Raw collateral is six decimals, so a busy chain passes 2^53 base units at
    // about nine billion dollars. Number would start rounding there; bigint
    // does not, and the exact total is what the page prints.
    const big = BigInt('9007199254740993');
    const out = rollupMarkets(
      [row({ yesPool: big, noPool: BigInt(1) }), row({ yesPool: BigInt(2) })],
      NOW
    );
    expect(out.staked).toBe(big + BigInt(3));
  });

  it('sums backers per market, so two markets can outnumber the people', () => {
    const out = rollupMarkets([row({ participants: 3 }), row({ participants: 2 })], NOW);
    expect(out.backers).toBe(5);
  });

  it('flags the count as a floor only when the probe window filled up', () => {
    expect(rollupMarkets([row(), row()], NOW).countIsFloor).toBe(true);
    expect(rollupMarkets([row(), null], NOW).countIsFloor).toBe(false);
    expect(rollupMarkets([], NOW).countIsFloor).toBe(false);
  });
});

describe('the archived legs', () => {
  it('converts each token in its own decimals and keeps them apart', () => {
    const out = archivedVolume({
      success: true,
      data: { totalVolumeETH: 2.5e18, totalVolumeSWIPE: 1.4e21 },
    });
    expect(out).toEqual({ eth: 2.5, swipe: 1400 });
  });

  it('says nothing rather than zero when a chain never had the old contracts', () => {
    // Robinhood's keyspace holds no V1 or V2 records. A pair of zeros there
    // would read as "the old contracts did no volume here", which is a claim
    // about contracts that were never deployed.
    expect(archivedVolume({ success: true, data: { totalVolumeETH: 0, totalVolumeSWIPE: 0 } }))
      .toBeNull();
  });

  it('reports one leg when only one has anything in it', () => {
    expect(archivedVolume({ success: true, data: { totalVolumeSWIPE: 5e18 } }))
      .toEqual({ eth: 0, swipe: 5 });
  });

  it('refuses a failed or malformed response instead of printing zeros', () => {
    expect(archivedVolume({ success: false, error: 'nope' })).toBeNull();
    expect(archivedVolume({ success: true })).toBeNull();
    expect(archivedVolume(null)).toBeNull();
    expect(archivedVolume('{}')).toBeNull();
  });
});

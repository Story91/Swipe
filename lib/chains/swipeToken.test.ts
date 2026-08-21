import { describe, it, expect } from 'vitest';
import {
  SWIPE_TOKEN_LAUNCH,
  buyQuote,
  curveProgressBps,
  getSwipeCurve,
  isSwipeCurve,
  launchpadUrl,
  minTokensOut,
  spotPrice,
} from './swipeToken';

/**
 * The quote has to agree with the curve to the wei, because it is what sets
 * `minTokensOut` on a real transaction. A quote that is generous by a rounding
 * step sets a floor the fill cannot meet and the buy reverts after the user
 * has signed; a quote that is stingy tells them they are getting less than
 * they are.
 *
 * So the fixture below is not invented. It is Robinhood chain block 42365208
 * read off the deployed curve at 0x64e4...C475, and every expectation in the
 * first two tests is what that curve's own `buy` returned when simulated
 * against that block with an overridden balance. The clamped spend is pinned
 * a second way, through the contract's own slippage check: `boundary` was the
 * largest `minTokensOut` the chain accepted for a 5 ETH offer and
 * `boundary + 1` reverted, which fixes the spend to the wei.
 *
 * Reserves move on every buy anyone makes, so these numbers are a photograph
 * rather than a live reading. That is the point: they let the arithmetic be
 * checked without a network, and the arithmetic is the part that can drift.
 */
const CURVE_AT_BLOCK = {
  quoteReserve: BigInt('3545536680275572217'),
  tokenReserve: BigInt('473835176870719685817235973'),
  sellable: BigInt('188120891156433971531521688'),
  feeBps: BigInt(100),
  creatorTaxBps: BigInt(200),
  snipeTaxBps: BigInt(0),
  graduated: false,
};

const ETH = BigInt('1000000000000000000');

describe('buyQuote prices a buy the way the curve does', () => {
  it.each([
    ['0.001 ETH', ETH / BigInt(1000), BigInt('129597985567275032184969')],
    ['0.05 ETH', ETH / BigInt(20), BigInt('6394204656939628008713413')],
    ['1 ETH', ETH, BigInt('101786377591012857747302002')],
  ])('matches the contract on %s', (_label, offer, expected) => {
    const quote = buyQuote({ ...CURVE_AT_BLOCK, offer });

    expect(quote.refusal).toBeNull();
    expect(quote.tokensOut).toBe(expected);
    // Nothing was clamped, so the curve takes the whole offer and returns
    // nothing.
    expect(quote.clamped).toBe(false);
    expect(quote.spend).toBe(offer);
    expect(quote.refund).toBe(BigInt(0));
  });

  it('takes the fee legs off the input rather than the output', () => {
    const offer = ETH;
    const quote = buyQuote({ ...CURVE_AT_BLOCK, offer });

    // 1% curve fee and 2% creator tax, both charged on the ETH going in. The
    // curve never holds a fee denominated in the memecoin, which is why these
    // come off `spend` and not off `tokensOut`.
    expect(quote.fee).toBe(offer / BigInt(100));
    expect(quote.creatorTax).toBe((offer * BigInt(2)) / BigInt(100));
    expect(quote.snipeTax).toBe(BigInt(0));
  });
});

describe('buyQuote handles the last buy of the launch', () => {
  // Five ETH is more than the curve has left to sell at this block, so the
  // contract fills up to the reserved allocation, charges for what it handed
  // over and returns the rest inside the same transaction.
  const offer = ETH * BigInt(5);

  it('fills up to the allocation instead of reverting', () => {
    const quote = buyQuote({ ...CURVE_AT_BLOCK, offer });

    expect(quote.refusal).toBeNull();
    expect(quote.clamped).toBe(true);
    expect(quote.tokensOut).toBe(CURVE_AT_BLOCK.sellable);
  });

  it('charges only for what it received, to the wei', () => {
    const quote = buyQuote({ ...CURVE_AT_BLOCK, offer });

    expect(quote.spend).toBe(BigInt('2406663216210750560'));
    expect(quote.refund).toBe(offer - quote.spend);
    // The fee legs follow the spend, not the offer. Charging them on the
    // offer would take a fee on money that came straight back.
    expect(quote.fee).toBe(quote.spend / BigInt(100));
  });

  it('leaves a floor the contract will accept', () => {
    const quote = buyQuote({ ...CURVE_AT_BLOCK, offer });
    const floor = minTokensOut(quote.tokensOut, 0);

    // PonsV2BondingCurve.buy reverts when `spent * minTokensOut > received *
    // tokensOut`. On a clamped fill that is a bound on price, not on quantity,
    // so a floor set from the quote's own numbers has to satisfy it at zero
    // slippage or every last buy of a launch fails from this app.
    expect(quote.spend * floor).toBeLessThanOrEqual(offer * quote.tokensOut);
  });
});

describe('buyQuote refuses before the wallet opens', () => {
  it('refuses a graduated curve', () => {
    const quote = buyQuote({ ...CURVE_AT_BLOCK, offer: ETH, graduated: true });
    expect(quote.refusal).toMatch(/graduated/i);
    expect(quote.tokensOut).toBe(BigInt(0));
  });

  it('refuses an empty offer', () => {
    expect(buyQuote({ ...CURVE_AT_BLOCK, offer: BigInt(0) }).refusal).toBeTruthy();
  });

  it('refuses a curve with nothing left to sell', () => {
    const quote = buyQuote({ ...CURVE_AT_BLOCK, offer: ETH, sellable: BigInt(0) });
    expect(quote.refusal).toMatch(/nothing left/i);
  });

  it('refuses an amount that rounds to zero tokens', () => {
    // Not reachable on this launch: one wei still buys 133 million base units
    // here, because the token side of the curve is 26 digits wide. It becomes
    // reachable on a thin curve, which is what this stands in for, and the
    // contract reverts there with InsufficientOutputAmount after the wallet
    // has already opened.
    const thin = { ...CURVE_AT_BLOCK, tokenReserve: BigInt(1000), sellable: BigInt(1000) };
    expect(buyQuote({ ...thin, offer: BigInt(1) }).refusal).toMatch(/rounds to zero/i);
    expect(buyQuote({ ...CURVE_AT_BLOCK, offer: BigInt(1) }).refusal).toBeNull();
  });
});

describe('minTokensOut', () => {
  // Deliberately not a round number. A quote divisible by 10000 hides the
  // rounding direction entirely, which is how an earlier version of this test
  // passed against a floor that rounded up.
  const tokens = BigInt('129597985567275032184969');

  it('rounds the floor down, never up', () => {
    for (const bps of [0, 1, 37, 100, 333, 500, 2500]) {
      const floor = minTokensOut(tokens, bps);
      // The floor may not exceed the exact fraction it claims to be.
      expect(floor * BigInt(10000)).toBeLessThanOrEqual(tokens * BigInt(10000 - bps));
      // And it may not be more than one step below it either, or the bound is
      // looser than the slippage the user picked.
      expect((floor + BigInt(1)) * BigInt(10000)).toBeGreaterThan(tokens * BigInt(10000 - bps));
    }
  });

  it('leaves a zero-slippage floor at the quote itself', () => {
    expect(minTokensOut(tokens, 0)).toBe(tokens);
  });

  it('never returns more than the quote it was given', () => {
    for (const bps of [0, 1, 50, 300, 9999, 10000]) {
      expect(minTokensOut(tokens, bps)).toBeLessThanOrEqual(tokens);
    }
  });

  it('clamps nonsense rather than producing a floor above the quote', () => {
    expect(minTokensOut(tokens, -500)).toBe(tokens);
    expect(minTokensOut(tokens, 99999)).toBe(BigInt(0));
    expect(minTokensOut(BigInt(0), 100)).toBe(BigInt(0));
  });
});

describe('isSwipeCurve', () => {
  const curve = SWIPE_TOKEN_LAUNCH.curve;

  it('accepts the curve on the chain it lives on, in any case', () => {
    expect(isSwipeCurve('robinhood', curve)).toBe(true);
    expect(isSwipeCurve('robinhood', curve.toLowerCase())).toBe(true);
    expect(isSwipeCurve('robinhood', curve.toUpperCase().replace('0X', '0x'))).toBe(true);
  });

  it('refuses the same address on any other chain', () => {
    expect(isSwipeCurve('base', curve)).toBe(false);
    expect(isSwipeCurve('robinhoodTestnet', curve)).toBe(false);
  });

  it('refuses anything that is not the curve', () => {
    expect(isSwipeCurve('robinhood', SWIPE_TOKEN_LAUNCH.token)).toBe(false);
    expect(isSwipeCurve('robinhood', '0x0000000000000000000000000000000000000000')).toBe(false);
    expect(isSwipeCurve('robinhood', null)).toBe(false);
    expect(isSwipeCurve('robinhood', undefined)).toBe(false);
    expect(isSwipeCurve('robinhood', '')).toBe(false);
  });
});

describe('getSwipeCurve', () => {
  it('answers only for the chain the token is on', () => {
    expect(getSwipeCurve('robinhood')?.address).toBe(SWIPE_TOKEN_LAUNCH.curve);
    expect(getSwipeCurve('base')).toBeNull();
    expect(getSwipeCurve('robinhoodTestnet')).toBeNull();
  });

  it('carries the chain id to pin, and the token to check against', () => {
    const curve = getSwipeCurve('robinhood');
    expect(curve?.chainId).toBe(4663);
    expect(curve?.token).toBe(SWIPE_TOKEN_LAUNCH.token);
  });
});

describe('display helpers', () => {
  it('measures progress on the real reserve and caps at the threshold', () => {
    const threshold = ETH * BigInt(42) / BigInt(10);
    expect(curveProgressBps(BigInt(0), threshold)).toBe(0);
    expect(curveProgressBps(threshold / BigInt(2), threshold)).toBe(5000);
    expect(curveProgressBps(threshold, threshold)).toBe(10000);
    expect(curveProgressBps(threshold * BigInt(3), threshold)).toBe(10000);
    expect(curveProgressBps(ETH, BigInt(0))).toBe(0);
  });

  it('quotes in whole ETH per whole token, not wei', () => {
    const price = spotPrice(CURVE_AT_BLOCK.quoteReserve, CURVE_AT_BLOCK.tokenReserve, 18, 18);
    // 3.5455 ETH of reserve against 473.8 million tokens is about 7.48
    // nano-ETH each. Divided the other way it comes out at 7.48 billion,
    // which is the mistake this pins.
    expect(price).toBeGreaterThan(7e-9);
    expect(price).toBeLessThan(8e-9);
  });

  it('returns zero rather than dividing by an empty reserve', () => {
    expect(spotPrice(BigInt(0), CURVE_AT_BLOCK.tokenReserve, 18, 18)).toBe(0);
    expect(spotPrice(CURVE_AT_BLOCK.quoteReserve, BigInt(0), 18, 18)).toBe(0);
  });

  it('points at the launchpad page for this exact token', () => {
    expect(launchpadUrl()).toContain(SWIPE_TOKEN_LAUNCH.token);
    expect(launchpadUrl()).toMatch(/^https:\/\/www\.ponsfamily\.com\/launchpad\//);
  });
});

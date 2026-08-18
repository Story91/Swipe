import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

/**
 * The detail page bet panel and the exit rows move money, so they get the
 * same structural pins the swipe path has in
 * app/components/Main/swipeMoneyPath.test.ts. Same technique, same reason:
 * what is protected is an ordering between two statements and the absence of
 * certain shapes, and neither survives a unit test of a function.
 *
 * The invariants, for each of the two components:
 *
 *  - the address about to be written to is compared against the selected
 *    chain's live market with isWritableMarket(chainKey, <address>), before
 *    anything is sent
 *  - every send goes through marketWrite.write / marketWrite.writeCollateral,
 *    the one path that re-checks the address at send time and pins chainId
 *  - no address literal, no native value, no hand-rolled market id
 *
 * And for the exit rows one more, which is this file's own reason to exist:
 * the position is two sides, never a merged one. exitEarly is per side, one
 * address can hold YES and NO at once, and both older readers of positions()
 * collapsed to the larger side. The collapse is banned by shape.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const BET_PANEL = path.join(HERE, 'BetPanel.tsx');
const EXIT_PANEL = path.join(HERE, 'ExitPanel.tsx');
const TINDER_CARD = path.join(ROOT, 'app', 'components', 'Main', 'TinderCard.tsx');
const DETAIL_DIR = path.join(ROOT, 'app', 'prediction', '[id]');

/** Same property as the swipe test: the guarded value must be an address. */
const GUARD_CALL = /isWritableMarket\(\s*chainKey\s*,\s*([A-Za-z0-9_.?]+)\s*\)/;

/** Anything that can put a transaction on the wire from these components. */
const ANY_SEND = /marketWrite\.write\(|marketWrite\.writeCollateral\(|writeContract\s*\(/;

/** Comments stripped so prose cannot defeat or trigger an absence check. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const BET = stripComments(readFileSync(BET_PANEL, 'utf8'));
const EXIT = stripComments(readFileSync(EXIT_PANEL, 'utf8'));

const SURFACES: Array<[string, string]> = [
  ['BetPanel', BET],
  ['ExitPanel', EXIT],
];

describe('detail page money paths', () => {
  it.each(SURFACES)('%s guards on the target address, not just the chain', (name, code) => {
    const match = code.match(GUARD_CALL);
    expect(
      match,
      `${name} has no isWritableMarket(chainKey, <address>) call. It is the ` +
        'only thing stopping a transaction leaving for a contract that is ' +
        'not the selected chain market.'
    ).toBeTruthy();
    expect(
      match![1],
      `${name} calls isWritableMarket with something that does not look like ` +
        'an address. Gating on the chain alone lets money leave for a ' +
        'contract that does not exist on the selected chain.'
    ).toMatch(/address|target|market/i);
  });

  it.each(SURFACES)('%s runs the guard before any transaction is sent', (name, code) => {
    const guardAt = code.search(GUARD_CALL);
    const firstSend = code.search(ANY_SEND);

    expect(guardAt, `${name} lost its guard`).toBeGreaterThan(-1);
    expect(firstSend, `${name} sends nothing at all any more`).toBeGreaterThan(-1);
    expect(
      guardAt,
      `A send in ${name} now appears before the address guard. Whatever that ` +
        'call is, it can move money the guard was meant to refuse.'
    ).toBeLessThan(firstSend);
  });

  it.each(SURFACES)('%s checks the same address the delegate writes to', (name, code) => {
    const guard = code.match(GUARD_CALL);
    expect(guard).toBeTruthy();
    const guardedName = guard![1];

    // The guarded value is a binding declared in this file, and that binding
    // is the resolved market's address, which is where marketWrite.write
    // actually sends. Guarding anything else makes the check theatre.
    const declaration = new RegExp(
      'const\\s+' + guardedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*([^;]+);'
    ).exec(code);
    expect(
      declaration,
      `${name} guards \`${guardedName}\`, which is not a const declared in the file.`
    ).toBeTruthy();
    expect(
      declaration![1],
      `In ${name}, \`${guardedName}\` is not the resolved market's address.`
    ).toMatch(/market\??\.address/);
    expect(
      code,
      `${name} must resolve the market once, from useMarketWrite`
    ).toContain('const market = marketWrite.market;');
  });

  it.each(SURFACES)('%s owns no address, no ether and no direct send', (name, code) => {
    const literals = [...code.matchAll(/0x[0-9a-fA-F]{40}/g)].map((m) => m[0]);
    expect(
      literals,
      `A hardcoded contract address appeared in ${name}. The token and the ` +
        'market both come from lib/chains or they do not come at all.'
    ).toEqual([]);
    expect(
      code,
      `${name} sends native value. The market takes an ERC-20 and has no ` +
        'payable function, so any ether sent from here lands on an archived ' +
        'contract and stays there.'
    ).not.toMatch(/\bvalue:/);
    expect(
      /writeContract\s*\(/.test(code),
      `${name} sends a transaction directly. The send belongs in ` +
        'useMarketWrite, which re-checks the address at send time.'
    ).toBe(false);
    expect(
      code,
      `${name} imports wagmi's raw write hook. Sends go through useMarketWrite.`
    ).not.toMatch(/\buseWriteContract\b/);
  });

  it.each(SURFACES)('%s parses market ids rather than fabricating them', (name, code) => {
    expect(code, `${name} must parse the id with parseMarketId`).toContain('parseMarketId(');
    expect(code, `a hand-rolled prefix strip is in ${name}`).not.toMatch(/replace\(\s*['"]pred_/);
    expect(code, `a fabricated id fallback is in ${name}`).not.toMatch(/\|\|\s*Date\.now\(\)/);
  });

  it('BetPanel bets and approves through the delegate, spender = market', () => {
    expect(BET).toContain("functionName: 'placeBet'");
    expect(BET).toContain('marketWrite.write({');
    expect(BET).toContain("functionName: 'approve'");
    expect(
      BET,
      'the approval must go through marketWrite.writeCollateral, so the token ' +
        'is this chain\'s collateral rather than a Base literal'
    ).toContain('marketWrite.writeCollateral({');
    expect(
      BET,
      'the spender must be the market address the guard checked'
    ).toMatch(/args: \[market\.address,/);
  });

  it('ExitPanel exits through the delegate with the parsed id', () => {
    expect(EXIT).toContain("functionName: 'exitEarly'");
    expect(EXIT).toContain('marketWrite.write({');
    expect(
      EXIT,
      'the exit must be addressed by the parsed market number, per side, in ' +
        'raw collateral units'
    ).toContain('args: [BigInt(ref.numericId), isYes, amountUnits],');
  });

  it('ExitPanel keeps the two sides apart, one row each', () => {
    // The read returns both sides and the UI must too. The dominant-side
    // collapse is what SwipeMarkets and YourPosition do, and copying it here
    // renders a two-sided position as one and strands the smaller side.
    expect(EXIT).toContain('yesAmount');
    expect(EXIT).toContain('noAmount');
    expect(EXIT, 'the two sides must be rendered from one list').toContain("['yes', 'no'] as const");
    expect(
      EXIT,
      'ExitPanel compares the two sides against each other, which is the ' +
        'first step of collapsing them into one merged position.'
    ).not.toMatch(/yesAmount\s*[><]=?\s*(?:position\??\.)?noAmount|noAmount\s*[><]=?\s*(?:position\??\.)?yesAmount/);
    expect(
      EXIT,
      'the per-side decode must come from lib/chains/market, not a local pick'
    ).toContain('decodePositionSides(');
  });

  it('ExitPanel refuses on the quote before the wallet opens', () => {
    // The pre-check is the point: the contract's refusals cost a signature
    // and gas, the quote's refusal costs a sentence under a disabled button.
    expect(
      EXIT,
      'the exit preflight (exitQuote) is gone from ExitPanel'
    ).toContain('exitQuote({');
    expect(
      EXIT,
      'nothing reads the refusal any more, so the send no longer waits for it'
    ).toMatch(/quote\.refusal !== null/);
  });

  it('the surfaces are actually mounted where the plan says', () => {
    const tinder = stripComments(readFileSync(TINDER_CARD, 'utf8'));
    expect(
      tinder,
      'the exit list under the card deck is gone from TinderCard'
    ).toContain('<ExitPanel');
    expect(
      tinder,
      'TinderCard must hand ExitPanel the canonical redis id, because the ' +
        'numeric id alone cannot be parsed back to a market'
    ).toContain('predictionId={transformedPredictions[currentIndex].redisId}');

    const detail = readdirSync(DETAIL_DIR)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => stripComments(readFileSync(path.join(DETAIL_DIR, f), 'utf8')))
      .join('\n');
    expect(detail, 'the detail page lost its bet panel').toContain('<BetPanel');
    expect(detail, 'the detail page lost its exit rows').toContain('<ExitPanel');
  });
});

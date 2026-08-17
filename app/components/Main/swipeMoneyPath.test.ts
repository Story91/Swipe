import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { isWritableMarket, getWritableMarket } from '../../../lib/chains';
import { CONTRACTS } from '../../../lib/contract';
import { marketNumber, parseMarketId } from '../../../lib/marketId';

/**
 * The swipe is the flagship screen and it is the one that moves money.
 *
 * This file used to pin the opposite state: the swipe wrote to the archived V2
 * pool, the guard compared V2's address against Base's live market, and every
 * swipe bet was refused before any wallet opened. The last test here was a
 * deliberate tripwire that would fail on the day V3 routing landed. It has
 * fired. These are the invariants that replace it.
 *
 * Source-scanning rather than behavioural, following the precedent in
 * lib/chains/no-direct-imports.test.ts, because what is being protected is
 * structural: an ordering between two statements, and the absence of certain
 * shapes in certain files. Neither survives a unit test of a function.
 *
 * The invariant: every bet reaches the chain through handleStakeBet, whose
 * first executable statement compares the address it is about to write to
 * against the selected chain's live market. The ADDRESS half is the protection.
 * Gating on the chain alone would let a bet leave for a Base address while
 * Robinhood is selected, where there is no contract behind it and the tokens
 * are simply gone.
 *
 * What a redesign of the gesture is allowed to change: which side gets picked,
 * and when the dialog opens. Nothing else.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const TINDER_CARD = path.join(ROOT, 'app', 'components', 'Main', 'TinderCard.tsx');

/**
 * The guard, matched as a PROPERTY rather than as a sentence.
 *
 * An earlier version pinned the literal text
 * `if (!isWritableMarket(chainKey, CONTRACTS.V2.address)) {` and failed the
 * moment the guard was improved. A test that fails when the code gets better is
 * worse than no test, because whoever hits it deletes it. What is asserted is
 * the property that matters: isWritableMarket is called with the selected chain
 * and an address, and it runs before anything is sent.
 */
const GUARD_CALL = /isWritableMarket\(\s*chainKey\s*,\s*([A-Za-z0-9_.?]+)\s*\)/;

/** Anything that can put a transaction on the wire from this component. */
const ANY_SEND = /marketWrite\.write\(|marketWrite\.writeCollateral\(|writeContract\s*\(/;

/** Directories the gesture engine lives in. None of them may touch money. */
const GESTURE_PATHS = [
  path.join(ROOT, 'lib', 'gesture'),
  path.join(ROOT, 'lib', 'hooks', 'useSwipeGesture.ts'),
  path.join(ROOT, 'app', 'components', 'Main', 'SwipeCard.tsx'),
];

const MONEY_TOKENS =
  /\bwriteContract\b|\bplaceStake\b|\bplaceBet\b|\bhandleStakeBet\b|\bCONTRACTS\b|\buseWriteContract\b|\bmarketWrite\b|\buseMarketWrite\b/;

function walk(target: string, out: string[] = []): string[] {
  if (!existsSync(target)) return out;
  if (statSync(target).isFile()) {
    out.push(target);
    return out;
  }
  for (const entry of readdirSync(target)) {
    const full = path.join(target, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/**
 * Comments removed, so an absence check cannot be defeated or triggered by
 * prose. The comments in TinderCard.tsx name the banned forms in order to
 * explain why they are banned, and a bare substring search flags its own
 * documentation. Crude on purpose: it is only ever fed this one file.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** The body of a top-level handler, up to the next one. */
function handlerBody(src: string, name: string): string {
  const at = src.indexOf(`const ${name}`);
  expect(at, `${name} is gone from TinderCard.tsx`).toBeGreaterThan(-1);
  const after = src.slice(at);
  const next = after.indexOf('\n  const handle', 1);
  return next === -1 ? after : after.slice(0, next);
}

const CODE = stripComments(readFileSync(TINDER_CARD, 'utf8'));

describe('swipe money path', () => {
  it('guards the bet on the target address, not just the chain', () => {
    const match = CODE.match(GUARD_CALL);
    expect(
      match,
      'No isWritableMarket(chainKey, <address>) call remains in the swipe bet ' +
        'path. It is the only thing in this component stopping a bet leaving ' +
        'for a contract that is not the selected chain market.'
    ).toBeTruthy();
    // The second argument has to be an address. A bare chain check is the
    // failure this whole file exists to catch.
    expect(
      match![1],
      'isWritableMarket is being called with something that does not look ' +
        'like an address. Gating on the chain alone lets a bet leave for a ' +
        'contract that does not exist on the selected chain.'
    ).toMatch(/address|target|market/i);
  });

  it('runs the guard before any transaction is sent', () => {
    const guardAt = CODE.search(GUARD_CALL);
    const firstSend = CODE.search(ANY_SEND);

    expect(guardAt).toBeGreaterThan(-1);
    expect(firstSend).toBeGreaterThan(-1);
    expect(
      guardAt,
      'A send now appears before the address guard. Whatever that call is, it ' +
        'can move money the guard was meant to refuse.'
    ).toBeLessThan(firstSend);
  });

  it('writes to the same address it checked', () => {
    // The failure this catches: the guard keeps checking one address while the
    // transaction leaves for another, so the check becomes theatre.
    //
    // The send lives in useMarketWrite now and goes to marketWrite.market's own
    // address. So this resolves the guarded name back to that same value, and
    // then insists nothing in the body names an address of its own to compete
    // with it.
    const body = handlerBody(CODE, 'handleStakeBet');

    const guard = body.match(GUARD_CALL);
    expect(guard, 'handleStakeBet no longer calls isWritableMarket at all.').toBeTruthy();
    const guardedName = guard![1];

    // The guarded value has to be a binding declared in this function, not an
    // expression evaluated twice. Two evaluations can disagree; one cannot.
    const declaration = new RegExp(
      'const\\s+' + guardedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*([^;]+);'
    ).exec(body);
    expect(
      declaration,
      `The guard checks \`${guardedName}\`, which is not a const declared inside ` +
        'handleStakeBet. Guarding an inline expression means the check and the ' +
        'send can evaluate to different addresses.'
    ).toBeTruthy();

    // And that binding has to be the address of the market useMarketWrite
    // resolved, since that is where marketWrite.write actually sends.
    expect(
      declaration![1],
      `\`${guardedName}\` is not the resolved market's address. The guard would ` +
        'then be checking something other than the contract being written to.'
    ).toMatch(/market\??\.address/);
    expect(
      body,
      'handleStakeBet must resolve the market once, from useMarketWrite'
    ).toContain('const market = marketWrite.market;');
    expect(
      body,
      'the bet must be sent through marketWrite.write, which sends to that ' +
        'address, pins chainId and re-checks the guard at send time'
    ).toContain('marketWrite.write({');
    expect(
      body,
      'the bet must call V3 placeBet(predictionId, isYes, amount)'
    ).toContain("functionName: 'placeBet'");

    // Nothing in this function may name an address of its own, and nothing may
    // send a transaction directly, bypassing the delegate.
    const addresses = [...body.matchAll(/address:\s*([^,\n]+)/g)].map(m => m[1].trim());
    expect(
      addresses,
      `handleStakeBet names an address of its own (${addresses.join(', ')}). ` +
        'Anything other than the market useMarketWrite resolved is an address ' +
        'the guard did not check.'
    ).toEqual([]);
    expect(
      /writeContract\s*\(/.test(body),
      'handleStakeBet sends a transaction directly again. The send belongs in ' +
        'useMarketWrite, which re-checks the address at send time because the ' +
        'network switcher can move under an open dialog.'
    ).toBe(false);
  });

  it('approves the same contract that will pull the tokens', () => {
    const body = handlerBody(CODE, 'handleConfirmStake');

    expect(body, 'the collateral approval is gone').toContain("functionName: 'approve'");
    expect(
      body,
      'the approval must go through marketWrite.writeCollateral, so the token ' +
        'is this chain\'s collateral rather than a Base USDC literal. USDC and ' +
        'USDG share 6 decimals and differ in address, so a literal fails ' +
        'silently instead of reverting.'
    ).toContain('marketWrite.writeCollateral({');
    expect(
      body,
      'the spender must be the market address. An allowance granted to one ' +
        'contract while a different one calls transferFrom is an allowance ' +
        'that does nothing, and one granted to the wrong contract is a ' +
        'standing licence over the user\'s balance.'
    ).toMatch(/args: \[market\.address,/);
    expect(
      body,
      'handleConfirmStake must resolve the market from useMarketWrite, so the ' +
        'spender it approves is the same one handleStakeBet writes to'
    ).toContain('const market = marketWrite.market;');
    expect(
      body,
      'the dialog must answer marketWrite.ready before opening the wallet'
    ).toMatch(/if \(!marketWrite\.ready/);

    // No 20-byte literal anywhere in this file. Both the token and the spender
    // come from lib/chains or they do not come at all. The zero address is
    // exempt: it is the placeholder creator on the "no predictions" card, and
    // nothing can be sent to it because that card's id is refused upstream.
    const ZERO = '0x0000000000000000000000000000000000000000';
    const literals = [...CODE.matchAll(/0x[0-9a-fA-F]{40}/g)]
      .map(m => m[0])
      .filter(a => a.toLowerCase() !== ZERO);
    expect(
      literals,
      'a hardcoded contract address appeared in TinderCard.tsx'
    ).toEqual([]);
  });

  it('sends no native value from this file', () => {
    // V3 is collateralised in an ERC-20 and has no payable function at all, so
    // any `value:` on a write here is by construction aimed at an archived
    // contract. Unlike a failed token transfer, ether sent to an address with
    // no code does not revert: it lands, and nobody holds the key.
    expect(
      CODE,
      'a native-value send is back in TinderCard.tsx. V3 takes no ether.'
    ).not.toMatch(/\bvalue:/);

    expect(
      CODE,
      'placeStake and placeStakeWithToken are functions of the archived V2 ' +
        'pool. They do not exist on V3.'
    ).not.toMatch(/functionName: ['"]placeStake/);
  });

  it('never turns a v3 id into a fabricated market number', () => {
    // The bug this replaces, kept executable so it cannot be reintroduced by
    // someone who does not believe it: `pred_v3_2` does not contain 'v2', so it
    // took the else branch, parseInt('v3_2') is NaN, and `|| Date.now()` handed
    // a millisecond timestamp on as a market number. That number reached the
    // contract.
    const old = (id: string) =>
      id.includes('v2')
        ? parseInt(id.replace('pred_v2_', ''), 10) || Date.now()
        : parseInt(id.replace('pred_', ''), 10) || Date.now();

    expect(Number.isNaN(parseInt('v3_2', 10))).toBe(true);
    expect(old('pred_v3_2')).toBeGreaterThan(1e12);

    // What replaces it: the real number, or null.
    expect(marketNumber('pred_v3_2')).toBe(2);
    expect(parseMarketId('pred_v3_2')?.redisId).toBe('pred_v3_2');
    expect(marketNumber('pred_v9_2')).toBeNull();
    expect(marketNumber('nonsense')).toBeNull();
    expect(marketNumber(undefined)).toBeNull();

    // And that the component asks it, then refuses on null.
    const body = handlerBody(CODE, 'handleStakeBet');
    expect(body, 'handleStakeBet must parse the id, not strip a prefix').toContain(
      'const ref = parseMarketId(redisId);'
    );
    expect(
      body,
      'a null id must refuse the bet rather than fall through to a number'
    ).toMatch(/if \(!ref\) \{[\s\S]{0,400}?return false;/);
    expect(
      body,
      'the market number handed to placeBet must be the parsed one'
    ).toContain('const predictionId = ref.numericId;');

    // No hand-rolled prefix stripping and no invented fallback left anywhere in
    // the file, which is how four call sites came to disagree in the first place.
    expect(CODE, 'a hand-rolled prefix strip is back').not.toMatch(/replace\(\s*['"]pred_/);
    expect(CODE, 'a fabricated id fallback is back').not.toMatch(/\|\|\s*Date\.now\(\)/);
  });

  it('keeps the gesture engine ignorant of money', () => {
    // The engine reports that a direction was committed. Amounts, minimums,
    // self-bet checks and the address guard stay on the other side of that
    // callback. If any of these files needs a contract, the split has been
    // broken and the guard is no longer the only door.
    const offenders = GESTURE_PATHS.flatMap(p => walk(p))
      .filter(file => {
        // A test file may name these tokens; it sends nothing.
        if (/\.test\.tsx?$/.test(file)) return false;
        return MONEY_TOKENS.test(readFileSync(file, 'utf8'));
      })
      .map(f => path.relative(ROOT, f));

    expect(offenders).toEqual([]);
  });

  it('permits Base live market and still refuses the archived one', () => {
    // The behavioural half. The guard is worth something only if it answers
    // differently for the two addresses, and the direction matters now: the
    // swipe holds the live V3 address, which must pass, while the V2 address
    // this path used to write to must still be refused.
    const live = getWritableMarket('base');
    expect(live).not.toBeNull();
    expect(isWritableMarket('base', live!)).toBe(true);

    expect(isWritableMarket('base', CONTRACTS.V2.address)).toBe(false);
    expect(isWritableMarket('base', null)).toBe(false);
    // Same market, wrong chain. Holding an address is not permission to write
    // to it wherever the switcher happens to point.
    expect(isWritableMarket('robinhood', live!)).toBe(false);
  });
});

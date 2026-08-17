import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

/**
 * History must survive a failed read.
 *
 * Reported from production: transaction history and past bets disappear when
 * you leave the dashboard and come back. Two loaders caused it and both did the
 * same thing, which is to write an empty array on their way out of a path that
 * was not "the user has nothing".
 *
 *   fetchUserTransactions:   `result.success ? result.data : []` then set it,
 *                            so any non-success answer emptied the list.
 *   fetchAllUserPredictions: `if (!success) setAllUserPredictions([])` and
 *                            `if (predictions.length === 0)
 *                             setAllUserPredictions([])`.
 *
 * The second is the one that fires on every visit. This dashboard unmounts on a
 * tab switch and remounts fresh, so `allPredictions` is empty for a render or
 * two while its own fetch is in flight. The loader ran in that window, saw
 * nothing to join against, and cleared everything the user had.
 *
 * Source-scanned rather than behavioural, following swipeMoneyPath.test.ts and
 * claimPath.test.ts, because the property is the absence of a shape in two
 * specific functions and no unit test of a function will catch it coming back.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD = path.join(HERE, 'EnhancedUserDashboard.tsx');
const source = readFileSync(DASHBOARD, 'utf8');

/**
 * One function's body, from its declaration to the next one at that indent,
 * with comments stripped.
 *
 * Stripped because the comments in these two functions quote the broken code
 * they replaced, so a scan for the old shape finds its own tombstone and fails.
 * The property is about what executes, not about what is written about it.
 */
function body(declaration: string): string {
  const start = source.indexOf(declaration);
  expect(start, `${declaration} has been renamed; repoint this test`).toBeGreaterThan(-1);
  const rest = source.slice(start + declaration.length);
  const end = rest.search(/\n {2,9}const \w+ = (useCallback|async|\()/);
  const fn = end === -1 ? rest : rest.slice(0, end);
  return fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('a failed read never empties the history', () => {
  it('does not swap a non-success answer for an empty transaction list', () => {
    const fn = body('const fetchUserTransactions');
    expect(
      fn,
      'a failed fetch is being turned into an empty list again, which tells the ' +
        'user their history is gone when the server simply did not answer'
    ).not.toMatch(/success\s*\?[^;]*:\s*\[\]/);
    // And the failure has somewhere to go.
    expect(fn).toMatch(/setTransactionsError/);
  });

  it('does not clear the positions list on a failed stakes read', () => {
    const fn = body('const fetchAllUserPredictions');
    expect(fn).toMatch(/setStakesError/);
    expect(
      fn,
      'setAllUserPredictions([]) is back in this function; an empty array here ' +
        'is indistinguishable from the user having no positions'
    ).not.toMatch(/setAllUserPredictions\(\s*\[\s*\]\s*\)/);
  });

  it('treats predictions that have not loaded as not loaded, not as none', () => {
    const fn = body('const fetchAllUserPredictions');
    // The guard must still exist, and must return without writing state.
    expect(fn).toMatch(/predictions\.length === 0/);
    const guard = fn.slice(fn.indexOf('predictions.length === 0'));
    const untilReturn = guard.slice(0, guard.indexOf('return') + 6);
    expect(
      untilReturn,
      'the not-yet-loaded guard is clearing state on its way out again'
    ).not.toMatch(/setAllUserPredictions/);
  });
});

describe('the reads name the chain they are about', () => {
  it('asks for stakes on the selected chain, not whatever the server defaults to', () => {
    const fn = body('const fetchAllUserPredictions');
    expect(fn).toMatch(/getAllUserStakes=true[^`]*chain=\$\{claimChainKey\}/);
  });

  it('re-runs when the chain changes', () => {
    // Without the dependency the callback keeps the chain it captured on first
    // render, which is the default, and the switcher stops moving the data.
    const fn = body('const fetchAllUserPredictions');
    expect(fn).toMatch(/\}, \[[^\]]*claimChainKey[^\]]*\]\)/);
  });
});

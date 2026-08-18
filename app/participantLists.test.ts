import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

/**
 * A route that reads one participant list is reading half the app.
 *
 * RedisPrediction carries two of them. `participants` is written by the
 * archived V2 contract. `usdcParticipants` is written by /api/sync/usdc and
 * holds everyone who has bet since, which is the entire live product.
 *
 * Four routes read only the first, and each failure looked like something else:
 *
 *   /api/leaderboard        a wallet that bet 0.2 USDC was absent from the
 *                           board, not ranked low. And the addresses went into
 *                           a Set uncased, so one person written checksummed in
 *                           one array and lowercased in the other became two
 *                           rows under the same name.
 *   /api/activity           the recent activity panel showed three rows dated a
 *                           month old while people were betting that day.
 *   /api/claims/count       the badge that says money is waiting said zero to
 *                           anyone holding only a collateral position.
 *   /api/market/largest-stakes  ranked the archived contracts.
 *
 * This walks the routes rather than testing one of them, because the bug was
 * the same line copied four times and the fifth copy is what this is for.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(here, 'api');
const repoRoot = path.resolve(here, '..');

function routeFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, found);
    else if (/^route\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

/** Comments describe the bug on purpose, so they must not count as code. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const routes = routeFiles(apiDir);

/**
 * Routes that are allowed to see one list, and why each one is.
 *
 * Every entry is a route whose whole subject is the archived Base contracts, or
 * one that writes the array rather than reading it. A route gets on this list
 * by argument, not by being noisy: the point of the check is that a user-facing
 * read cannot quietly join them.
 */
const ARCHIVED_ONLY = [
  // Whole trees about V1 and V2 on Base, or about the dead SWIPE rewards.
  'app/api/admin/',
  'app/api/debug/',
  'app/api/sync/v2/',
  'app/api/swipe-claim/',
  'app/api/blockchain/',
  // Reads CONTRACTS.V2 directly and pins SYNC_CHAIN to base. Its participants
  // come off that contract, so there is no collateral list to read.
  'app/api/predictions/auto-sync/',
  'app/api/sync/prediction/',
  // Refuses live markets outright and answers only for V1 and V2, see the
  // archived-contracts-only marker in its response.
  'app/api/predictions/[id]/stakes/',
];

function archivedOnly(file: string): boolean {
  const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
  // propose writes `participants: []` on a brand new record. There are no
  // bettors of either kind yet, so there is nothing to read.
  if (rel === 'app/api/predictions/propose/route.ts') return true;
  return ARCHIVED_ONLY.some((prefix) => rel.startsWith(prefix));
}

describe('routes read both participant lists', () => {
  it('finds routes to check, so a green run means something', () => {
    expect(routes.length).toBeGreaterThan(20);
    // And several really do touch participants, or the assertion below passes
    // over an empty set and proves nothing.
    const touching = routes.filter((f) =>
      stripComments(readFileSync(f, 'utf8')).includes('participants')
    );
    expect(touching.length).toBeGreaterThan(3);
  });

  it('never reads participants without also reading usdcParticipants', () => {
    const oneEyed: string[] = [];
    for (const file of routes) {
      if (archivedOnly(file)) continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      // usdcParticipants contains the word, so blank it before matching the
      // plain read.
      const readsPlain = /\bparticipants\b/i.test(code.replace(/usdcParticipants/g, 'USDCLIST'));
      const readsCollateral = code.includes('usdcParticipants');
      if (readsPlain && !readsCollateral) {
        oneEyed.push(path.relative(repoRoot, file).replace(/\\/g, '/'));
      }
    }
    expect(
      oneEyed,
      `these read the archived participant list only, so every collateral bettor is invisible to them:\n${oneEyed.join('\n')}`
    ).toEqual([]);
  });
});

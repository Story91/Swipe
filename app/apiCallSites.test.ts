import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

/**
 * Every /api path the app fetches has to be a route that exists.
 *
 * Three had rotted at once and none of them failed loudly:
 *
 *   /api/user-transactions/sync-blockchain  the "read from chain" button in the
 *     portfolio. The 404 came back as an HTML page, response.json() threw on it,
 *     and the catch alerted "Failed to sync from blockchain". A user reads that
 *     as a bad day, not as a button that has never worked.
 *
 *   /api/sync  posted after a collateral claim to refresh the pools. The catch
 *     logged to the console and the pools quietly stayed stale. app/api/sync
 *     holds prediction, usdc and v2 and no handler of its own.
 *
 *   /api/audit  the whole audit log screen, whose route was never written and
 *     whose data nothing has ever recorded.
 *
 * All three typechecked, all three built, and the suite was green. A string
 * holding a URL is not checked by anything, which is why this walks them.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = here;
const repoRoot = path.resolve(here, '..');

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

/**
 * The /api paths a file asks for.
 *
 * `${...}` collapses to a marker so /api/predictions/${id} and
 * /api/predictions/[id] compare equal. The query string is dropped: whether a
 * route reads ?chain= is a different question from whether it exists.
 */
function apiPaths(source: string): string[] {
  const found = new Set<string>();
  const pattern = /['"`](\/api\/[A-Za-z0-9_\-/[\]${}.]*)/g;
  for (const match of source.matchAll(pattern)) {
    const raw = match[1]
      .replace(/\$\{[^}]*\}/g, ':dynamic')
      // A template with a call inside it, `${encodeURIComponent(x)}`, leaves a
      // trailing fragment once the braces are stripped. Cut at the first one.
      .replace(/\$\{.*$/, ':dynamic')
      .split('?')[0]
      .replace(/\/$/, '');
    if (raw && raw !== '/api') found.add(raw);
  }
  return [...found];
}

/** Does app/ hold a route handler for this path? */
function handlerExists(urlPath: string): boolean {
  const segments = urlPath.split('/').filter(Boolean);
  let dir = appDir;
  for (const segment of segments) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
    const entries = readdirSync(dir);
    const dynamic = entries.find((e) => /^\[.+\]$/.test(e));
    const next = segment === ':dynamic' ? dynamic : (entries.find((e) => e === segment) ?? dynamic);
    if (!next) return false;
    dir = path.join(dir, next);
  }
  return existsSync(path.join(dir, 'route.ts')) || existsSync(path.join(dir, 'route.tsx'));
}

// A route naming its own path in a comment is not a caller of it.
const callers = [...sourceFiles(appDir), ...sourceFiles(path.join(repoRoot, 'lib'))].filter(
  (f) => !path.relative(repoRoot, f).replace(/\\/g, '/').startsWith('app/api/')
);

describe('every fetched api path is a route', () => {
  it('finds paths to check, so a green run means something', () => {
    const all = callers.flatMap((f) => apiPaths(readFileSync(f, 'utf8')));
    // If the pattern ever stops matching, the assertion below passes over an
    // empty list and proves nothing. That is the failure this guards.
    expect(all.length).toBeGreaterThan(20);
  });

  it('has a route.ts behind every one of them', () => {
    const dead: string[] = [];
    for (const file of callers) {
      for (const urlPath of apiPaths(readFileSync(file, 'utf8'))) {
        if (!handlerExists(urlPath)) {
          dead.push(`${path.relative(repoRoot, file).replace(/\\/g, '/')} fetches ${urlPath}`);
        }
      }
    }
    expect(dead, `these fetches 404:\n${dead.join('\n')}`).toEqual([]);
  });
});

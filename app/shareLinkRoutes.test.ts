import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

/**
 * Every link the app hands to someone else has to land on a route.
 *
 * app/usdc-markets/prediction/[id]/ held a layout.tsx and no page.tsx. Next does
 * not route a segment without a page, so the path 404d, and it was absent from
 * .next/routes-manifest.json in every build. The markets grid shared that URL
 * on Farcaster, X and everywhere else, so every share sent from that screen was
 * a dead link, and nothing in the app noticed: it compiled, it typechecked, and
 * the tests were green.
 *
 * A share URL is the one kind of link nobody on the team clicks, because the
 * person who follows it is somewhere else. So this walks the source, collects
 * the app-relative paths that get built into shareable URLs, and checks each one
 * against the route tree on disk.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = here;
const repoRoot = path.resolve(here, '..');

/** Every .ts and .tsx file under a directory. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, found);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Paths interpolated into a shareable URL.
 *
 * Matches the two shapes the app uses, `${window.location.origin}/x/y` and
 * `${URL}/x/y`, and normalises `${anything}` segments to a dynamic marker so
 * /prediction/${id} and /prediction/[id] compare equal.
 */
function sharedPaths(source: string): string[] {
  const paths = new Set<string>();
  const pattern = /\$\{(?:window\.location\.origin|URL)\}(\/[A-Za-z0-9_\-/$\{\}.]*)/g;
  for (const match of source.matchAll(pattern)) {
    const raw = match[1]
      .replace(/\$\{[^}]*\}/g, ':dynamic')
      .replace(/\?.*$/, '')
      .replace(/\/$/, '');
    // /api/... is a route handler, checked separately below.
    if (raw && !raw.startsWith('/api/')) paths.add(raw);
  }
  return [...paths];
}

/** A file under public/, like /hero.png, rather than a route. */
function isStaticAsset(urlPath: string): boolean {
  return /\.[a-z0-9]{2,4}$/i.test(urlPath);
}

/** Does the app router serve this path? A segment needs a page, not a layout. */
function routeExists(urlPath: string): boolean {
  const segments = urlPath.split('/').filter(Boolean);
  let dir = appDir;
  for (const segment of segments) {
    if (!statSync(dir).isDirectory()) return false;
    const entries = readdirSync(dir);
    const literal = entries.find((e) => e === segment);
    // A dynamic segment in the URL matches a [param] directory, and a literal
    // one matches its own name or falls back to a [param] catch.
    const dynamic = entries.find((e) => /^\[.+\]$/.test(e));
    const next = segment === ':dynamic' ? dynamic : (literal ?? dynamic);
    if (!next) return false;
    dir = path.join(dir, next);
  }
  return existsSync(path.join(dir, 'page.tsx')) || existsSync(path.join(dir, 'page.ts'));
}

/** Route handlers, for the /api paths a card image is fetched from. */
function handlerExists(urlPath: string): boolean {
  const segments = urlPath.split('/').filter(Boolean);
  let dir = appDir;
  for (const segment of segments) {
    const entries = readdirSync(dir);
    const literal = entries.find((e) => e === segment);
    const dynamic = entries.find((e) => /^\[.+\]$/.test(e));
    const next = segment === ':dynamic' ? dynamic : (literal ?? dynamic);
    if (!next) return false;
    dir = path.join(dir, next);
  }
  return existsSync(path.join(dir, 'route.tsx')) || existsSync(path.join(dir, 'route.ts'));
}

const files = [...sourceFiles(appDir), ...sourceFiles(path.join(repoRoot, 'lib'))];

describe('every shared link lands somewhere', () => {
  it('finds share URLs to check, so a passing run means something', () => {
    const all = files.flatMap((f) => sharedPaths(readFileSync(f, 'utf8')));
    // If this drops to zero the pattern stopped matching and the test below is
    // asserting over an empty list, which is the failure mode this guards.
    expect(all.length).toBeGreaterThan(2);
  });

  it('points at a page, not at a directory that only holds a layout', () => {
    const dead: string[] = [];
    for (const file of files) {
      for (const urlPath of sharedPaths(readFileSync(file, 'utf8'))) {
        // A static asset is served out of public/ and has no route. It still
        // has to exist, so it is checked, just against a different tree.
        const ok = isStaticAsset(urlPath)
          ? existsSync(path.join(repoRoot, 'public', urlPath))
          : routeExists(urlPath);
        if (!ok) {
          dead.push(`${path.relative(repoRoot, file)} shares ${urlPath}`);
        }
      }
    }
    expect(dead, `these links 404:\n${dead.join('\n')}`).toEqual([]);
  });

  it('serves the card image route the market page names', () => {
    // The page's own metadata builds this one, and a missing card is a blank
    // grey box in a feed rather than an error anyone sees.
    expect(handlerExists('/api/og/usdc-prediction/:dynamic')).toBe(true);
  });
});

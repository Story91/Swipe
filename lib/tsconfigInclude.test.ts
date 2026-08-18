import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

/**
 * tsconfig.json's include list stays at four entries.
 *
 * `next build` rewrites this file. It appends a glob for whatever `distDir` it
 * ran with, and it does it silently, on every build. next.config.mjs takes
 * NEXT_DIST_DIR precisely so a verification build does not fight a running dev
 * server, and the cost nobody noticed is that each of those builds leaves its
 * own line behind.
 *
 * Eight agents building in parallel one evening left ten entries: .next-check,
 * .next-hotfix, .next-mgfilter, .next-mx, .next-pnl, .next-pnlog,
 * .next-pnltable, .next-r2, .next-spark, .next-strip. Nine of those directories
 * were then deleted, and `tsc --noEmit` answers a glob pointing at a directory
 * that no longer exists with TS6053, once per file it expected to find. Eighty
 * one errors, none of them a type error, and three separate agents reported the
 * resulting wall as "a race, not a real failure" while it hid whether anything
 * real was in there.
 *
 * The list is a fact about the repo, not about whoever last ran a build. If
 * this fails, a build wrote to it: reset the four entries and delete the
 * directory.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED = [
  '**/*.ts',
  '**/*.tsx',
  '.next/types/**/*.ts',
  'next-env.d.ts',
];

describe('tsconfig include', () => {
  const config = JSON.parse(readFileSync(path.join(repoRoot, 'tsconfig.json'), 'utf8'));

  it('holds exactly the four entries the repo needs', () => {
    expect(config.include).toEqual(EXPECTED);
  });

  it('names no build directory but the shared one', () => {
    const strays = (config.include as string[]).filter(
      (glob) => glob.startsWith('.next-')
    );
    expect(
      strays,
      `a build wrote these in. Reset include to the four entries and delete the directories:\n${strays.join('\n')}`
    ).toEqual([]);
  });
});

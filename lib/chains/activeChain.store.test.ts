import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * One selected chain for the whole app, not one per component.
 *
 * useActiveChain was a plain useState inside the hook, and twenty seven call
 * sites across twenty five files each held their own copy. Pressing the
 * switcher updated the switcher. Every other component kept the value it had
 * read from localStorage when it mounted, and only noticed if it happened to
 * remount.
 *
 * What that looked like in production: a market that exists only on Base
 * rendering under Robinhood's name, with Base's pools, on a network where that
 * market does not exist. Tapping it opens a bet dialog for nothing.
 *
 * These test the store rather than the hook, because the store is the part that
 * has to be shared and the part that was not.
 */

const STORAGE_KEY = 'swipe:active-chain';

let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    },
  });
  vi.resetModules();
});

describe('the selected chain is shared', () => {
  it('tells every subscriber about a change, not just the one that set it', async () => {
    const { setActiveChain, subscribe } = await import('./activeChain');

    // Two independent watchers, standing in for two components on screen.
    let a = 0;
    let b = 0;
    const stopA = subscribe(() => { a += 1; });
    const stopB = subscribe(() => { b += 1; });

    setActiveChain('robinhood');

    // The whole point. Before this was a store, only the component that called
    // the setter re-rendered and the other one kept showing the old chain.
    expect(a).toBe(1);
    expect(b).toBe(1);

    // Setting the same value again is not a change and must not churn renders.
    setActiveChain('robinhood');
    expect(a).toBe(1);

    stopA();
    setActiveChain('base');
    expect(a).toBe(1);
    expect(b).toBe(2);
    stopB();
  });

  it('persists the choice so the next visit starts there', async () => {
    const { setActiveChain } = await import('./activeChain');
    setActiveChain('robinhood');
    expect(store[STORAGE_KEY]).toBe('robinhood');
  });

  it('refuses a value that is not a chain, rather than trusting storage', async () => {
    const { parseChainKey } = await import('./activeChain');
    expect(parseChainKey('robinhood')).toBe('robinhood');
    expect(parseChainKey('base')).toBe('base');
    // Prototype walkers must not resolve to something that is not a chain.
    expect(parseChainKey('__proto__')).toBe('base');
    expect(parseChainKey('toString')).toBe('base');
    expect(parseChainKey('nonsense')).toBe('base');
    expect(parseChainKey(null)).toBe('base');
  });
});

describe('the hook does not hold its own copy', () => {
  it('reads through useSyncExternalStore, not useState', async () => {
    const { readFileSync } = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(here, 'activeChain.ts'), 'utf8');

    expect(source).toMatch(/useSyncExternalStore\(subscribe, getSnapshot, getServerSnapshot\)/);
    // A useState for the chain key inside the hook is the bug coming back.
    expect(
      source,
      'useActiveChain is holding its own copy of the chain again, so the switcher ' +
        'will update one component and leave the rest on the chain they mounted with'
    ).not.toMatch(/useState<ChainKey>/);
  });

  it('renders the default on the server, so hydration matches', async () => {
    const { readFileSync } = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(here, 'activeChain.ts'), 'utf8');
    expect(source).toMatch(/function getServerSnapshot\(\): ChainKey \{\s*return DEFAULT_CHAIN_KEY;/);
  });
});

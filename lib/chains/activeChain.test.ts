import { describe, it, expect } from 'vitest';
import {
  ACTIVE_CHAIN_KEY,
  parseChainKey,
  selectableChains,
} from './activeChain';
import { CHAINS, DEFAULT_CHAIN_KEY } from './index';

describe('parseChainKey', () => {
  it('accepts every configured chain', () => {
    for (const key of Object.keys(CHAINS)) {
      expect(parseChainKey(key)).toBe(key);
    }
  });

  it('falls back to the default for anything unrecognised', () => {
    expect(parseChainKey(null)).toBe(DEFAULT_CHAIN_KEY);
    expect(parseChainKey(undefined)).toBe(DEFAULT_CHAIN_KEY);
    expect(parseChainKey('')).toBe(DEFAULT_CHAIN_KEY);
    expect(parseChainKey('ethereum')).toBe(DEFAULT_CHAIN_KEY);
    expect(parseChainKey('__proto__')).toBe(DEFAULT_CHAIN_KEY);
  });

  it('uses a namespaced storage key', () => {
    expect(ACTIVE_CHAIN_KEY).toBe('swipe:active-chain');
  });
});

describe('selectableChains', () => {
  it('hides testnets by default', () => {
    const keys = selectableChains();
    expect(keys).toContain('base');
    expect(keys).not.toContain('robinhoodTestnet');
  });

  it('includes testnets when asked', () => {
    expect(selectableChains(true)).toContain('robinhoodTestnet');
  });

  it('only ever returns known chains', () => {
    for (const key of selectableChains(true)) {
      expect(CHAINS[key]).toBeDefined();
    }
  });

  it('offers at least one chain that accepts writes', () => {
    const writable = selectableChains(true).filter((k) => !CHAINS[k].readOnly);
    expect(writable.length).toBeGreaterThan(0);
  });
});

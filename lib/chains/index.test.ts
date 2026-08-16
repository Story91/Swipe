import { describe, it, expect } from 'vitest';
import {
  CHAINS,
  getChainConfig,
  DEFAULT_CHAIN_KEY,
  isReadOnlyChain,
  getWritableMarket,
  chainList,
  supportedChains,
} from './index';

describe('chain registry', () => {
  it('defaults to Base', () => {
    expect(DEFAULT_CHAIN_KEY).toBe('base');
    expect(getChainConfig().viemChain.id).toBe(8453);
  });

  it('exposes the verified Robinhood chain ids', () => {
    expect(CHAINS.robinhood.viemChain.id).toBe(4663);
    expect(CHAINS.robinhoodTestnet.viemChain.id).toBe(46630);
  });

  it('uses ETH as the native gas token on every chain', () => {
    for (const cfg of Object.values(CHAINS)) {
      expect(cfg.viemChain.nativeCurrency.symbol).toBe('ETH');
      expect(cfg.viemChain.nativeCurrency.decimals).toBe(18);
    }
  });

  it('declares a 6-decimal stablecoin on every chain', () => {
    for (const cfg of Object.values(CHAINS)) {
      expect(cfg.stable.decimals).toBe(6);
    }
  });

  it('pins Base USDC to the canonical address', () => {
    expect(CHAINS.base.stable.address.toLowerCase())
      .toBe('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
  });

  it('pins Robinhood mainnet collateral to Paxos USDG, not an explorer lookalike', () => {
    expect(CHAINS.robinhood.stable.symbol).toBe('USDG');
    expect(CHAINS.robinhood.stable.address.toLowerCase())
      .toBe('0x5fc5360d0400a0fd4f2af552add042d716f1d168');
  });

  it('never returns an empty rpc url', () => {
    for (const cfg of Object.values(CHAINS)) {
      expect(cfg.rpcUrl).toMatch(/^https?:\/\//);
    }
  });

  it('throws on an unknown chain key', () => {
    // @ts-expect-error deliberately invalid key
    expect(() => getChainConfig('ethereum')).toThrow(/unknown chain/i);
  });
});

describe('chain registration for wagmi', () => {
  it('lists the default chain first, because wagmi connects on chains[0]', () => {
    expect(chainList()[0].key).toBe(DEFAULT_CHAIN_KEY);
  });

  it('registers more than one chain, or the switcher cannot work', () => {
    // wagmi refuses to read or sign on a chain it was never given.
    expect(supportedChains().length).toBeGreaterThan(1);
  });

  it('hides testnets unless explicitly enabled', () => {
    expect(chainList().some((c) => c.viemChain.testnet)).toBe(false);
  });

  it('gives every registered chain a usable rpc url', () => {
    for (const chain of chainList()) {
      expect(chain.rpcUrl).toMatch(/^https?:\/\//);
    }
  });

  it('has no duplicate chain ids, which would collide in transports', () => {
    const ids = supportedChains().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('read-only chains', () => {
  it('marks Base read-only: its contracts are owned by a lost key', () => {
    expect(isReadOnlyChain('base')).toBe(true);
  });

  it('offers no writable market on a read-only chain', () => {
    expect(getWritableMarket('base')).toBeNull();
  });

  it('never routes writes at the old dual pool, which nobody controls', () => {
    const legacy = CHAINS.base.contracts.dualPool;
    expect(legacy).toBeDefined();
    expect(getWritableMarket('base')).not.toBe(legacy);
  });

  it('keeps Robinhood writable', () => {
    expect(isReadOnlyChain('robinhood')).toBe(false);
    expect(isReadOnlyChain('robinhoodTestnet')).toBe(false);
  });

  it('returns null rather than the zero address when no market is deployed yet', () => {
    // Env-driven, so in a bare checkout this is the unset case.
    const market = getWritableMarket('robinhood');
    expect(market === null || /^0x[0-9a-fA-F]{40}$/.test(market)).toBe(true);
    expect(market).not.toBe('0x0000000000000000000000000000000000000000');
  });
});

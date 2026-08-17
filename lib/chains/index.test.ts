import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CHAINS,
  getChainConfig,
  DEFAULT_CHAIN_KEY,
  isReadOnlyChain,
  hasArchivedMarkets,
  getWritableMarket,
  isWritableMarket,
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

describe('which chains take new bets', () => {
  const ARCHIVED_OWNER_LOST = ['v2', 'dualPool'] as const;

  it('gives Base a live market, because V3 is deployed there', () => {
    expect(getWritableMarket('base')).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(isReadOnlyChain('base')).toBe(false);
  });

  it('reaches that address without a NEXT_PUBLIC_ env var being set', () => {
    // A non-NEXT_PUBLIC_ address is undefined in the browser, so the UI would
    // see the zero address while the server saw the real one. Base's market is
    // a literal fallback for exactly that reason, and this fails if someone
    // turns it into an env-only value.
    expect(CHAINS.base.contracts.market).toBeDefined();
    expect(CHAINS.base.contracts.market).not.toBe('0x0000000000000000000000000000000000000000');
  });

  it('never routes a write at a contract whose owner key is lost', () => {
    const market = getWritableMarket('base');
    for (const name of ARCHIVED_OWNER_LOST) {
      const archived = CHAINS.base.contracts[name];
      expect(archived).toBeDefined();
      expect(archived).not.toBe(market);
      expect(isWritableMarket('base', archived as string)).toBe(false);
    }
  });

  it('still reports Base as holding archived markets, which is a separate thing', () => {
    // Base is writable again *and* carries markets nobody can resolve. One
    // boolean could not say both, which is why the readOnly flag was replaced.
    expect(hasArchivedMarkets('base')).toBe(true);
    expect(isReadOnlyChain('base')).toBe(false);
  });

  it('treats a chain with no deployed market as read-only', () => {
    // Robinhood mainnet, today: the address is env-driven and unset here.
    expect(getWritableMarket('robinhood')).toBeNull();
    expect(isReadOnlyChain('robinhood')).toBe(true);
    expect(hasArchivedMarkets('robinhood')).toBe(false);
  });

  it('derives read-only from the market address, so the two cannot disagree', () => {
    for (const key of Object.keys(CHAINS) as (keyof typeof CHAINS)[]) {
      expect(isReadOnlyChain(key)).toBe(getWritableMarket(key) === null);
    }
  });

  it('returns null rather than the zero address when no market is deployed yet', () => {
    const market = getWritableMarket('robinhood');
    expect(market === null || /^0x[0-9a-fA-F]{40}$/.test(market)).toBe(true);
    expect(market).not.toBe('0x0000000000000000000000000000000000000000');
  });
});

describe('the address a write is actually addressed to', () => {
  const BASE_V2 = CHAINS.base.contracts.v2 as string;
  // Mixed case on purpose: addresses are compared case-insensitively.
  const POOL = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';

  // CHAINS is built from process.env at module load, so a chain can only be
  // given a market by re-importing the module under a stubbed environment.
  async function withPool(value: string) {
    vi.stubEnv('ROBINHOOD_USDG_DUALPOOL', value);
    vi.resetModules();
    return import('./index');
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('refuses an archived contract on a chain that is live again', () => {
    // Base takes new bets on V3 while its old contracts stay dead. Being on a
    // writable chain is not permission to write to any address on it.
    expect(isWritableMarket('base', BASE_V2)).toBe(false);
    expect(isWritableMarket('base', CHAINS.base.contracts.dualPool as string)).toBe(false);
  });

  it('accepts the live market on Base', () => {
    expect(isWritableMarket('base', CHAINS.base.contracts.market as string)).toBe(true);
  });

  it('refuses a missing target instead of reading it as a match', () => {
    expect(isWritableMarket('robinhood', null)).toBe(false);
    expect(isWritableMarket('robinhood', undefined)).toBe(false);
    expect(isWritableMarket('robinhood', '')).toBe(false);
  });

  it('refuses when the selected chain has no market deployed', async () => {
    const chains = await withPool('');
    expect(chains.getWritableMarket('robinhood')).toBeNull();
    expect(chains.isWritableMarket('robinhood', BASE_V2)).toBe(false);
  });

  it("still refuses another chain's contract once this chain has a market", async () => {
    // The regression this guard exists for. Configuring the pool address is the
    // first step of the V3 migration, and from that moment the chain check on
    // its own starts passing — while a caller writing to a Base constant would
    // be sending the stake to an address that holds no contract on this chain.
    const chains = await withPool(POOL);

    expect(chains.getWritableMarket('robinhood')).toBe(POOL); // the chain check now passes
    expect(chains.isWritableMarket('robinhood', BASE_V2)).toBe(false);
  });

  it('accepts this chain\'s market in whatever case it is written', async () => {
    const chains = await withPool(POOL);
    expect(chains.isWritableMarket('robinhood', POOL)).toBe(true);
    expect(chains.isWritableMarket('robinhood', POOL.toLowerCase())).toBe(true);
  });
});

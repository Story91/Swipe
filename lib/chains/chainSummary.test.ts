import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import type { PublicClient } from 'viem';
import {
  chainOptions,
  formatAmount,
  formatBps,
  readChainStats,
  selectChain,
  type ChainOption,
} from './chainSummary';
import { CHAINS } from './index';
import { getMarketContract } from './market';
import type { ChainKey } from './types';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

/**
 * A chain's contracts, as the RPC would answer them. Every number the chooser
 * shows comes through here, which is the point: change a value in this object
 * and the value the card would print has to change with it.
 */
interface FakeChain {
  /** platform, creator, earlyExit, minBet - the shape of getFeeConfig(). */
  fees: [bigint, bigint, bigint, bigint];
  collateral: `0x${string}`;
  symbol: string;
  decimals: number;
  balance: bigint;
  registeredIds: number[];
  failMulticall?: boolean;
  failBalance?: boolean;
}

function fakeClient(chain: FakeChain): PublicClient {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'getFeeConfig':
          return chain.fees;
        case 'collateral':
          return chain.collateral;
        case 'symbol':
          return chain.symbol;
        case 'decimals':
          return chain.decimals;
        case 'balanceOf':
          if (chain.failBalance) throw new Error('rpc refused');
          return chain.balance;
        default:
          throw new Error(`unexpected read: ${functionName}`);
      }
    },
    multicall: async ({ contracts }: { contracts: { args: readonly bigint[] }[] }) => {
      if (chain.failMulticall) throw new Error('no multicall here');
      return contracts.map((call) => ({
        status: 'success',
        // predictions(id) returns `registered` first; the rest is padding the
        // reader never looks at.
        result: [chain.registeredIds.includes(Number(call.args[0])), '0x0', BigInt(0)],
      }));
    },
  } as unknown as PublicClient;
}

const BASE_TODAY: FakeChain = {
  fees: [BigInt(300), BigInt(50), BigInt(500), BigInt(100000)],
  collateral: CHAINS.base.stable.address,
  symbol: 'USDC',
  decimals: 6,
  balance: BigInt(12_500_000),
  registeredIds: [1, 2, 3, 4],
};

function option(key: ChainKey): ChainOption {
  const found = chainOptions(true).find((o) => o.key === key);
  if (!found) throw new Error(`no option for ${key}`);
  return found;
}

describe('which chains the chooser offers', () => {
  it('offers no testnet unless testnets are switched on', () => {
    const keys = chainOptions(false).map((o) => o.key);
    expect(keys).not.toContain('robinhoodTestnet');
    for (const key of keys) {
      expect(CHAINS[key].viemChain.testnet).not.toBe(true);
    }
  });

  it('offers only chains the app actually has, never an invented key', () => {
    for (const showTestnets of [false, true]) {
      for (const opt of chainOptions(showTestnets)) {
        expect(Object.prototype.hasOwnProperty.call(CHAINS, opt.key)).toBe(true);
        expect(opt.label).toBe(CHAINS[opt.key].label);
      }
    }
  });

  it('adds the testnet, still marked as one, when they are switched on', () => {
    const testnet = chainOptions(true).find((o) => o.key === 'robinhoodTestnet');
    expect(testnet).toBeDefined();
    expect(testnet!.testnet).toBe(true);
  });

  it('shows a chain with no market contract rather than hiding it, and says why', () => {
    // Hiding it is worse than saying it takes no bets: positions on a chain
    // that stops taking bets still have to be reachable.
    expect(getMarketContract('robinhoodTestnet')).toBeNull();
    const testnet = option('robinhoodTestnet');
    expect(testnet.selectable).toBe(false);
    expect(testnet.selectable === false && testnet.reason.length).toBeGreaterThan(0);
  });

  it('marks both live deployments selectable and carries their own contracts', () => {
    const base = option('base');
    const robinhood = option('robinhood');
    if (!base.selectable || !robinhood.selectable) throw new Error('both should be live');

    expect(base.market.chainId).toBe(8453);
    expect(robinhood.market.chainId).toBe(4663);
    expect(base.market.address).not.toBe(robinhood.market.address);
    expect(base.market.collateral.symbol).toBe('USDC');
    expect(robinhood.market.collateral.symbol).toBe('USDG');
  });
});

describe('picking a chain', () => {
  it('refuses a chain with no market contract, and records nothing', async () => {
    const switchChain = vi.fn(async () => undefined);
    const setChain = vi.fn();

    const result = await selectChain({
      option: option('robinhoodTestnet'),
      current: 'base',
      isConnected: true,
      switchChain,
      setChain,
    });

    expect(result).toBe('unavailable');
    expect(setChain).not.toHaveBeenCalled();
    expect(switchChain).not.toHaveBeenCalled();
  });

  it('moves the wallet first and waits for it before recording the choice', async () => {
    // The order is the whole guarantee. Recorded first, the app's idea of the
    // current chain and the wallet's can disagree indefinitely, and a read with
    // no explicit chainId runs on the wallet's chain while the labels follow
    // the stored preference.
    const order: string[] = [];
    let release: () => void = () => {};
    const walletPrompt = new Promise<void>((resolve) => {
      release = resolve;
    });

    const switchChain = vi.fn(async () => {
      order.push('switch');
      await walletPrompt;
    });
    const setChain = vi.fn(() => {
      order.push('record');
    });

    const pending = selectChain({
      option: option('robinhood'),
      current: 'base',
      isConnected: true,
      switchChain,
      setChain,
    });

    // The wallet has been asked and has not answered. Nothing may be recorded
    // yet: a switchChain that is called but not awaited passes an order check
    // and still records against a wallet that never moved.
    await Promise.resolve();
    expect(switchChain).toHaveBeenCalledWith({ chainId: 4663 });
    expect(setChain).not.toHaveBeenCalled();

    release();
    expect(await pending).toBe('selected');
    expect(order).toEqual(['switch', 'record']);
    expect(setChain).toHaveBeenCalledWith('robinhood');
  });

  it('leaves the active chain alone when the wallet declines', async () => {
    const switchChain = vi.fn(async () => {
      throw new Error('User rejected the request.');
    });
    const setChain = vi.fn();

    const result = await selectChain({
      option: option('robinhood'),
      current: 'base',
      isConnected: true,
      switchChain,
      setChain,
    });

    expect(result).toBe('declined');
    expect(setChain).not.toHaveBeenCalled();
  });

  it('records the choice with no wallet to move', async () => {
    const switchChain = vi.fn(async () => undefined);
    const setChain = vi.fn();

    const result = await selectChain({
      option: option('robinhood'),
      current: 'base',
      isConnected: false,
      switchChain,
      setChain,
    });

    expect(result).toBe('selected');
    expect(switchChain).not.toHaveBeenCalled();
    expect(setChain).toHaveBeenCalledWith('robinhood');
  });

  it('does not prompt for the chain already selected', async () => {
    const switchChain = vi.fn(async () => undefined);
    const setChain = vi.fn();

    const result = await selectChain({
      option: option('base'),
      current: 'base',
      isConnected: true,
      switchChain,
      setChain,
    });

    expect(result).toBe('unchanged');
    expect(switchChain).not.toHaveBeenCalled();
    expect(setChain).not.toHaveBeenCalled();
  });
});

describe('what a card says comes from the contract', () => {
  it('reports the deployed fees and minimum bet, in the collateral it reads', async () => {
    const stats = await readChainStats('base', {
      client: fakeClient(BASE_TODAY),
      account: '0x1111111111111111111111111111111111111111',
      probeLimit: 8,
    });

    // The values verified on both deployments on 2026-08-17.
    expect(stats.fees).toEqual({ platformBps: 300, creatorBps: 50, earlyExitBps: 500 });
    expect(stats.minBet).toBe(BigInt(100000));
    expect(formatBps(stats.fees.platformBps)).toBe('3%');
    expect(formatBps(stats.fees.creatorBps)).toBe('0.5%');
    expect(formatBps(stats.fees.earlyExitBps)).toBe('5%');
    expect(formatAmount(stats.minBet, stats.collateral.decimals)).toBe('0.1');
  });

  it('changes what it shows when the contract changes, rather than reciting config', async () => {
    // setPlatformFee, setCreatorFee, setEarlyExitFee and setMinBet all exist on
    // V3 and the owner can call them after deploy. A card built from constants
    // would keep saying 3% and 0.1 forever.
    const changed = await readChainStats('base', {
      client: fakeClient({
        ...BASE_TODAY,
        fees: [BigInt(1200), BigInt(0), BigInt(250), BigInt(5_000_000)],
      }),
      probeLimit: 8,
    });

    expect(formatBps(changed.fees.platformBps)).toBe('12%');
    expect(formatBps(changed.fees.creatorBps)).toBe('0%');
    expect(formatBps(changed.fees.earlyExitBps)).toBe('2.5%');
    expect(formatAmount(changed.minBet, changed.collateral.decimals)).toBe('5');

    const today = await readChainStats('base', {
      client: fakeClient(BASE_TODAY),
      probeLimit: 8,
    });
    expect(formatBps(changed.fees.platformBps)).not.toBe(formatBps(today.fees.platformBps));
    expect(formatAmount(changed.minBet, 6)).not.toBe(formatAmount(today.minBet, 6));
  });

  it('takes the collateral from the market contract, not from lib/chains', async () => {
    // The contract's collateral is immutable and set at deploy time. Reading it
    // is what catches a config entry pointing at the wrong token, which cannot
    // be caught by formatting: USDC and USDG share 6 decimals, so the wrong
    // address renders perfectly and pays nobody.
    const stats = await readChainStats('base', {
      client: fakeClient({
        ...BASE_TODAY,
        collateral: CHAINS.robinhood.stable.address,
        symbol: 'USDG',
        decimals: 6,
      }),
      probeLimit: 8,
    });

    expect(stats.collateral.symbol).toBe('USDG');
    expect(stats.collateral.address).toBe(CHAINS.robinhood.stable.address);
    expect(stats.collateral.address).not.toBe(CHAINS.base.stable.address);
  });

  it('counts the markets that are registered, wherever their ids sit', async () => {
    // Ids come from one counter shared by both chains, so a chain's markets are
    // scattered through the sequence rather than numbered from one. Counting up
    // to the first gap would report zero for a chain whose first market is id 5.
    const scattered = await readChainStats('base', {
      client: fakeClient({ ...BASE_TODAY, registeredIds: [5, 9] }),
      probeLimit: 16,
    });
    expect(scattered.marketCount).toBe(2);
    expect(scattered.countIsFloor).toBe(false);

    const none = await readChainStats('base', {
      client: fakeClient({ ...BASE_TODAY, registeredIds: [] }),
      probeLimit: 16,
    });
    expect(none.marketCount).toBe(0);

    // Probe window full. The count is a floor, and the card says so rather than
    // quietly truncating.
    const full = await readChainStats('base', {
      client: fakeClient({ ...BASE_TODAY, registeredIds: [1, 2, 3, 4] }),
      probeLimit: 4,
    });
    expect(full.marketCount).toBe(4);
    expect(full.countIsFloor).toBe(true);
  });

  it('reads the connected wallet\'s balance, and only when there is one', async () => {
    const withWallet = await readChainStats('base', {
      client: fakeClient(BASE_TODAY),
      account: '0x1111111111111111111111111111111111111111',
      probeLimit: 8,
    });
    expect(withWallet.balance).toBe(BigInt(12_500_000));
    expect(formatAmount(withWallet.balance!, withWallet.collateral.decimals, 2)).toBe('12.5');

    const withoutWallet = await readChainStats('base', {
      client: fakeClient(BASE_TODAY),
      probeLimit: 8,
    });
    expect(withoutWallet.balance).toBeNull();
  });

  it('keeps the card when the count or the balance is the only thing that fails', async () => {
    // One RPC refusing eth_call on Multicall3 must not take the fees down with
    // it. The card that matters is the one that says what a bet costs.
    const stats = await readChainStats('base', {
      client: fakeClient({ ...BASE_TODAY, failMulticall: true, failBalance: true }),
      account: '0x1111111111111111111111111111111111111111',
      probeLimit: 8,
    });

    expect(stats.marketCount).toBeNull();
    expect(stats.balance).toBeNull();
    expect(stats.fees.platformBps).toBe(300);
    expect(stats.collateral.symbol).toBe('USDC');
  });

  it('refuses to read a chain with no market rather than reading another one', async () => {
    await expect(
      readChainStats('robinhoodTestnet', { client: fakeClient(BASE_TODAY) })
    ).rejects.toThrow(/no market/i);
  });
});

describe('formatting', () => {
  it('prints basis points as a percentage a person recognises', () => {
    expect(formatBps(300)).toBe('3%');
    expect(formatBps(50)).toBe('0.5%');
    expect(formatBps(10000)).toBe('100%');
    expect(formatBps(1)).toBe('0.01%');
  });

  it('never rounds a balance up', () => {
    // 12.999999 USDC shown to 2 places is 12.99, not 13.
    expect(formatAmount(BigInt(12_999_999), 6, 2)).toBe('12.99');
    expect(formatAmount(BigInt(100000), 6)).toBe('0.1');
    expect(formatAmount(BigInt(0), 6)).toBe('0');
  });
});

/**
 * The chooser's job is to show what is deployed. A literal in the markup would
 * pass every test above and still print 3% after somebody calls setPlatformFee,
 * which is the exact failure this component was built to end.
 */
describe('the modal does not carry the numbers itself', () => {
  const source = readFileSync(
    path.join(ROOT, 'app', 'components', 'Wallet', 'MarketChooserModal.tsx'),
    'utf8'
  );

  it('prints no fee or minimum bet literal', () => {
    for (const literal of ['3%', '0.5%', '5%', '0.1 ', '300', '100000']) {
      expect(source, `MarketChooserModal must not hardcode ${literal}`).not.toContain(literal);
    }
  });

  it('takes every one of them from the contract read', () => {
    for (const field of [
      'stats.fees.platformBps',
      'stats.fees.creatorBps',
      'stats.fees.earlyExitBps',
      'stats.minBet',
      'stats.collateral.symbol',
      'stats.collateral.decimals',
      'stats.marketCount',
      'stats.balance',
    ]) {
      expect(source, `MarketChooserModal must render ${field}`).toContain(field);
    }
  });

  it('does not reach for the fee block in lib/contract.ts', () => {
    expect(source).not.toContain('USDG_DUALPOOL_CONFIG');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { getMarketContract, txUrl, addressUrl, exitValue, wouldEmptyPool } from './market';
import { CHAINS } from './index';

const usdc = (n: number) => BigInt(Math.round(n * 1e6));

describe('resolving one chain\'s market', () => {
  it('gives Base its live V3 contract, its own chain id and its own collateral', () => {
    const m = getMarketContract('base');
    expect(m).not.toBeNull();
    expect(m!.address).toBe(CHAINS.base.contracts.market);
    expect(m!.chainId).toBe(8453);
    expect(m!.collateral.symbol).toBe('USDC');
    expect(m!.collateral.decimals).toBe(6);
    expect(m!.explorer).toBe('https://basescan.org');
  });

  it('never hands back a chain with no market instead of null', () => {
    // Robinhood has nothing deployed. Returning some other chain's contract
    // here, or a zero address, is how a bet reaches the wrong network.
    expect(getMarketContract('robinhood')).toBeNull();
  });

  it('takes collateral from the same chain as the address, never a Base literal', async () => {
    // The two collaterals share 6 decimals and differ in address, so mixing
    // them fails silently rather than reverting: an approve aimed at Base USDC
    // while on Robinhood is a call to an address with no code.
    //
    // Asserting this on Base alone proves nothing, because on Base the Base
    // literal is the right answer. It has to be checked on a chain that has a
    // market and is not Base, which today means giving Robinhood one.
    expect(CHAINS.base.stable.address).not.toBe(CHAINS.robinhood.stable.address);

    vi.stubEnv('ROBINHOOD_USDG_DUALPOOL', '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01');
    vi.resetModules();
    const chains = await import('./index');
    const { getMarketContract: fresh } = await import('./market');

    const rh = fresh('robinhood');
    expect(rh).not.toBeNull();
    expect(rh!.chainId).toBe(4663);
    expect(rh!.collateral.symbol).toBe('USDG');
    expect(rh!.collateral.address).toBe(chains.CHAINS.robinhood.stable.address);
    expect(rh!.collateral.address).not.toBe(chains.CHAINS.base.stable.address);
    expect(rh!.explorer).toBe('https://robinhoodchain.blockscout.com');

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe('explorer links follow the chain the transaction happened on', () => {
  // Transaction history persists its URL at write time rather than deriving it
  // at render, so a link built with the wrong host is wrong permanently.
  it('sends Base to Basescan and Robinhood to its Blockscout', () => {
    expect(txUrl('base', '0xabc')).toBe('https://basescan.org/tx/0xabc');
    expect(txUrl('robinhood', '0xabc')).toBe('https://robinhoodchain.blockscout.com/tx/0xabc');
    expect(addressUrl('robinhood', '0xdef')).toBe('https://robinhoodchain.blockscout.com/address/0xdef');
  });

  it('uses a different host per chain, so a hardcoded one cannot pass', () => {
    expect(txUrl('base', '0x1')).not.toBe(txUrl('robinhood', '0x1'));
  });
});

describe('what an early exit actually pays', () => {
  const FEE = BigInt(500); // 5%, the deployed earlyExitFee

  it('matches the contract, including its integer truncation', () => {
    // yes 400, no 1000, exiting 100 of yes.
    //   price = 1000e6 * 10000 / 1400e6 = 7142  (7142.857 truncated by Solidity)
    //   gross = 100e6 * 7142 / 10000    = 71.42
    //   fee   = 71.42 * 500 / 10000     = 3.571
    //   net                              = 67.849
    const r = exitValue({
      amount: usdc(100),
      isYes: true,
      yesPool: usdc(400),
      noPool: usdc(1000),
      earlyExitFeeBps: FEE,
    });
    expect(r.gross).toBe(usdc(71.42));
    expect(r.fee).toBe(usdc(3.571));
    expect(r.net).toBe(usdc(67.849));
  });

  it('pays a solo exiter 95%, where the old contract paid nothing', () => {
    // This is the regression to watch. The archived pool returned zero when
    // there was nobody on the other side; V3 returns principal less the fee.
    // Copy the old branch across and the UI warns "you get $0.00" while the
    // contract is about to pay 95.
    const r = exitValue({
      amount: usdc(100),
      isYes: true,
      yesPool: usdc(100),
      noPool: BigInt(0),
      earlyExitFeeBps: FEE,
    });
    expect(r.gross).toBe(usdc(100));
    expect(r.net).toBe(usdc(95));
    expect(r.net).toBeGreaterThan(BigInt(0));
  });

  it('returns nothing only when there is genuinely nothing staked', () => {
    const r = exitValue({
      amount: usdc(10),
      isYes: true,
      yesPool: BigInt(0),
      noPool: BigInt(0),
      earlyExitFeeBps: FEE,
    });
    expect(r.net).toBe(BigInt(0));
  });

  it('never pays out more than the amount being exited', () => {
    for (const [yes, no] of [[1, 1000], [1000, 1], [500, 500], [1, 1]]) {
      const r = exitValue({
        amount: usdc(1),
        isYes: true,
        yesPool: usdc(yes),
        noPool: usdc(no),
        earlyExitFeeBps: FEE,
      });
      expect(r.net).toBeLessThanOrEqual(usdc(1));
      expect(r.fee + r.net).toBe(r.gross);
    }
  });
});

describe('the final-quarter rule against emptying a side', () => {
  // A market registered at 1000 running for a day: the final quarter opens at
  // elapsed 64800, so at now = 65800.
  const base = {
    isYes: true,
    yesPool: usdc(100),
    noPool: usdc(50),
    createdAt: BigInt(1000),
    deadline: BigInt(87400),
  };

  it('allows a sole backer to exit in full before the final quarter', () => {
    expect(
      wouldEmptyPool({ ...base, amount: usdc(100), now: BigInt(65799) })
    ).toBe(false);
  });

  it('refuses the same exit from the exact three-quarter mark', () => {
    expect(
      wouldEmptyPool({ ...base, amount: usdc(100), now: BigInt(65800) })
    ).toBe(true);
  });

  it('still allows a partial exit inside the final quarter', () => {
    expect(
      wouldEmptyPool({ ...base, amount: usdc(99), now: BigInt(70000) })
    ).toBe(false);
  });

  it('looks at the side being exited, not the other one', () => {
    // Exiting all of NO empties NO, even though YES is untouched.
    expect(
      wouldEmptyPool({ ...base, isYes: false, amount: usdc(50), now: BigInt(70000) })
    ).toBe(true);
  });
});

'use client';

import { useCallback, useMemo } from 'react';
import { erc20Abi, zeroAddress } from 'viem';
import { useAccount, useBalance, useReadContract, useReadContracts, useSwitchChain, useWriteContract } from 'wagmi';
import {
  SWIPE_TOKEN_LAUNCH,
  getSwipeCurve,
  isSwipeCurve,
  type SwipeCurveContract,
} from './swipeToken';

/**
 * The only way a $WIPE buy should leave this app.
 *
 * Modelled on useMarketWrite and for the same reasons, with one difference
 * that matters: this hook does not follow the network switcher. The curve
 * exists on Robinhood chain and nowhere else, so the chain is a property of
 * the contract rather than of the UI's current selection. A user reading this
 * page with Base selected can still buy, and the wallet gets moved to 4663 on
 * the way.
 *
 * Every send:
 *
 *  1. resolves the address, ABI and chain id from one launch config,
 *  2. re-checks that the address is the curve for this token, because holding
 *     an address is not permission to send native ETH to it,
 *  3. re-checks the curve's own `token()` against the configured token, so a
 *     mistyped override cannot route a payment to some other launch,
 *  4. moves the wallet onto Robinhood chain and waits, rather than signing on
 *     whatever chain it happens to be on,
 *  5. pins chainId on the call, so viem asserts it instead of trusting us.
 *
 * Step 3 has no equivalent in useMarketWrite and is here because of what the
 * two contracts do with a bad address. A market write is an ERC-20 call that
 * reverts against a stranger. This one carries `value`, and ether sent to a
 * contract that will happily keep it is gone the moment it lands.
 */

export interface CurveReading {
  /** Includes the phantom liquidity the curve prices against. */
  quoteReserve: bigint;
  tokenReserve: bigint;
  /** What buyers have actually paid in. This is what graduation measures. */
  realQuoteReserve: bigint;
  sellable: bigint;
  feeBps: bigint;
  creatorTaxBps: bigint;
  snipeTaxBps: bigint;
  graduationThreshold: bigint;
  graduated: boolean;
  /** token() as the curve reports it, not as config claims. */
  sells: `0x${string}`;
}

export type CurveStatus = 'missing' | 'reading' | 'ready' | 'unreachable';

export interface SwipeTokenBuy {
  launch: typeof SWIPE_TOKEN_LAUNCH;
  curve: SwipeCurveContract | null;
  status: CurveStatus;
  reading: CurveReading | null;
  /** Set when the curve does not sell the token this app is configured for. */
  mismatch: boolean;
  wrongNetwork: boolean;
  /** Native ETH on Robinhood chain, which pays for both the buy and the gas. */
  ethBalance: bigint | null;
  tokenBalance: bigint | null;
  buy: (params: { spend: bigint; floor: bigint }) => Promise<`0x${string}`>;
  refresh: () => void;
}

export function useSwipeTokenBuy(): SwipeTokenBuy {
  const { address, chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const curve = useMemo(() => getSwipeCurve(SWIPE_TOKEN_LAUNCH.chainKey), []);

  // One multicall for everything the quote needs. Every read pins chainId:
  // without it wagmi runs the read on the wallet's chain, where this address
  // is either empty or somebody else's contract.
  const reads = useReadContracts({
    allowFailure: false,
    contracts: curve
      ? [
          { address: curve.address, abi: curve.abi, functionName: 'getReserves', chainId: curve.chainId },
          { address: curve.address, abi: curve.abi, functionName: 'realQuoteReserve', chainId: curve.chainId },
          { address: curve.address, abi: curve.abi, functionName: 'sellableTokens', chainId: curve.chainId },
          { address: curve.address, abi: curve.abi, functionName: 'feeBps', chainId: curve.chainId },
          { address: curve.address, abi: curve.abi, functionName: 'creatorTaxBps', chainId: curve.chainId },
          {
            address: curve.address,
            abi: curve.abi,
            functionName: 'currentSnipeTaxBps',
            args: [address ?? zeroAddress],
            chainId: curve.chainId,
          },
          { address: curve.address, abi: curve.abi, functionName: 'graduationThreshold', chainId: curve.chainId },
          { address: curve.address, abi: curve.abi, functionName: 'graduated', chainId: curve.chainId },
          { address: curve.address, abi: curve.abi, functionName: 'token', chainId: curve.chainId },
        ]
      : [],
    query: {
      enabled: Boolean(curve),
      // The curve moves on every buy anyone makes, so a quote computed from a
      // reading a minute old is a quote for a price that has gone.
      refetchInterval: 15_000,
    },
  });

  const ethBalance = useBalance({
    address,
    chainId: SWIPE_TOKEN_LAUNCH.chainId,
    query: { enabled: Boolean(address) },
  });

  const tokenBalance = useReadContract({
    address: SWIPE_TOKEN_LAUNCH.token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: SWIPE_TOKEN_LAUNCH.chainId,
    query: { enabled: Boolean(address) },
  });

  const reading = useMemo<CurveReading | null>(() => {
    const data = reads.data;
    if (!data || data.length < 9) return null;
    const [reserves, realQuote, sellable, feeBps, creatorTaxBps, snipeTaxBps, threshold, graduated, sells] =
      data as unknown as [
        readonly [bigint, bigint],
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        boolean,
        `0x${string}`,
      ];
    return {
      quoteReserve: reserves[0],
      tokenReserve: reserves[1],
      realQuoteReserve: realQuote,
      sellable,
      feeBps,
      creatorTaxBps,
      snipeTaxBps,
      graduationThreshold: threshold,
      graduated,
      sells,
    };
  }, [reads.data]);

  const mismatch = Boolean(
    reading && reading.sells.toLowerCase() !== SWIPE_TOKEN_LAUNCH.token.toLowerCase()
  );

  const status: CurveStatus = !curve
    ? 'missing'
    : reading
      ? 'ready'
      : reads.isError
        ? 'unreachable'
        : 'reading';

  const wrongNetwork = Boolean(
    curve && walletChainId !== undefined && walletChainId !== curve.chainId
  );

  const buy = useCallback(
    async ({ spend, floor }: { spend: bigint; floor: bigint }) => {
      if (!curve) {
        throw new Error('This build has no curve address, so there is nothing to buy from.');
      }
      // Re-checked at send time, not just at render.
      if (!isSwipeCurve(SWIPE_TOKEN_LAUNCH.chainKey, curve.address)) {
        throw new Error('Refusing to send: that contract is not the curve for this token.');
      }
      if (mismatch) {
        throw new Error('Refusing to send: that curve does not sell this token.');
      }
      if (!address) {
        throw new Error('Connect a wallet first.');
      }
      if (spend <= BigInt(0)) {
        throw new Error(`Enter an amount of ${SWIPE_TOKEN_LAUNCH.quoteSymbol} to spend.`);
      }
      if (walletChainId !== undefined && walletChainId !== curve.chainId) {
        await switchChainAsync({ chainId: curve.chainId });
      }
      return writeContractAsync({
        address: curve.address,
        abi: curve.abi,
        functionName: 'buy',
        // quoteIn must equal msg.value on a native launch, or the curve
        // reverts with NativeValueMismatch before it prices anything.
        args: [spend, floor, address],
        value: spend,
        chainId: curve.chainId,
      });
    },
    [curve, mismatch, address, walletChainId, switchChainAsync, writeContractAsync]
  );

  const refresh = useCallback(() => {
    void reads.refetch();
    void ethBalance.refetch();
    void tokenBalance.refetch();
  }, [reads, ethBalance, tokenBalance]);

  return {
    launch: SWIPE_TOKEN_LAUNCH,
    curve,
    status,
    reading,
    mismatch,
    wrongNetwork,
    ethBalance: ethBalance.data ? ethBalance.data.value : null,
    tokenBalance: typeof tokenBalance.data === 'bigint' ? tokenBalance.data : null,
    buy,
    refresh,
  };
}

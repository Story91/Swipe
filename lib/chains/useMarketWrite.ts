'use client';

import { useCallback, useMemo } from 'react';
import { useAccount, useSwitchChain, useWriteContract } from 'wagmi';
import { isWritableMarket } from './index';
import { useActiveChain } from './activeChain';
import { getMarketContract, type MarketContract } from './market';

/**
 * The only way a market transaction should leave this app.
 *
 * Three separate notions of "the current chain" exist here and none of them
 * talked to each other: the switcher's localStorage string, the wallet's
 * connected chain, and module-scope constants frozen to the build-time default.
 * Of 50 write call sites in the app, two pinned a chainId. wagmi turns an
 * omitted chainId into `chain: null`, which makes viem skip its
 * assertCurrentChain check, so a bet placed with the UI showing one network and
 * the wallet on another was signed on the wallet's network against that
 * network's address, with no error anywhere.
 *
 * This hook refuses to leave any of that to chance. Every send:
 *
 *  1. resolves address, ABI, chain id and collateral from one chainKey,
 *  2. re-checks that the address is that chain's market rather than an archived
 *     contract, because holding an address is not permission to write to it,
 *  3. asks the wallet to move to the matching chain and waits, rather than
 *     signing on whatever chain it happens to be on,
 *  4. pins chainId on the call, so viem asserts it instead of trusting us.
 *
 * Step 3 can fail, and failing is the correct outcome: a user who declines the
 * network switch gets an error, not a transaction on the wrong chain.
 */
export interface MarketWrite {
  /** Null when the selected chain has no market deployed. */
  market: MarketContract | null;
  /** True when a market exists and can be written to. */
  ready: boolean;
  /** True when the wallet is connected to a different chain than the one selected. */
  wrongNetwork: boolean;
  /** Sends a market call, switching the wallet's chain first if it has to. */
  write: (params: {
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  }) => Promise<`0x${string}`>;
  /** Sends an arbitrary call to the chain's collateral token, same guarantees. */
  writeCollateral: (params: {
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<`0x${string}`>;
}

export function useMarketWrite(): MarketWrite {
  const { chainKey } = useActiveChain();
  const { chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const market = useMemo(() => getMarketContract(chainKey), [chainKey]);

  const wrongNetwork = Boolean(
    market && walletChainId !== undefined && walletChainId !== market.chainId
  );

  // Shared preflight. Throws rather than returning a falsy value, because a
  // caller that ignores a return value must not end up sending anything.
  const ensureOnChain = useCallback(async (): Promise<MarketContract> => {
    if (!market) {
      throw new Error(
        'This network has no Swipe market yet. Switch networks to place a bet.'
      );
    }
    // Re-checked at send time, not just at render: the switcher can move under
    // an open dialog.
    if (!isWritableMarket(chainKey, market.address)) {
      throw new Error('Refusing to write: that contract is not this network\'s market.');
    }
    if (walletChainId !== undefined && walletChainId !== market.chainId) {
      await switchChainAsync({ chainId: market.chainId });
    }
    return market;
  }, [market, chainKey, walletChainId, switchChainAsync]);

  const write = useCallback(
    async ({
      functionName,
      args,
      value,
    }: {
      functionName: string;
      args?: readonly unknown[];
      value?: bigint;
    }) => {
      const m = await ensureOnChain();
      return writeContractAsync({
        address: m.address,
        abi: m.abi as never,
        functionName,
        args: args as never,
        chainId: m.chainId,
        ...(value === undefined ? {} : { value }),
      } as never);
    },
    [ensureOnChain, writeContractAsync]
  );

  const writeCollateral = useCallback(
    async ({
      abi,
      functionName,
      args,
    }: {
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }) => {
      const m = await ensureOnChain();
      return writeContractAsync({
        address: m.collateral.address,
        abi: abi as never,
        functionName,
        args: args as never,
        chainId: m.chainId,
      } as never);
    },
    [ensureOnChain, writeContractAsync]
  );

  return { market, ready: Boolean(market), wrongNetwork, write, writeCollateral };
}

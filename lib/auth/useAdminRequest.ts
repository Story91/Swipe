'use client';

import { useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { ADMIN_HEADERS, buildAdminMessage } from './adminMessage';

/**
 * Produces the headers an admin route requires.
 *
 * Each call prompts the wallet, which is the deliberate trade: a signature is
 * bound to one action and expires in minutes, so nothing usable is left lying
 * around in the browser. There is no token to steal because there is no token.
 *
 * Usage:
 *   const signAdmin = useAdminRequest();
 *   const headers = await signAdmin('resolve');
 *   await fetch(url, { method: 'POST', headers: { ...headers, ... } });
 */
export function useAdminRequest() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  return useCallback(
    async (action: string): Promise<Record<string, string>> => {
      if (!address) {
        throw new Error('Connect an admin wallet first');
      }

      const timestamp = Date.now();
      const signature = await signMessageAsync({
        message: buildAdminMessage(action, timestamp),
      });

      return {
        [ADMIN_HEADERS.address]: address,
        [ADMIN_HEADERS.signature]: signature,
        [ADMIN_HEADERS.timestamp]: String(timestamp),
      };
    },
    [address, signMessageAsync]
  );
}

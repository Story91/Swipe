import { http, cookieStorage, createConfig, createStorage } from 'wagmi';
import { getChainConfig } from '@/lib/chains';
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';
import sdk from '@farcaster/miniapp-sdk';

// Farcaster Frame connector for Warpcast
function farcasterFrame() {
  return injected({
    target() {
      // Check if we're in a Farcaster frame context
      if (typeof window !== 'undefined' && sdk.wallet?.ethProvider) {
        return {
          id: 'farcaster-frame',
          name: 'Farcaster Frame',
          provider: sdk.wallet.ethProvider as any,
        };
      }
      return undefined;
    },
  });
}

export function getConfig() {
  const activeChain = getChainConfig();

  return createConfig({
    chains: [activeChain.viemChain],
    connectors: [
      farcasterFrame(), // Farcaster Frame wallet (for Warpcast)
      injected(),
      coinbaseWallet(),
      walletConnect({ 
        projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID! 
      }),
    ],
    storage: createStorage({
      storage: cookieStorage,
    }),
    ssr: true,
    transports: {
      // rpcUrl always has a value, so this no longer risks http(undefined)
      // when NEXT_PUBLIC_BASE_RPC_URL is unset.
      [activeChain.viemChain.id]: http(activeChain.rpcUrl),
    },
  });
}

declare module 'wagmi' {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}

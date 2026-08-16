import { http, cookieStorage, createConfig, createStorage } from 'wagmi';
import { chainList, supportedChains } from '@/lib/chains';
import { baseAccount, coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';
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
  // Every chain the app can talk to must be registered here, not just the
  // default one. wagmi will not sign or read on a chain it does not know, so
  // with a single entry the network switcher could change a label and nothing
  // else. The default stays first, which is the chain wagmi connects on.
  const chains = supportedChains();

  return createConfig({
    chains,
    // Order matters. OnchainKit's <ConnectWallet> connects with connectors[0]
    // (ConnectWallet.js: `accountConnector || connectors[0]`), so the first
    // entry has to be one that works in a plain browser. With farcasterFrame
    // first, Sign In did nothing outside Warpcast: that connector's target()
    // returns undefined when there is no Farcaster provider.
    //
    // baseAccount first also restores exactly what OnchainKit used before this
    // config existed — its built-in default is `[baseAccount(...)]` — so Base
    // App behaviour is unchanged.
    //
    // Farcaster still works: the auto-connect effect in app/page.tsx looks the
    // connector up by id ('farcaster-frame'), never by position.
    connectors: [
      baseAccount({
        appName: process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME || 'Swipe',
        appLogoUrl: process.env.NEXT_PUBLIC_ICON_URL || undefined,
      }),
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
    // A transport per registered chain. rpcUrl always has a value, so this
    // cannot produce http(undefined) when an env var is unset.
    transports: Object.fromEntries(
      chainList().map((c) => [c.viemChain.id, http(c.rpcUrl)])
    ),
  });
}

declare module 'wagmi' {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}

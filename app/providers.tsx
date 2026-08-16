"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getChainConfig } from "@/lib/chains";
import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
import { getConfig } from "@/wagmi";

/**
 * Wallet and chain providers.
 *
 * MiniKitProvider builds its own wagmi config when it does not find a
 * WagmiProvider above it, and that config registers exactly one connector:
 * coinbaseWallet. That is why the app only ever offered Coinbase Smart Wallet,
 * even though wagmi.ts has defined injected, WalletConnect and a Farcaster
 * frame connector all along — nothing imported it.
 *
 * Wrapping MiniKit in our own WagmiProvider makes OnchainKit use this config
 * instead, so every connector in wagmi.ts becomes available.
 */
export function Providers(props: { children: ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY;

  // One client per mount, not per render.
  const [queryClient] = useState(() => new QueryClient());
  const [config] = useState(() => getConfig());

  const inner = apiKey ? (
    <MiniKitProvider
      apiKey={apiKey}
      chain={getChainConfig().viemChain}
      config={{
        appearance: {
          mode: "auto",
          theme: "mini-app-theme",
          name: process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME || "Swipe",
          logo: process.env.NEXT_PUBLIC_ICON_URL || "/icon.png",
        },
      }}
    >
      {props.children}
    </MiniKitProvider>
  ) : (
    // Without an OnchainKit key the mini-app features are unavailable, but
    // wallet connection must still work.
    <>{props.children}</>
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{inner}</QueryClientProvider>
    </WagmiProvider>
  );
}

"use client";

import { type ReactNode } from "react";
import { base } from "wagmi/chains";
import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getConfig } from "../wagmi";

const queryClient = new QueryClient();

export function Providers(props: { children: ReactNode }) {
  // Use Coinbase RPC URL for better reliability
  const apiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY || "public-key";
  
  return (
    <WagmiProvider config={getConfig()}>
      <QueryClientProvider client={queryClient}>
        <MiniKitProvider
          apiKey={apiKey}
          chain={base}
          config={{
            appearance: {
              mode: "auto",
              theme: "mini-app-theme",
              name: process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME || "Dexter",
              logo: process.env.NEXT_PUBLIC_ICON_URL || "/icon.png",
            },
          }}
        >
          {props.children}
        </MiniKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
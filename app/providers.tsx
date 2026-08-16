"use client";

import { type ReactNode } from "react";
import { getChainConfig } from "@/lib/chains";
import { MiniKitProvider } from "@coinbase/onchainkit/minikit";

export function Providers(props: { children: ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️ OnchainKit API key not found. Some features may not work.');
    return <>{props.children}</>;
  }
  
  return (
    <MiniKitProvider
      apiKey={apiKey}
      chain={getChainConfig().viemChain}
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
  );
}

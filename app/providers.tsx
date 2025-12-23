"use client";

import { type ReactNode } from "react";
import { base } from "wagmi/chains";
import { MiniKitProvider } from "@coinbase/onchainkit/minikit";

// Note: Don't call sdk.actions.ready() here - let MiniKit's setFrameReady() handle it
// Calling ready() too early in providers can cause wallet disconnection issues

export function Providers(props: { children: ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️ OnchainKit API key not found. Some features may not work.');
    return <>{props.children}</>;
  }
  
  return (
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
  );
}
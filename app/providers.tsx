"use client";

import { type ReactNode, useEffect, useState } from "react";
import { base } from "wagmi/chains";
import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
import sdk from "@farcaster/miniapp-sdk";

// Farcaster SDK Initializer component
function FarcasterSDKInitializer({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initFarcasterSDK = async () => {
      try {
        // Check if we're in a Farcaster frame context (Warpcast, etc.)
        // The SDK will automatically detect the context
        console.log('🔄 Initializing Farcaster SDK...');
        
        // Call ready to signal the frame is ready
        await sdk.actions.ready();
        console.log('✅ Farcaster SDK ready');
        
        setIsInitialized(true);
      } catch (error) {
        // If Farcaster SDK fails, we're likely in Base app or browser
        // MiniKit will handle things there
        console.log('ℹ️ Farcaster SDK init skipped (likely in MiniKit/Base app context):', error);
        setIsInitialized(true);
      }
    };

    initFarcasterSDK();
  }, []);

  return <>{children}</>;
}

export function Providers(props: { children: ReactNode }) {
  // Temporarily disable OnchainKit to avoid 401 errors
  const apiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️ OnchainKit API key not found. Some features may not work.');
    return (
      <FarcasterSDKInitializer>
        {props.children}
      </FarcasterSDKInitializer>
    );
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
      <FarcasterSDKInitializer>
        {props.children}
      </FarcasterSDKInitializer>
    </MiniKitProvider>
  );
}
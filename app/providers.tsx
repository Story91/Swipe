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
        // Check if we're in a Farcaster Mini App context
        const isInMiniApp = await sdk.isInMiniApp();
        
        if (isInMiniApp) {
          console.log('🔄 Initializing Farcaster SDK...');
          // Call ready to signal the host app that we're ready
          await sdk.actions.ready();
          console.log('✅ Farcaster SDK ready');
        }
      } catch (error) {
        console.log('ℹ️ Not in Farcaster Mini App context:', error);
      } finally {
        setIsInitialized(true);
      }
    };

    initFarcasterSDK();
  }, []);

  // Always render children immediately - don't block on SDK initialization
  return <>{children}</>;
}

export function Providers(props: { children: ReactNode }) {
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

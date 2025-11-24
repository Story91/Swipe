"use client";

import {
  useMiniKit,
} from "@coinbase/onchainkit/minikit";
import sdk from "@farcaster/miniapp-sdk";
import {
  Name,
  Identity,
  Address,
  Avatar,
  EthBalance,
} from "@coinbase/onchainkit/identity";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { useAccount } from "wagmi";
import { useState, useEffect, useRef } from "react";
import TinderCardComponent from "./components/Main/TinderCard";
import { AdminPanel } from "./components/Admin/AdminPanel";
import { CompactStats } from "./components/Market/CompactStats";
import { UserDashboard } from "./components/Portfolio/UserDashboard";
import { EnhancedUserDashboard } from "./components/Portfolio/EnhancedUserDashboard";
import { MyPortfolio } from "./components/Portfolio/MyPortfolio";
import { ActiveBets } from "./components/Portfolio/ActiveBets";
import { BetHistory } from "./components/Portfolio/BetHistory";
import { PlatformAnalytics } from "./components/Admin/PlatformAnalytics";
import { SystemSettings } from "./components/Admin/SystemSettings";
import { AuditLogs } from "./components/Admin/AuditLogs";
import { HelpAndFaq } from "./components/Support/HelpAndFaq";
import { Leaderboard } from "./components/Market/Leaderboard";
import { RecentActivity } from "./components/Support/RecentActivity";
import { CreatePredictionModal } from "./components/Modals/CreatePredictionModal";
import AIAssistant from "./components/AIAssistant/AIAssistant";
import { SwipeTokenCard } from "./components/Market/SwipeTokenCard";

type DashboardType = 'tinder' | 'user' | 'admin' | 'approver' | 'market-stats' | 'analytics' | 'settings' | 'audit-logs' | 'my-portfolio' | 'active-bets' | 'bet-history' | 'help-faq' | 'leaderboard' | 'recent-activity' | 'swipe-token';

export default function App() {
  const { setFrameReady, isFrameReady } = useMiniKit();
  const [activeDashboard, setActiveDashboard] = useState<DashboardType>('tinder');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { address } = useAccount();
  const tinderCardRef = useRef<{ refresh: () => void } | null>(null);
  const [hasTriedAddMiniApp, setHasTriedAddMiniApp] = useState(false);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Wywołaj addMiniApp() zaraz po ready (po włączeniu aplikacji)
  useEffect(() => {
    const promptAddMiniApp = async () => {
      if (hasTriedAddMiniApp || !isFrameReady) return;
      
      try {
        const isInMiniApp = await sdk.isInMiniApp();
        if (!isInMiniApp) {
          console.log('Not in Mini App, skipping addMiniApp');
          return;
        }

        console.log('📱 Prompting user to add Mini App after ready...');
        setHasTriedAddMiniApp(true);
        
        try {
          const result = await sdk.actions.addMiniApp();
          console.log('✅ Add Mini App result:', result);
          
          if (result.notificationDetails) {
            console.log('✅ Notifications enabled!');
          } else {
            console.log('⚠️ Mini App added but notifications not enabled');
          }
        } catch (error: any) {
          console.error('❌ Add Mini App failed:', error);
          
          if (error?.name === 'AddMiniApp.InvalidDomainManifest') {
            console.error('❌ Invalid domain manifest - check your .well-known/farcaster.json');
          } else if (error?.name === 'AddMiniApp.RejectedByUser') {
            console.log('User rejected add Mini App prompt');
          }
        }
      } catch (error) {
        console.error('Error checking Mini App status:', error);
      }
    };

    // Wywołaj po krótkim opóźnieniu, żeby upewnić się że ready jest kompletne
    if (isFrameReady) {
      const timer = setTimeout(() => {
        promptAddMiniApp();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isFrameReady, hasTriedAddMiniApp]);

  // Check permissions
  const isAdmin = address && process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase();
  const isApprover = address && (process.env.NEXT_PUBLIC_APPROVER_1?.toLowerCase() === address.toLowerCase() ||
                               process.env.NEXT_PUBLIC_APPROVER_2?.toLowerCase() === address.toLowerCase() ||
                               process.env.NEXT_PUBLIC_APPROVER_3?.toLowerCase() === address.toLowerCase() ||
                               process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase());

  // Function to refresh predictions data
  const refreshPredictions = () => {
    if (tinderCardRef.current?.refresh) {
      tinderCardRef.current.refresh();
    }
  };

  return (
    <div className="flex flex-col min-h-screen font-sans text-[var(--app-foreground)] mini-app-theme from-[var(--app-background)] to-[var(--app-gray)]">
      <div className="w-full max-w-[424px] mx-auto px-4 py-3">
        {/* Wallet Connection and Admin/Help - Top */}
        <div className="flex justify-between items-center mb-3">
          <Wallet className="z-10">
            <ConnectWallet>
              <Name className="text-inherit text-sm" />
            </ConnectWallet>
            <WalletDropdown>
              <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                <Avatar />
                <Name />
                <Address />
                <EthBalance />
              </Identity>
              <WalletDropdownDisconnect />
            </WalletDropdown>
          </Wallet>
          
          {/* Admin, Leaderboard or Help Button - Top Right */}
          <div className="flex gap-2">
            {isAdmin && (
              <button
                onClick={() => setActiveDashboard('admin')}
                className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-3 py-2 rounded-full font-bold transition-colors"
                title="Admin Dashboard"
              >
                A
              </button>
            )}
            <button
              onClick={() => setActiveDashboard('leaderboard')}
              className="bg-yellow-600 hover:bg-yellow-700 text-white text-sm px-3 py-2 rounded-full font-medium transition-colors"
              title="Leaderboard"
            >
              🏆
            </button>
            <button
              onClick={() => setActiveDashboard('help-faq')}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded-full font-medium transition-colors"
              title="Help & FAQ"
            >
              ❓
            </button>
          </div>
        </div>

        {/* Menu Bar - Right after Wallet */}
        <div className="mb-4">
          <Menubar className="mini-app-menu">
            <MenubarMenu>
              <MenubarTrigger className="menubar-trigger" onClick={() => setActiveDashboard('tinder')}>
                Bets
              </MenubarTrigger>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger 
                className="menubar-trigger animate-pulse bg-gradient-to-r from-[#d4ff00] to-yellow-300 text-black font-bold hover:from-yellow-300 hover:to-[#d4ff00]" 
                onClick={() => setActiveDashboard('swipe-token')}
              >
                $SWIPE
              </MenubarTrigger>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger className="menubar-trigger" onClick={() => setActiveDashboard('market-stats')}>
                Stats
              </MenubarTrigger>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger className="menubar-trigger" onClick={() => setActiveDashboard('user')}>
                Dashboard
              </MenubarTrigger>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger className="menubar-trigger">
                Create
              </MenubarTrigger>
              <MenubarContent>
                <MenubarItem onSelect={() => setIsCreateModalOpen(true)}>
                  Create Prediction
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </div>

        {/* Main Content with Tinder Cards */}
        <main className="flex-1">
          {activeDashboard === 'tinder' && (
            <TinderCardComponent
              ref={tinderCardRef}
              activeDashboard={activeDashboard}
              onDashboardChange={setActiveDashboard}
            />
          )}

          {activeDashboard === 'user' && (
            <div>
              <EnhancedUserDashboard />
            </div>
          )}

          {activeDashboard === 'admin' && <AdminPanel />}

          {activeDashboard === 'approver' && <AdminPanel />}

          {/* SWIPE Token Card */}
          {activeDashboard === 'swipe-token' && <SwipeTokenCard />}

          {/* Market Stats - separate from main dashboard flow */}
          {activeDashboard === 'market-stats' && <CompactStats />}

          {/* Portfolio Components */}
          {activeDashboard === 'my-portfolio' && <MyPortfolio />}

          {activeDashboard === 'active-bets' && <ActiveBets />}

          {activeDashboard === 'bet-history' && <BetHistory />}

          {/* Support Components */}
          {activeDashboard === 'help-faq' && <HelpAndFaq />}

          {activeDashboard === 'leaderboard' && <Leaderboard />}

          {activeDashboard === 'recent-activity' && <RecentActivity />}

          {/* Admin Components */}
          {activeDashboard === 'analytics' && <PlatformAnalytics />}

          {activeDashboard === 'settings' && <SystemSettings />}

          {activeDashboard === 'audit-logs' && <AuditLogs />}
        </main>
      </div>

      {/* Create Prediction Modal */}
      <CreatePredictionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          console.log('Prediction created successfully!');
          // Close modal and redirect to home page
          setIsCreateModalOpen(false);
          setActiveDashboard('tinder');
          // Refresh predictions data after successful creation with delay
          setTimeout(() => {
            if (tinderCardRef.current?.refresh) {
              console.log('🔄 Refreshing predictions after creation...');
              tinderCardRef.current.refresh();
            }
          }, 5000); // Wait 5 seconds for data to propagate (3s auto-sync + 2s buffer)
        }}
      />

      {/* AI Assistant */}
      <AIAssistant />
    </div>
  );
}

"use client";

import {
  useMiniKit,
} from "@coinbase/onchainkit/minikit";
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
import { MarketStats } from "./components/Market/MarketStats";
import { UserDashboard } from "./components/Portfolio/UserDashboard";
import { EnhancedUserDashboard } from "./components/Portfolio/EnhancedUserDashboard";
import { MyPortfolio } from "./components/Portfolio/MyPortfolio";
import { ActiveBets } from "./components/Portfolio/ActiveBets";
import { BetHistory } from "./components/Portfolio/BetHistory";
import { PlatformAnalytics } from "./components/Admin/PlatformAnalytics";
import { SystemSettings } from "./components/Admin/SystemSettings";
import { AuditLogs } from "./components/Admin/AuditLogs";
import { HelpAndFaq } from "./components/Support/HelpAndFaq";
import { Leaderboard } from "./components/Support/Leaderboard";
import { RecentActivity } from "./components/Support/RecentActivity";
import { CreatePredictionModal } from "./components/Modals/CreatePredictionModal";
import AIAssistant from "./components/AIAssistant/AIAssistant";

type DashboardType = 'tinder' | 'user' | 'admin' | 'approver' | 'market-stats' | 'analytics' | 'settings' | 'audit-logs' | 'my-portfolio' | 'active-bets' | 'bet-history' | 'help-faq' | 'leaderboard' | 'recent-activity';

export default function App() {
  const { setFrameReady, isFrameReady } = useMiniKit();
  const [activeDashboard, setActiveDashboard] = useState<DashboardType>('tinder');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { address } = useAccount();
  const tinderCardRef = useRef<{ refresh: () => void } | null>(null);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Check permissions
  const isAdmin = address && process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase();
  const isApprover = address && (process.env.NEXT_PUBLIC_APPROVER_1?.toLowerCase() === address.toLowerCase() ||
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
        {/* Wallet Connection and Admin - Top */}
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
          
          {/* Admin Button - Top Right */}
          {isAdmin && (
            <button
              onClick={() => setActiveDashboard('admin')}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1 rounded-full font-medium transition-colors"
            >
              🔧 Admin
            </button>
          )}
        </div>

        {/* Menu Bar - Right after Wallet */}
        <div className="mb-4">
          <Menubar className="mini-app-menu">
            <MenubarMenu>
              <MenubarTrigger className="menubar-trigger" onClick={() => setActiveDashboard('tinder')}>
                Swipe
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
            <MenubarMenu>
              <MenubarTrigger className="menubar-trigger" onClick={() => setActiveDashboard('help-faq')}>
                Help
              </MenubarTrigger>
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

          {activeDashboard === 'approver' && <AdminPanel defaultTab="approver" />}

          {/* Market Stats - separate from main dashboard flow */}
          {activeDashboard === 'market-stats' && <MarketStats />}

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
          // Immediately refresh predictions data after successful creation
          if (tinderCardRef.current?.refresh) {
            tinderCardRef.current.refresh();
          }
        }}
      />

      {/* AI Assistant */}
      <AIAssistant />
    </div>
  );
}

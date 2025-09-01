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
import { useState, useEffect } from "react";
import TinderCardComponent from "./components/Main/TinderCard";
import { AdminPanel } from "./components/Admin/AdminPanel";
import { MarketStats } from "./components/Market/MarketStats";
import { UserDashboard } from "./components/Portfolio/UserDashboard";
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

type DashboardType = 'tinder' | 'user' | 'admin' | 'approver' | 'market-stats' | 'analytics' | 'settings' | 'audit-logs' | 'my-portfolio' | 'active-bets' | 'bet-history' | 'help-faq' | 'leaderboard' | 'recent-activity';

export default function App() {
  const { setFrameReady, isFrameReady } = useMiniKit();
  const [activeDashboard, setActiveDashboard] = useState<DashboardType>('tinder');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { address } = useAccount();

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Check permissions
  const isAdmin = address && process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase();
  const isApprover = address && (process.env.NEXT_PUBLIC_APPROVER_1?.toLowerCase() === address.toLowerCase() ||
                               process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase());

  return (
    <div className="flex flex-col min-h-screen font-sans text-[var(--app-foreground)] mini-app-theme from-[var(--app-background)] to-[var(--app-gray)]">
      <div className="w-full max-w-[424px] mx-auto px-4 py-3">
        {/* Wallet Connection - Top Left */}
        <div className="flex justify-start mb-3">
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
        </div>

        {/* Menu Bar - Right after Wallet */}
        <div className="mb-4">
          <Menubar>
            <MenubarMenu>
              <MenubarTrigger>Dexter</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onClick={() => setActiveDashboard('tinder')}>
                  🔥 Tinder Mode
                </MenubarItem>
                <MenubarItem onClick={() => setActiveDashboard('market-stats')}>
                  📊 Market Stats
                </MenubarItem>
                <MenubarItem onClick={() => setActiveDashboard('leaderboard')}>
                  🏆 Leaderboard
                </MenubarItem>
                <MenubarItem onClick={() => setActiveDashboard('recent-activity')}>
                  🔔 Recent Activity
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>Portfolio</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onClick={() => setActiveDashboard('user')}>
                  👤 My Dashboard
                </MenubarItem>
                <MenubarItem onClick={() => setActiveDashboard('my-portfolio')}>
                  💼 My Portfolio
                </MenubarItem>
                <MenubarItem onClick={() => setActiveDashboard('active-bets')}>
                  💰 Active Bets
                </MenubarItem>
                <MenubarItem onClick={() => setActiveDashboard('bet-history')}>
                  🏆 Bet History
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>Actions</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onClick={() => setIsCreateModalOpen(true)}>
                  ➕ Create Prediction
                </MenubarItem>
                {isAdmin && (
                  <MenubarItem onClick={() => setActiveDashboard('admin')}>
                    ⚙️ Admin Panel
                  </MenubarItem>
                )}
                {isApprover && (
                  <MenubarItem onClick={() => setActiveDashboard('approver')}>
                    ✅ Approver Panel
                  </MenubarItem>
                )}
                <MenubarItem onClick={() => setActiveDashboard('help-faq')}>
                  ❓ Help & FAQ
                </MenubarItem>
                {!address && (
                  <>
                    <MenubarItem disabled>
                      ⚙️ Admin Panel (Connect Wallet)
                    </MenubarItem>
                    <MenubarItem disabled>
                      ✅ Approver Panel (Connect Wallet)
                    </MenubarItem>
                  </>
                )}
              </MenubarContent>
            </MenubarMenu>
            {isAdmin && (
              <MenubarMenu>
                <MenubarTrigger>🔧 Admin</MenubarTrigger>
                <MenubarContent>
                  <MenubarItem onClick={() => setActiveDashboard('analytics')}>
                    📈 Platform Analytics
                  </MenubarItem>
                  <MenubarItem onClick={() => setActiveDashboard('settings')}>
                    ⚙️ System Settings
                  </MenubarItem>
                  <MenubarItem onClick={() => setActiveDashboard('audit-logs')}>
                    🔍 Audit Logs
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>
            )}
          </Menubar>
        </div>

        {/* Main Content with Tinder Cards */}
        <main className="flex-1">
          {activeDashboard === 'tinder' && (
            <TinderCardComponent
              activeDashboard={activeDashboard}
              onDashboardChange={setActiveDashboard}
            />
          )}

          {activeDashboard === 'user' && (
            <div>
              <UserDashboard
                predictions={[
                  {
                    id: 1,
                    question: "Bitcoin hits $100,000 by end of 2024?",
                    category: "Crypto",
                    yesTotalAmount: 10.35,
                    noTotalAmount: 4.85,
                    deadline: Date.now() / 1000 + 5 * 24 * 60 * 60,
                    resolved: false,
                    outcome: false,
                    cancelled: false,
                    participants: 324,
                    userYesStake: 0.5,
                    userNoStake: 0.0,
                    potentialPayout: 0.73,
                    potentialProfit: 0.23,
                    needsApproval: false,
                    approvalCount: 0,
                    requiredApprovals: 2,
                    description: "Strong accumulation pattern with institutional buying pressure. Key resistance at $100k likely to break on next momentum wave.",
                    creator: "0x742d...a9E2",
                    createdAt: Date.now() / 1000 - 2 * 60 * 60,
                    hasUserApproved: false,
                    isRejected: false,
                    rejectionReason: "",
                    resolutionDeadline: Date.now() / 1000 + 10 * 24 * 60 * 60,
                    imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop",
                    verified: true,
                    approved: true
                  }
                ]}
                onClaimReward={(id) => console.log(`Claim reward for ${id}`)}
              />
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
          // Optionally navigate to a specific dashboard or refresh data
        }}
      />
    </div>
  );
}

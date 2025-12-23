"use client";

import {
  useMiniKit,
  useViewProfile,
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
import { Avatar as ShadcnAvatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { Button } from "@/components/ui/button";
import { Trophy, HelpCircle, Settings } from "lucide-react";
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
import { HowToPlayModal } from "./components/Modals/HowToPlayModal";
import { SwipeTokenCard } from "./components/Market/SwipeTokenCard";
import { SwipeClaim } from "./components/Portfolio/SwipeClaim";

type DashboardType = 'tinder' | 'user' | 'admin' | 'approver' | 'market-stats' | 'analytics' | 'settings' | 'audit-logs' | 'my-portfolio' | 'active-bets' | 'bet-history' | 'help-faq' | 'leaderboard' | 'recent-activity' | 'swipe-token' | 'claim';

// User profile type
interface UserProfile {
  fid: string | null;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
}

export default function App() {
  const { setFrameReady, isFrameReady, context } = useMiniKit();
  const [activeDashboard, setActiveDashboard] = useState<DashboardType>('tinder');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const { address } = useAccount();
  const tinderCardRef = useRef<{ refresh: () => void } | null>(null);
  const [hasTriedAddMiniApp, setHasTriedAddMiniApp] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const viewProfile = useViewProfile();

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Fetch user profile from MiniKit context or Farcaster API
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!address) {
        setUserProfile(null);
        return;
      }

      // First try to get from MiniKit context
      if (context?.user) {
        const user = context.user as any;
        if (user.fid || user.pfpUrl || user.displayName) {
          setUserProfile({
            fid: user.fid?.toString() || null,
            username: user.username || null,
            display_name: user.displayName || user.display_name || null,
            pfp_url: user.pfpUrl || user.pfp_url || null,
          });
          return;
        }
      }

      // Fallback: fetch from our Farcaster API
      setProfileLoading(true);
      try {
        const response = await fetch('/api/farcaster/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses: [address] })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.profiles && data.profiles.length > 0) {
            const profile = data.profiles[0];
            setUserProfile({
              fid: profile.fid || null,
              username: profile.username || null,
              display_name: profile.display_name || null,
              pfp_url: profile.pfp_url || null,
            });
          } else {
            // No Farcaster profile, use wallet address
            setUserProfile({
              fid: null,
              username: null,
              display_name: null,
              pfp_url: null,
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
        setUserProfile({
          fid: null,
          username: null,
          display_name: null,
          pfp_url: null,
        });
      } finally {
        setProfileLoading(false);
      }
    };

    fetchUserProfile();
  }, [address, context]);

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
      <div className="w-full max-w-[424px] mx-auto px-2 sm:px-4 py-3 overflow-x-hidden">
        {/* Wallet Connection and Admin/Help - Top */}
        <div className="flex justify-between items-center mb-3">
          <Wallet className="z-10">
            <ConnectWallet 
              className={address 
                ? "!px-2 !py-1.5 !text-sm !min-w-0 !text-black !border-2 !border-black !font-semibold !shadow-md !rounded-full !bg-gradient-to-r !from-[#d4ff00] !to-[#a8cc00] hover:!shadow-lg hover:!scale-105 !transition-all !duration-200" 
                : "!px-4 !py-2 !text-sm !min-w-0 !text-black !border-2 !border-black !font-semibold !shadow-md"
              } 
              text="Sign In"
            >
              {address && userProfile ? (
                <div className="flex items-center gap-2">
                  <ShadcnAvatar className="w-7 h-7 ring-2 ring-black/20">
                    <AvatarImage 
                      src={userProfile?.pfp_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${address?.slice(2, 8)}`} 
                      alt={userProfile?.display_name || 'User'} 
                    />
                    <AvatarFallback className="bg-black text-[#d4ff00] font-bold text-[10px]">
                      {userProfile?.display_name?.slice(0, 2).toUpperCase() || address?.slice(2, 4).toUpperCase()}
                    </AvatarFallback>
                  </ShadcnAvatar>
                  <div className="flex flex-col">
                    <span className="text-black font-bold text-xs leading-tight truncate max-w-[70px]">
                      {userProfile?.display_name || userProfile?.username || `${address?.slice(0, 6)}...`}
                    </span>
                    {userProfile?.username && (
                      <span className="text-black/60 text-[9px] leading-tight">
                        @{userProfile.username}
                      </span>
                    )}
                  </div>
                </div>
              ) : address ? (
                <div className="flex items-center gap-2">
                  <ShadcnAvatar className="w-7 h-7 ring-2 ring-black/20">
                    <AvatarImage 
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${address?.slice(2, 8)}`} 
                      alt="User" 
                    />
                    <AvatarFallback className="bg-black text-[#d4ff00] font-bold text-[10px]">
                      {address?.slice(2, 4).toUpperCase()}
                    </AvatarFallback>
                  </ShadcnAvatar>
                  <span className="text-black font-bold text-xs">
                    {`${address?.slice(0, 6)}...`}
                  </span>
                </div>
              ) : (
                <Name className="text-inherit text-xs" />
              )}
            </ConnectWallet>
            <WalletDropdown>
              <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                <Avatar />
                <Name />
                <Address />
                <EthBalance />
              </Identity>
              {/* View Farcaster Profile button */}
              {userProfile?.fid && (
                <div 
                  className="px-4 py-2 cursor-pointer hover:bg-gray-100 text-sm text-blue-600 font-medium border-t"
                  onClick={() => viewProfile(parseInt(userProfile.fid!, 10))}
                >
                  👤 View Farcaster Profile
                </div>
              )}
              <WalletDropdownDisconnect />
            </WalletDropdown>
          </Wallet>
          
          {/* Admin, Leaderboard, AI or Help Button - Top Right */}
          <div className="flex gap-2">
            {isAdmin && (
              <Button
                variant="swipe"
                size="icon"
                onClick={() => setActiveDashboard('admin')}
                title="Admin Dashboard"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="swipe"
              size="icon"
              onClick={() => setActiveDashboard('leaderboard')}
              title="Leaderboard"
            >
              <Trophy className="h-4 w-4" />
            </Button>
            <Button
              variant="swipe"
              onClick={() => setIsHowToPlayOpen(true)}
              className="!px-3 !py-2 !text-xs !font-semibold"
            >
              How to Play
            </Button>
            <Button
              variant="swipe"
              size="icon"
              onClick={() => setActiveDashboard('help-faq')}
              title="Help & FAQ"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Menu Bar - Right after Wallet */}
        <div className="mb-4 overflow-hidden">
          <Menubar className="mini-app-menu">
            <MenubarMenu>
              <MenubarTrigger className="menubar-trigger" onClick={() => setActiveDashboard('tinder')}>
                Bets
              </MenubarTrigger>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger 
                className="menubar-trigger animate-pulse !bg-[#d4ff00] !text-black !font-bold hover:!bg-[#c4ef00]" 
                onClick={() => setActiveDashboard('claim')}
              >
                🎁 Claim
              </MenubarTrigger>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger 
                className="menubar-trigger animate-pulse !bg-[#d4ff00] !text-black !font-bold hover:!bg-[#c4ef00]" 
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

          {/* Claim Page */}
          {activeDashboard === 'claim' && (
            <div style={{ padding: '20px' }}>
              <SwipeClaim />
            </div>
          )}

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

      {/* How to Play Modal */}
      <HowToPlayModal
        isOpen={isHowToPlayOpen}
        onClose={() => setIsHowToPlayOpen(false)}
      />

    </div>
  );
}

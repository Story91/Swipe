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
import { useAccount, useConnect } from "wagmi";
import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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
import { DailyTasks } from "./components/Tasks/DailyTasks";

type DashboardType = 'tinder' | 'user' | 'admin' | 'approver' | 'market-stats' | 'analytics' | 'settings' | 'audit-logs' | 'my-portfolio' | 'active-bets' | 'bet-history' | 'help-faq' | 'leaderboard' | 'recent-activity' | 'swipe-token' | 'claim' | 'daily-tasks';

// User profile type
interface UserProfile {
  fid: string | null;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
}

// Component to handle URL search params (needs Suspense wrapper)
function SearchParamsHandler({ 
  onPredictionId 
}: { 
  onPredictionId: (id: string) => void 
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const predictionId = searchParams.get('prediction');
    if (predictionId) {
      console.log('🎯 Found prediction parameter in URL:', predictionId);
      onPredictionId(predictionId);
      
      // Clear the URL parameter without full page reload
      router.replace('/', { scroll: false });
    }
  }, [searchParams, router, onPredictionId]);

  return null;
}

export default function App() {
  const { setFrameReady, isFrameReady, context } = useMiniKit();
  const [activeDashboard, setActiveDashboard] = useState<DashboardType>('tinder');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const { address } = useAccount();
  const { connect, connectors } = useConnect();
  const tinderCardRef = useRef<{ refresh: () => void; goToPrediction?: (id: string) => void } | null>(null);
  const dashboardTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [hasTriedAddMiniApp, setHasTriedAddMiniApp] = useState(false);
  const [hasTriedAutoConnect, setHasTriedAutoConnect] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [readyToClaimCount, setReadyToClaimCount] = useState(0);
  const [badgePosition, setBadgePosition] = useState({ top: 0, right: 0 });
  const [initialPredictionId, setInitialPredictionId] = useState<string | null>(null);
  const viewProfile = useViewProfile();

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Auto-connect wallet in Farcaster frame context (Warpcast)
  // Also marks hasTriedAutoConnect for Base app flow
  useEffect(() => {
    const autoConnectFarcasterWallet = async () => {
      // Skip if already connected or already tried
      if (address || hasTriedAutoConnect) return;
      
      try {
        // Check if Farcaster wallet provider is available (only in Warpcast)
        if (sdk.wallet?.ethProvider) {
          console.log('🔄 Farcaster wallet detected, attempting auto-connect...');
          
          // Find the Farcaster frame connector
          const farcasterConnector = connectors.find(c => c.id === 'farcaster-frame' || c.name === 'Farcaster Frame');
          
          if (farcasterConnector) {
            console.log('📱 Connecting via Farcaster Frame connector...');
            connect({ connector: farcasterConnector });
          } else {
            // Fallback: try injected connector which should pick up the Farcaster provider
            const injectedConnector = connectors.find(c => c.id === 'injected');
            if (injectedConnector) {
              console.log('📱 Connecting via injected connector...');
              connect({ connector: injectedConnector });
            }
          }
        } else {
          console.log('ℹ️ Farcaster wallet provider not available (likely Base app)');
        }
      } catch (error) {
        console.log('ℹ️ Auto-connect check failed:', error);
      }
      
      // Always mark as tried so addMiniApp can run
      setHasTriedAutoConnect(true);
    };

    // Wait a bit for SDK to initialize
    const timer = setTimeout(() => {
      autoConnectFarcasterWallet();
    }, 500);

    return () => clearTimeout(timer);
  }, [address, hasTriedAutoConnect, connect, connectors]);

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

  // Prompt user to add Mini App (for notifications, etc.)
  // Check context.client.added - don't prompt if already added
  useEffect(() => {
    if (hasTriedAddMiniApp || !isFrameReady) return;

    const promptAddMiniApp = async () => {
      try {
        // Check if user already added the mini app - don't prompt again!
        const alreadyAdded = context?.client?.added;
        if (alreadyAdded) {
          console.log('✅ Mini App already added by user, skipping addMiniApp prompt');
          setHasTriedAddMiniApp(true);
          return;
        }

        console.log('📱 Prompting user to add Mini App (not added yet)...');
        setHasTriedAddMiniApp(true);
        
        try {
          const result = await sdk.actions.addMiniApp();
          console.log('✅ Add Mini App result:', result);

          if (result && result.notificationDetails) {
            console.log('✅ Notifications enabled!');
          } else if (result) {
            console.log('⚠️ Mini App added but notifications not enabled');
          } else {
            console.log('⚠️ Add Mini App returned undefined');
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

    // Wait 1 second after frame is ready before prompting
    // This gives time for auto-connect to run first on Farcaster
    const timer = setTimeout(() => {
      promptAddMiniApp();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [isFrameReady, hasTriedAddMiniApp, context]);

  // Check permissions
  const isAdmin = address && process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase();
  const isApprover = address && (process.env.NEXT_PUBLIC_APPROVER_1?.toLowerCase() === address.toLowerCase() ||
                               process.env.NEXT_PUBLIC_APPROVER_2?.toLowerCase() === address.toLowerCase() ||
                               process.env.NEXT_PUBLIC_APPROVER_3?.toLowerCase() === address.toLowerCase() ||
                               process.env.NEXT_PUBLIC_APPROVER_4?.toLowerCase() === address.toLowerCase() ||
                               process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase());

  // Fetch ready-to-claim predictions count using optimized endpoint
  useEffect(() => {
    const fetchReadyToClaimCount = async () => {
      if (!address) {
        setReadyToClaimCount(0);
        return;
      }

      try {
        // Use fast dedicated endpoint that doesn't require loading full dashboard data
        const response = await fetch(`/api/claims/count?userId=${address.toLowerCase()}`);
        if (!response.ok) {
          setReadyToClaimCount(0);
          return;
        }

        const data = await response.json();
        if (data.success) {
          setReadyToClaimCount(data.count || 0);
        } else {
          setReadyToClaimCount(0);
        }
      } catch (error) {
        console.error('Error fetching ready-to-claim count:', error);
        setReadyToClaimCount(0);
      }
    };

    // Fetch immediately on mount
    fetchReadyToClaimCount();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchReadyToClaimCount, 30000);
    return () => clearInterval(interval);
  }, [address]);

  // Update badge position relative to Dashboard trigger
  useEffect(() => {
    const updateBadgePosition = () => {
      if (dashboardTriggerRef.current) {
        const rect = dashboardTriggerRef.current.getBoundingClientRect();
        const containerRect = dashboardTriggerRef.current.closest('.mb-4')?.getBoundingClientRect();
        if (containerRect) {
          setBadgePosition({
            top: rect.top - containerRect.top - 8,
            right: containerRect.right - rect.right - 6,
          });
        }
      }
    };

    updateBadgePosition();
    window.addEventListener('resize', updateBadgePosition);
    return () => window.removeEventListener('resize', updateBadgePosition);
  }, [readyToClaimCount]);

  // Function to refresh predictions data
  const refreshPredictions = () => {
    if (tinderCardRef.current?.refresh) {
      tinderCardRef.current.refresh();
    }
  };

  // Callback for handling prediction ID from URL
  const handlePredictionId = useCallback((id: string) => {
    setInitialPredictionId(id);
    setActiveDashboard('tinder');
  }, []);

  return (
    <div className="flex flex-col min-h-screen font-sans text-[var(--app-foreground)] mini-app-theme from-[var(--app-background)] to-[var(--app-gray)]">
      {/* Suspense wrapper for useSearchParams */}
      <Suspense fallback={null}>
        <SearchParamsHandler onPredictionId={handlePredictionId} />
      </Suspense>
      
      <div className="w-full max-w-[424px] mx-auto px-2 sm:px-4 py-3 overflow-x-hidden">
        {/* Wallet Connection and Admin/Help - Top */}
        <div className="flex justify-between items-center mb-3">
          <Wallet className="z-10">
            <ConnectWallet 
              className="swipe-glow-button swipe-glow-green !px-3 !py-1.5 !text-sm !min-w-0 !font-semibold !rounded-full hover:!scale-105 !transition-all !duration-200" 
              text="Sign In"
            >
              {address && userProfile ? (
                <div className="flex items-center gap-2">
                  <ShadcnAvatar className="w-7 h-7 ring-2 ring-[#d4ff00]/30">
                    <AvatarImage 
                      src={userProfile?.pfp_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${address?.slice(2, 8)}`} 
                      alt={userProfile?.display_name || 'User'} 
                    />
                    <AvatarFallback className="bg-black text-[#d4ff00] font-bold text-[10px]">
                      {userProfile?.display_name?.slice(0, 2).toUpperCase() || address?.slice(2, 4).toUpperCase()}
                    </AvatarFallback>
                  </ShadcnAvatar>
                  <span className="text-[#d4ff00] font-bold text-xs truncate max-w-[120px]" style={{ fontFamily: '"Spicy Rice", cursive' }}>
                    {userProfile?.display_name || userProfile?.username}
                  </span>
                </div>
              ) : address ? (
                <div className="flex items-center gap-2">
                  <ShadcnAvatar className="w-7 h-7 ring-2 ring-[#d4ff00]/30">
                    <AvatarImage 
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${address?.slice(2, 8)}`} 
                      alt="User" 
                    />
                    <AvatarFallback className="bg-black text-[#d4ff00] font-bold text-[10px]">
                      {address?.slice(2, 4).toUpperCase()}
                    </AvatarFallback>
                  </ShadcnAvatar>
                  <span className="text-[#d4ff00] font-bold text-xs" style={{ fontFamily: '"Spicy Rice", cursive' }}>
                    {`${address?.slice(0, 6)}...`}
                  </span>
                </div>
              ) : (
                <span className="text-[#d4ff00]" style={{ fontFamily: '"Spicy Rice", cursive' }}>Sign In</span>
              )}
            </ConnectWallet>
            <WalletDropdown>
              <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                <Avatar />
                <Name />
                <Address />
                <EthBalance />
              </Identity>
              {/* View Base Profile button */}
              {userProfile?.fid && (
                <div 
                  className="px-4 py-2 cursor-pointer hover:bg-gray-100 text-sm text-blue-600 font-medium border-t"
                  onClick={() => viewProfile(parseInt(userProfile.fid!, 10))}
                >
                  👤 View Base Profile
                </div>
              )}
              <WalletDropdownDisconnect />
            </WalletDropdown>
          </Wallet>
          
          {/* Admin, Leaderboard, Help icons + How to Play button - Top Right */}
          <div className="flex gap-2 items-center">
            {/* Icon buttons grouped together */}
            <div className="flex gap-1">
              {isAdmin && (
                <Button
                  variant="swipeGlow"
                  size="icon"
                  onClick={() => setActiveDashboard('admin')}
                  title="Admin Dashboard"
                  className="swipe-glow-purple"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="swipeGlow"
                size="icon"
                onClick={() => setActiveDashboard('leaderboard')}
                title="Leaderboard"
                className="swipe-glow-gold"
              >
                <Trophy className="h-4 w-4" />
              </Button>
              <Button
                variant="swipeGlow"
                size="icon"
                onClick={() => setActiveDashboard('help-faq')}
                title="Help & FAQ"
                className="swipe-glow-cyan"
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
            </div>
            {/* How to Play button on the right */}
            <Button
              variant="swipeGlow"
              onClick={() => setIsHowToPlayOpen(true)}
              className="!px-3 !py-2 !text-xs !font-semibold swipe-glow-green"
              style={{ fontFamily: '"Spicy Rice", cursive' }}
            >
              How to Play
            </Button>
          </div>
        </div>

        {/* Menu Bar - Right after Wallet */}
        <div className="mb-4 relative" style={{ overflow: 'visible' }}>
          <Menubar className="mini-app-menu">
            <MenubarMenu>
              <MenubarTrigger className="menubar-trigger" onClick={() => setActiveDashboard('tinder')}>
                Bets
              </MenubarTrigger>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger 
                ref={dashboardTriggerRef}
                id="dashboard-trigger"
                className="menubar-trigger relative" 
                onClick={() => setActiveDashboard('user')}
                style={{ overflow: 'visible' }}
              >
                <span>Dashboard</span>
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
              <MenubarTrigger 
                className="menubar-trigger !bg-gradient-to-r !from-orange-500 !to-yellow-500 !text-black !font-bold hover:!from-orange-400 hover:!to-yellow-400" 
                onClick={() => setActiveDashboard('daily-tasks')}
              >
                🎁 Tasks
              </MenubarTrigger>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger className="menubar-trigger" onClick={() => setActiveDashboard('market-stats')}>
                Stats
              </MenubarTrigger>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger className="menubar-trigger relative">
                Create
                <Badge 
                  variant="default" 
                  className="absolute -top-2 -right-3 px-1 py-0 text-[9px] font-bold bg-red-500 text-white border-0 animate-pulse shadow-lg shadow-red-500/30"
                >
                  LIVE
                </Badge>
              </MenubarTrigger>
              <MenubarContent>
                <MenubarItem onSelect={() => setIsCreateModalOpen(true)}>
                  Create Prediction
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
          {/* Animated notification badge positioned absolutely outside Menubar */}
          {readyToClaimCount > 0 && (
            <div
              className="notification-badge"
              style={{ 
                position: 'absolute',
                top: `${badgePosition.top}px`, 
                right: `${badgePosition.right}px`,
                zIndex: 99999 
              }}
            >
              {readyToClaimCount > 9 ? '9+' : readyToClaimCount}
            </div>
          )}
        </div>

        {/* Main Content with Tinder Cards */}
        <main className="flex-1">
          {activeDashboard === 'tinder' && (
            <TinderCardComponent
              ref={tinderCardRef}
              activeDashboard={activeDashboard}
              onDashboardChange={setActiveDashboard}
              initialPredictionId={initialPredictionId}
              onInitialPredictionHandled={() => setInitialPredictionId(null)}
            />
          )}

          {activeDashboard === 'admin' && <AdminPanel />}

          {activeDashboard === 'approver' && <AdminPanel />}

          {/* SWIPE Token Card */}
          {activeDashboard === 'swipe-token' && <SwipeTokenCard />}

          {/* Daily Tasks */}
          {activeDashboard === 'daily-tasks' && <DailyTasks />}

          {/* Dashboard - moved from 'user' to replace CLAIM */}
          {activeDashboard === 'user' && (
            <div>
              <EnhancedUserDashboard />
            </div>
          )}

          {/* Claim Page - kept for future use but not accessible from nav */}
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

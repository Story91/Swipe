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
import { Menu, Plus, BarChart3, PlayCircle, Trophy, HelpCircle, Settings } from "lucide-react";
import { useAccount, useConnect } from "wagmi";
import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { CompactStats } from "./components/Market/CompactStats";
import { SidePanels } from "./components/SidePanels/SidePanels";
import { useIsDesktop } from "@/lib/hooks/useMediaQuery";
import { useDesktopViewMode } from "@/lib/hooks/desktopViewMode";
import { MarketGrid } from "./components/Markets/MarketGrid";
import { ProductPanels } from "./components/Panels/ProductPanels";

/**
 * Everything below renders behind a dashboard switch or a modal, so at most one
 * of them is on screen at a time — yet importing them eagerly put all of them
 * in the first-load bundle (846 kB for this route). next/dynamic defers each
 * until it is actually chosen.
 *
 * ssr: false because they are wallet- and browser-dependent and were never
 * server-rendered in any useful form; this avoids paying for their markup twice.
 */
const loading = () => <div className="dashboard-loading">Loading…</div>;

// The swipe card is the heaviest single component in the app and is not
// rendered at all in desktop grid mode. Deferring it costs mobile one extra
// round trip and saves every desktop visitor from downloading it.
const TinderCardComponent = dynamic(() => import("./components/Main/TinderCard"), { ssr: false, loading });

const AdminPanel = dynamic(() => import("./components/Admin/AdminPanel").then(m => m.AdminPanel), { ssr: false, loading });
const UserDashboard = dynamic(() => import("./components/Portfolio/UserDashboard").then(m => m.UserDashboard), { ssr: false, loading });
const EnhancedUserDashboard = dynamic(() => import("./components/Portfolio/EnhancedUserDashboard").then(m => m.EnhancedUserDashboard), { ssr: false, loading });
const MyPortfolio = dynamic(() => import("./components/Portfolio/MyPortfolio").then(m => m.MyPortfolio), { ssr: false, loading });
const ActiveBets = dynamic(() => import("./components/Portfolio/ActiveBets").then(m => m.ActiveBets), { ssr: false, loading });
const BetHistory = dynamic(() => import("./components/Portfolio/BetHistory").then(m => m.BetHistory), { ssr: false, loading });
const PlatformAnalytics = dynamic(() => import("./components/Admin/PlatformAnalytics").then(m => m.PlatformAnalytics), { ssr: false, loading });
const SystemSettings = dynamic(() => import("./components/Admin/SystemSettings").then(m => m.SystemSettings), { ssr: false, loading });
const AuditLogs = dynamic(() => import("./components/Admin/AuditLogs").then(m => m.AuditLogs), { ssr: false, loading });
const HelpAndFaq = dynamic(() => import("./components/Support/HelpAndFaq").then(m => m.HelpAndFaq), { ssr: false, loading });
const Leaderboard = dynamic(() => import("./components/Market/Leaderboard").then(m => m.Leaderboard), { ssr: false, loading });
const RecentActivity = dynamic(() => import("./components/Support/RecentActivity").then(m => m.RecentActivity), { ssr: false, loading });
const SwipeTokenCard = dynamic(() => import("./components/Market/SwipeTokenCard").then(m => m.SwipeTokenCard), { ssr: false, loading });
const SwipeClaim = dynamic(() => import("./components/Portfolio/SwipeClaim").then(m => m.SwipeClaim), { ssr: false, loading });
const DailyTasks = dynamic(() => import("./components/Tasks/DailyTasks").then(m => m.DailyTasks), { ssr: false, loading });
const KalshiMarkets = dynamic(() => import("./components/Markets/KalshiMarkets"), { ssr: false, loading });

// Modals: mounted but closed most of the time, so they cost nothing until opened.
const CreatePredictionModal = dynamic(() => import("./components/Modals/CreatePredictionModal").then(m => m.CreatePredictionModal), { ssr: false });
const HowToPlayModal = dynamic(() => import("./components/Modals/HowToPlayModal").then(m => m.HowToPlayModal), { ssr: false });

type DashboardType = 'tinder' | 'user' | 'admin' | 'approver' | 'market-stats' | 'analytics' | 'settings' | 'audit-logs' | 'my-portfolio' | 'active-bets' | 'bet-history' | 'help-faq' | 'leaderboard' | 'recent-activity' | 'swipe-token' | 'claim' | 'daily-tasks' | 'usdc-markets';

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
  const [initialPredictionId, setInitialPredictionId] = useState<string | null>(null);
  const viewProfile = useViewProfile();
  const isDesktop = useIsDesktop();
  const { mode: desktopView, setMode: setDesktopView } = useDesktopViewMode();

  // Grid is a desktop-only browse layout; mobile always stays on the swipe card.
  const showGrid = isDesktop && desktopView === 'grid' && activeDashboard === 'tinder';
  // Side rails only make sense around the narrow swipe card — in grid mode the
  // markets themselves fill the width.
  const showSidePanels = isDesktop && desktopView === 'swipe';

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
        // There is no Mini App host to answer outside Warpcast / the Base app,
        // so the SDK call resolves undefined and then throws on `.result`.
        // isInMiniApp() returns false when the page is not framed by a host.
        const inMiniApp = await sdk.isInMiniApp();
        if (!inMiniApp) {
          console.log('ℹ️ Not running inside a Mini App host, skipping addMiniApp prompt');
          setHasTriedAddMiniApp(true);
          return;
        }

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
      
      {/* Side rails - desktop swipe mode only */}
      {showSidePanels && <SidePanels />}

      <div
        className={`w-full mx-auto py-3 main-content-wrapper ${
          showGrid
            // Grid mode: the container IS the page. Header blocks below cap
            // themselves so they stay readable while the grid uses the width.
            ? 'max-w-none px-4 lg:px-8'
            : isDesktop
              // Desktop swipe mode: one large card, not a phone-width column.
              ? 'max-w-[560px] px-2 sm:px-4 overflow-x-hidden'
              : 'max-w-[424px] px-2 sm:px-4 overflow-x-hidden'
        }`}
      >
        {/* Wallet Connection and Admin/Help - Top */}
        <div
          className={`flex justify-between items-center mb-3 ${
            showGrid ? 'max-w-[1100px] w-full mx-auto' : ''
          }`}
        >
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
          
          {/* Menu Dropdown - Top Right */}
          <Menubar className="!bg-transparent !border-0 !p-0 !h-auto">
            <MenubarMenu>
              <MenubarTrigger 
                className="swipe-glow-button swipe-glow-green !px-3 !py-2 !text-sm !font-semibold !rounded-full hover:!scale-105 !transition-all !duration-200 !cursor-pointer flex items-center gap-2"
                style={{ fontFamily: '"Spicy Rice", cursive' }}
              >
                <Menu className="h-4 w-4 text-[#d4ff00]" />
                <span className="text-[#d4ff00]">Menu</span>
              </MenubarTrigger>
              <MenubarContent className="!bg-black/95 !border-[#d4ff00]/30 !rounded-xl !p-2 !min-w-[180px]">
                {/* Create - First */}
                <MenubarItem 
                  className="!text-white hover:!bg-[#d4ff00]/20 !rounded-lg !py-2.5 !px-3 !cursor-pointer flex items-center gap-3"
                  onSelect={() => setIsCreateModalOpen(true)}
                >
                  <Plus className="h-4 w-4 text-red-500" />
                  <span className="font-semibold">Create</span>
                  <span className="ml-auto text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded animate-pulse">LIVE</span>
                </MenubarItem>
                
                {/* Stats */}
                <MenubarItem 
                  className="!text-white hover:!bg-[#d4ff00]/20 !rounded-lg !py-2.5 !px-3 !cursor-pointer flex items-center gap-3"
                  onSelect={() => setActiveDashboard('market-stats')}
                >
                  <BarChart3 className="h-4 w-4 text-blue-400" />
                  <span>Stats</span>
                </MenubarItem>
                
                {/* How to Play */}
                <MenubarItem 
                  className="!text-white hover:!bg-[#d4ff00]/20 !rounded-lg !py-2.5 !px-3 !cursor-pointer flex items-center gap-3"
                  onSelect={() => setIsHowToPlayOpen(true)}
                >
                  <PlayCircle className="h-4 w-4 text-green-400" />
                  <span>How to Play</span>
                </MenubarItem>
                
                {/* Leaderboard */}
                <MenubarItem 
                  className="!text-white hover:!bg-[#d4ff00]/20 !rounded-lg !py-2.5 !px-3 !cursor-pointer flex items-center gap-3"
                  onSelect={() => setActiveDashboard('leaderboard')}
                >
                  <Trophy className="h-4 w-4 text-yellow-400" />
                  <span>Leaderboard</span>
                </MenubarItem>
                
                {/* Help & FAQ */}
                <MenubarItem 
                  className="!text-white hover:!bg-[#d4ff00]/20 !rounded-lg !py-2.5 !px-3 !cursor-pointer flex items-center gap-3"
                  onSelect={() => setActiveDashboard('help-faq')}
                >
                  <HelpCircle className="h-4 w-4 text-cyan-400" />
                  <span>Help & FAQ</span>
                </MenubarItem>
                
                {/* Admin - only if admin */}
                {isAdmin && (
                  <MenubarItem 
                    className="!text-white hover:!bg-purple-500/20 !rounded-lg !py-2.5 !px-3 !cursor-pointer flex items-center gap-3 !border-t !border-[#d4ff00]/10 !mt-1 !pt-3"
                    onSelect={() => setActiveDashboard('admin')}
                  >
                    <Settings className="h-4 w-4 text-purple-400" />
                    <span>Admin Panel</span>
                  </MenubarItem>
                )}
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </div>

        {/* Menu Bar - Right after Wallet */}
        <div
          className={`mb-4 relative ${showGrid ? 'max-w-[1100px] w-full mx-auto' : ''}`}
          style={{ overflow: 'visible' }}
        >
          <Menubar className="mini-app-menu">
            <MenubarMenu>
              <MenubarTrigger className="menubar-trigger" onClick={() => setActiveDashboard('tinder')}>
                Bets
              </MenubarTrigger>
            </MenubarMenu>
            {/* Layout switch lives in the main nav on desktop; mobile is always swipe */}
            {isDesktop && activeDashboard === 'tinder' && (
              <div className="nav-view-switch" role="group" aria-label="Markets layout">
                <button
                  type="button"
                  className={`nav-view-switch__option${desktopView === 'grid' ? ' nav-view-switch__option--active' : ''}`}
                  aria-pressed={desktopView === 'grid'}
                  onClick={() => setDesktopView('grid')}
                >
                  Grid
                </button>
                <button
                  type="button"
                  className={`nav-view-switch__option${desktopView === 'swipe' ? ' nav-view-switch__option--active' : ''}`}
                  aria-pressed={desktopView === 'swipe'}
                  onClick={() => setDesktopView('swipe')}
                >
                  Swipe
                </button>
              </div>
            )}
            <MenubarMenu>
              <MenubarTrigger 
                className="menubar-trigger !bg-gradient-to-r !from-blue-500 !to-green-500 !text-white !font-bold hover:!from-blue-400 hover:!to-green-400" 
                onClick={() => setActiveDashboard('usdc-markets')}
              >
                💵 USDC
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
                {readyToClaimCount > 0 && (
                  <span className="dashboard-badge">
                    {readyToClaimCount > 9 ? '9+' : readyToClaimCount}
                  </span>
                )}
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
          </Menubar>
        </div>

        {/* Swipe mode only ever offers markets you can still bet on, so when
            none are open it is a dead end. This is the way out to the full
            history, which lives in grid mode. */}
        {isDesktop && desktopView === 'swipe' && activeDashboard === 'tinder' && (
          <button
            type="button"
            className="browse-all-link"
            onClick={() => setDesktopView('grid')}
          >
            Browse all markets →
          </button>
        )}

        {/* Main Content with Tinder Cards */}
        <main className="flex-1">
          {showGrid && (
            <>
              <ProductPanels layout="bar" />
              <MarketGrid />
            </>
          )}

          {activeDashboard === 'tinder' && !showGrid && (
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

          {/* USDC Markets */}
          {activeDashboard === 'usdc-markets' && <KalshiMarkets />}

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

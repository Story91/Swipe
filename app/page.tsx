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
import { useActiveChain } from "@/lib/chains/activeChain";
import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { CompactStats } from "./components/Market/CompactStats";
import { SidePanels } from "./components/SidePanels/SidePanels";
import { useIsDesktop } from "@/lib/hooks/useMediaQuery";
import { useDesktopViewMode } from "@/lib/hooks/desktopViewMode";
import { MarketGrid } from "./components/Markets/MarketGrid";
import { ProductPanels } from "./components/Panels/ProductPanels";
import { ReadOnlyNotice } from "./components/Panels/ReadOnlyNotice";
import { ComingSoonOverlay } from "./components/Panels/ComingSoonOverlay";
import { ChainSwitcher } from "./components/Wallet/ChainSwitcher";
import { WalletPicker } from "./components/Wallet/WalletPicker";
import { AppSidebar, AppBar } from "./components/Shell/AppSidebar";
import { useSidebarCollapsed } from "./components/Shell/sidebarCollapsed";
import { CRUMB, type DashboardType } from "./components/Shell/navItems";
import "./components/Markets/GridPage.css";

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

// Modals: mounted but closed most of the time, so they cost nothing until opened.
const CreatePredictionModal = dynamic(() => import("./components/Modals/CreatePredictionModal").then(m => m.CreatePredictionModal), { ssr: false });
const HowToPlayModal = dynamic(() => import("./components/Modals/HowToPlayModal").then(m => m.HowToPlayModal), { ssr: false });

/* DashboardType now comes from components/Shell/navItems, which is also what
   the sidebar is built from and what navItems.test.ts checks for coverage. Two
   copies of the union is how a dashboard ends up with no way in. */

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
  // The claim badge is per chain, so the count has to be asked for per chain.
  const { chainKey } = useActiveChain();
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
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapsed();

  /*
   * The desktop shell: sidebar, top bar, one content column.
   *
   * Not shown in swipe mode, and that is deliberate rather than unfinished. The
   * swipe rails are position: fixed at left: 0 and right: 0, so a sidebar in the
   * flow would sit underneath the left one at every viewport under 1760px. Swipe
   * mode keeps exactly the layout it has today, horizontal menubar included, and
   * the Grid/Swipe switch is the way between the two.
   */
  const showShell = isDesktop && desktopView === 'grid';

  // Grid is a desktop-only browse layout; mobile always stays on the swipe card.
  const showGrid = showShell && activeDashboard === 'tinder';
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
        // Use fast dedicated endpoint that doesn't require loading full dashboard data.
        // The chain has to travel with it, the same way useProductPanelData sends
        // it for this very widget: without it the badge counts Base's claims and
        // tells a user on another network they have money waiting that is not there.
        const response = await fetch(`/api/claims/count?userId=${address.toLowerCase()}&chain=${chainKey}`);
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
  }, [address, chainKey]);


  // Function to refresh predictions data
  const refreshPredictions = () => {
    if (tinderCardRef.current?.refresh) {
      tinderCardRef.current.refresh();
    }
  };

  /**
   * Seek the app to one market, from `/?prediction=<id>`.
   *
   * Also switches the desktop view to swipe, and that is the whole fix for a
   * dead end: "Place your bet" on /prediction/[id] pushes this URL, and staking
   * lives on the swipe card. Setting activeDashboard alone was not enough,
   * because showGrid is `isDesktop && desktopView === 'grid' && dashboard ===
   * 'tinder'` and desktopView defaults to 'grid' and persists. So a desktop
   * user pressed the one button on the page that stakes and arrived back at the
   * market grid, with nothing to show for it.
   *
   * Harmless on mobile, where desktopView is never read.
   */
  const handlePredictionId = useCallback((id: string) => {
    setInitialPredictionId(id);
    setActiveDashboard('tinder');
    setDesktopView('swipe');
  }, [setDesktopView]);

  /*
   * The wallet controls, defined once and placed in one of two headers: the
   * shell's top bar on desktop, the stacked row everywhere else. Only one of
   * the two branches ever renders, so this is a move, not a copy — which
   * matters, because <WalletDropdown> is a popover anchored to its own trigger
   * and two of them on a page would fight.
   *
   * Disconnected: our own picker, because OnchainKit's <ConnectWallet> connects
   * with a single connector — that is why the app only ever offered Coinbase
   * Smart Wallet and MetaMask was unreachable.
   *
   * Connected: OnchainKit's components stay, since they carry the avatar, the
   * Farcaster display name and the whole <WalletDropdown>. Replacing them
   * outright would trade one wallet for a worse header.
   */
  const walletControl = !address ? (
    <WalletPicker />
  ) : (
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
  );

  /* Layout switch. Desktop only; mobile is always swipe. */
  const viewSwitch = isDesktop && activeDashboard === 'tinder' ? (
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
  ) : null;

  return (
    <div className="flex flex-col min-h-screen font-sans text-[var(--app-foreground)] mini-app-theme from-[var(--app-background)] to-[var(--app-gray)]">
      {/* Suspense wrapper for useSearchParams */}
      <Suspense fallback={null}>
        <SearchParamsHandler onPredictionId={handlePredictionId} />
      </Suspense>
      
      {/* Side rails - desktop swipe mode only */}
      {showSidePanels && <SidePanels />}

      {/* The shell. `contents` keeps both wrappers out of layout on mobile and
          in swipe mode, so those stacks render exactly as they did before the
          shell existed. */}
      <div
        className={showShell ? 'appshell' : 'contents'}
        data-collapsed={showShell && sidebarCollapsed ? 'true' : undefined}
      >
        {showShell && (
          <AppSidebar
            active={activeDashboard}
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebar}
            onSelect={setActiveDashboard}
            onCreate={() => setIsCreateModalOpen(true)}
            onHowToPlay={() => setIsHowToPlayOpen(true)}
            claimCount={readyToClaimCount}
            isAdmin={!!isAdmin}
          />
        )}

        <div className={showShell ? 'appshell__main' : 'contents'}>
          {/* The bar sits outside .main-content-wrapper on purpose: that
              wrapper sets overflow-x-hidden on two of its three branches, and
              the wallet menu and the chain switcher menu are absolutely
              positioned children rather than portals. Inside it they would be
              cut in half. */}
          {showShell && (
            <AppBar active={activeDashboard}>
              {viewSwitch}
              <ChainSwitcher />
              {walletControl}
            </AppBar>
          )}

          {showGrid && (
            <h1 className="appshell__title">{CRUMB[activeDashboard].title}</h1>
          )}

      <div
        className={`w-full mx-auto py-3 main-content-wrapper ${
          showShell
            // Inside the shell the column is already positioned, sized and
            // gutter'd by .appshell, so the wrapper must not cap itself. This
            // used to read `showGrid`, which meant every sidebar row other than
            // Markets fell through to the swipe card's 560px and rendered as a
            // narrow strip in a 1424px column with bare lime either side. The
            // flex column is what lets the sheet below reach the floor.
            ? 'max-w-none px-4 lg:px-8 flex flex-col flex-1'
            : isDesktop
              // Desktop swipe mode: one large card, not a phone-width column.
              ? 'max-w-[560px] px-2 sm:px-4 overflow-x-hidden'
              : 'max-w-[424px] px-2 sm:px-4 overflow-x-hidden'
        }`}
      >
        {/* Mobile and swipe mode keep the header they have always had: the
            wallet row, then the horizontal menubar. On desktop those controls
            are in the shell above and this whole block stands down. */}
        {!showShell && (
          <>

        {/* Wallet Connection and Admin/Help - Top */}
        <div className="flex justify-between items-center gap-2 mb-3">
          {walletControl}

          {/* The network sits between sign-in and the menu, so the chain you
              are betting on is on the same line as who you are betting as.
              It used to be a chip in the row below, wedged between Bets and
              the collateral tab, which read as another destination rather
              than as the setting that decides what every destination shows. */}
          <div className="flex items-center gap-2 ml-auto">
            <ChainSwitcher />

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
        </div>

        {/* Menu Bar - Right after Wallet */}
        <div className="relative mb-4" style={{ overflow: 'visible' }}>
          <Menubar className="mini-app-menu">
            <MenubarMenu>
              <MenubarTrigger className="menubar-trigger" onClick={() => setActiveDashboard('tinder')}>
                Bets
              </MenubarTrigger>
            </MenubarMenu>
            {/* The network switch moved up to the wallet row, next to Menu.
                Two of them would be two controls for one fact. */}
            {/* Layout switch lives in the main nav here; on the desktop shell
                it moves to the top bar. */}
            {viewSwitch}
            {/* The collateral tab that sat here routed to the separate USDC
                markets list, which merged into the one markets surface. On a
                phone that surface is Bets, the swipe deck: it bets the same
                collateral markets on the active chain, and the exit list lives
                under the deck. The per-market view is /prediction/[id]. */}
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

          </>
        )}

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
        {/* Every dashboard other than the grid gets the same dark sheet the
            markets get: one opaque face filling the content column, with the
            grid's own side padding. Without it the panels inside keep their
            phone-width caps and float on bare lime. */}
        <main
          className={
            showGrid
              ? 'flex-1 flex flex-col'
              : showShell
                ? 'flex-1 flex flex-col appshell__panel'
                : 'flex-1'
          }
        >
          {showGrid && (
            <div className="grid-shell grid-shell--fill">
              <ReadOnlyNotice />
              <ProductPanels layout="bar" />
              {/* The filter bar, the cards and the pagination are three
                  siblings out of MarketGrid; the sheet is what makes them one
                  surface, and it is here rather than in that component because
                  it is page layout, not grid layout. */}
              <section className="market-sheet">
                <MarketGrid />
              </section>
            </div>
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

          {/* SWIPE Token Card — the Base token's fee stream sits in an archived
              contract, so this is being rebuilt on the new token. */}
          {/* No overlay, for the same reason as the tasks screen below. The
              page now says the old token is finished and the new one has no
              date, so covering it repeats the message while blurring it out.
              The overlay also sets pointer-events: none, aria-hidden and inert,
              which put the live chain readout, its retry button and every link
              out of reach of a mouse and a keyboard alike. */}
          {activeDashboard === 'swipe-token' && <SwipeTokenCard />}

          {/* Daily Tasks — rewards were paid in the old token. */}
          {/* No overlay. The screen underneath used to be the old rewards UI,
              wired to three archived contracts, so it had to be covered. It is
              now a preview that says what it is on its own, and the overlay set
              `inert` and `aria-hidden`, which switched off the one control the
              preview has and hid the whole thing from a screen reader. */}
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
              <ComingSoonOverlay
                title="Claims are paused"
                message="$SWIPE claims are moving to the new token on Robinhood Chain. Claims against the old contract cannot be processed."
              >
                <SwipeClaim />
              </ComingSoonOverlay>
            </div>
          )}

          {/* No overlay. Every figure here is now read from the live contract
              in the chain's own symbol, or sits under an "archived" heading
              next to the token it is denominated in, so the old warning about
              volume being counted in $SWIPE is itself the inaccurate line. */}
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

        </div>
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

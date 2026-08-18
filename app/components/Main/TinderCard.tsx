import React, { useState, useCallback, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import TinderCard from 'react-tinder-card';
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from 'viem';
import { CONTRACTS } from '../../../lib/contract';
import { useAdminRequest } from '../../../lib/auth/useAdminRequest';
import { CHAINS, isWritableMarket, type ChainKey } from '@/lib/chains';
import { useActiveChain } from '@/lib/chains/activeChain';
import { useMarketWrite } from '@/lib/chains/useMarketWrite';
import { txUrl } from '@/lib/chains/market';
import { marketNumber, parseMarketId } from '@/lib/marketId';
import { useViewProfile, useComposeCast, useMiniKit, useViewCast, useOpenUrl } from '@coinbase/onchainkit/minikit';
import sdk from '@farcaster/miniapp-sdk';
import './TinderCard.css';
import './Dashboards.css';
import { NotificationSystem, showNotification, UserDashboard } from '../Portfolio/UserDashboard';
import { AdminDashboard } from '../Admin/AdminDashboard';
import { ApproverDashboard } from '../Approver/ApproverDashboard';
import { useHybridPredictions } from '../../../lib/hooks/useHybridPredictions';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useFarcasterProfiles } from '../../../lib/hooks/useFarcasterProfiles';
import SharePredictionButton from '../Actions/SharePredictionButton';
import { buildStakeShareText, buildCurrentPredictionShareText } from '../../../lib/constants/share-texts';
import { notifyPredictionShared, notifyStakeSuccess } from '../../../lib/notification-helpers';
import { generateTransactionId } from '../../../lib/utils/redis-utils';
import { useTokenPrices } from '../../../lib/hooks/useTokenPrices';
import { Bot, Loader2, Sparkles, X, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Coins, PieChart, ArrowUpRight, ArrowDownRight, Info, Zap, Target, Award, Wallet, Calculator } from 'lucide-react';
import ElectricBorder from '@/components/ElectricBorder';
import ShinyText from '@/components/ShinyText';
import GradientText from '@/components/GradientText';
import TextType from '@/components/TextType';
import { SharePreviewModal } from '../Modals/SharePreviewModal';
import { MarketPools } from './MarketPools';
import { YourPosition } from './YourPosition';
import { ExitPanel } from '../Markets/MarketDetail/ExitPanel';

// Just the two entry points the collateral needs. Kept minimal on purpose: the
// spender and the token address are never literals here, they come from
// marketWrite.market, so this ABI can be reused on any chain's collateral.
const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// The archived V1 and V2 contracts are Base deployments. Their addresses mean
// nothing on any other network, and a call to a Base address signed elsewhere
// does not revert: it reaches an address holding no code, the EVM returns
// success, and the wallet tells the user the claim went through while nothing
// moved. So the two calls that are still legitimate against those contracts,
// both of them claims, name the chain they belong to and pin it.
const ARCHIVED_CHAIN_KEY: ChainKey = 'base';
const ARCHIVED_CHAIN_LABEL = CHAINS[ARCHIVED_CHAIN_KEY].label;
const ARCHIVED_CHAIN_ID = CHAINS[ARCHIVED_CHAIN_KEY].viemChain.id;

interface PredictionData {
  id: number;
  /**
   * The canonical Redis id this card came from, e.g. `pred_v3_2`.
   *
   * `id` alone is the market number, which is unique only within a contract
   * generation: `pred_v2_2` and `pred_v3_2` are two different markets that both
   * reduce to 2. The bet path re-reads this string and refuses when it cannot be
   * parsed, rather than betting on whatever market carries that number on the
   * live contract.
   */
  redisId?: string;
  title: string;
  image: string;
  prediction: string;
  timeframe: string;
  confidence: number;
  category: string;
  price: string;
  change: string;
  description: string;
  isChart?: boolean;
  votingYes: number;
  creator?: string;
  participants?: string[];
}

interface TinderCardProps {
  items?: PredictionData[];
  activeDashboard?: 'tinder' | 'user' | 'admin' | 'approver';
  onDashboardChange?: (dashboard: 'tinder' | 'user' | 'admin' | 'approver') => void;
  onRefresh?: () => void;
  initialPredictionId?: string | null;
  onInitialPredictionHandled?: () => void;
}

type DashboardType = 'tinder' | 'user' | 'admin' | 'approver';

// Helper function to format time left
export function formatTimeLeft(deadline: number): string {
  const now = Date.now() / 1000;
  const timeLeft = deadline - now;
  
  if (timeLeft <= 0) {
    return 'Expired';
  }
  
  const days = Math.floor(timeLeft / (24 * 60 * 60));
  const hours = Math.floor((timeLeft % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((timeLeft % (60 * 60)) / 60);
  const seconds = Math.floor(timeLeft % 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

// Helper function to get time urgency class
function getTimeUrgencyClass(deadline: number): string {
  const now = Date.now() / 1000;
  const timeLeft = deadline - now;
  
  if (timeLeft <= 0) {
    return 'text-red-500'; // Expired
  } else if (timeLeft <= 3600) { // Less than 1 hour
    return 'text-red-500'; // Critical
  } else if (timeLeft <= 86400) { // Less than 1 day
    return 'text-orange-500'; // Warning
  } else {
    return 'text-green-500'; // Normal
  }
}

// Helper function to extract cast hash from various Farcaster/Warpcast URLs
function extractCastHash(url: string): string | null {
  // Match patterns like:
  // https://warpcast.com/username/0x1234...
  // https://warpcast.com/~/conversations/0x1234...
  // https://base.app/post/0x1234...
  // https://farcaster.xyz/~/cast/0x1234...
  const patterns = [
    /warpcast\.com\/[^\/]+\/([0-9a-fA-Fx]+)$/,
    /warpcast\.com\/~\/conversations\/([0-9a-fA-Fx]+)/,
    /base\.app\/post\/([0-9a-fA-Fx]+)/,
    /farcaster\.xyz\/~\/cast\/([0-9a-fA-Fx]+)/,
    /\/cast\/([0-9a-fA-Fx]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Helper function to check if URL is a Farcaster cast URL
function isFarcasterCastUrl(url: string): boolean {
  return extractCastHash(url) !== null;
}

// TinderCard API interface for ref
interface TinderCardAPI {
  swipe: (dir?: 'left' | 'right' | 'up' | 'down') => Promise<void>;
  restoreCard: () => Promise<void>;
}

const TinderCardComponent = forwardRef<{ refresh: () => void }, TinderCardProps>(({ items, activeDashboard: propActiveDashboard, onDashboardChange, initialPredictionId, onInitialPredictionHandled }, ref) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [loadingStates, setLoadingStates] = useState<{ [key: number]: boolean }>({});
  
  // Ref for TinderCard to restore card if stake is cancelled
  const tinderCardRef = useRef<TinderCardAPI>(null);
  const [internalActiveDashboard, setInternalActiveDashboard] = useState<DashboardType>('tinder');
  // One market, one collateral. The ETH/SWIPE selector is gone with the archived
  // V2 pool: V3 takes an ERC-20 amount and has no payable function at all, so
  // there is nothing left to choose between. `redisId` travels with the number
  // so the send can re-derive the market instead of trusting a bare integer.
  const [stakeModal, setStakeModal] = useState<{
    isOpen: boolean;
    predictionId: number;
    redisId: string;
    isYes: boolean;
    stakeAmount: string;
  }>({
    isOpen: false,
    predictionId: 0,
    redisId: '',
    isYes: true,
    stakeAmount: '1'
  });

  // Track user actions for feedback.
  // `status` distinguishes "a side was picked, the dialog is opening" (set on
  // swipe release) from "the stake actually landed on-chain" (set only once
  // useWaitForTransactionReceipt confirms, in handleStakeSuccess). The two used
  // to share one "Stake Accepted" label even though only the second is true.
  const [lastAction, setLastAction] = useState<{
    type: 'skip' | 'bet' | null;
    status?: 'selected' | 'confirmed';
    predictionId: number;
    direction: 'left' | 'right' | null;
    timestamp: number;
  } | null>(null);

  // Show action feedback for 3 seconds
  const [showActionFeedback, setShowActionFeedback] = useState(false);
  // Show share prompt after successful stake
  const [showSharePrompt, setShowSharePrompt] = useState(false);
  const [lastStakedPrediction, setLastStakedPrediction] = useState<PredictionData | null>(null);
  // Store stake details for sharing (separate from transaction tracking to avoid reset issues).
  // `token` is the collateral symbol of the chain the bet was signed on, USDC on
  // Base and USDG on Robinhood, not a choice the user made.
  const [shareStakeData, setShareStakeData] = useState<{
    amount: number;
    token: string;
    isYes: boolean;
  } | null>(null);

  // State for tracking stake transactions
  const [stakeTransactionHash, setStakeTransactionHash] = useState<`0x${string}` | null>(null);
  const [stakePredictionId, setStakePredictionId] = useState<number | null>(null);
  // The canonical Redis id of the market that was bet on, captured at send time.
  // The bookkeeping below writes under this instead of rebuilding `pred_v2_${n}`,
  // which filed every V3 bet under an archived market's key.
  const [stakeRedisId, setStakeRedisId] = useState<string | null>(null);
  const [stakeAmount, setStakeAmount] = useState<number | null>(null);
  const [stakeToken, setStakeToken] = useState<string | null>(null);
  const [stakeIsYes, setStakeIsYes] = useState<boolean | null>(null);
  
  // AI Analysis Modal State
  const [aiModal, setAiModal] = useState<{
    isOpen: boolean;
    isLoading: boolean;
    analysis: string | null;
    recommendation: 'YES' | 'NO' | 'SKIP' | null;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH' | null;
    aiProbability: { yes: number | null; no: number | null } | null;
    error: string | null;
  }>({
    isOpen: false,
    isLoading: false,
    analysis: null,
    recommendation: null,
    confidence: null,
    aiProbability: null,
    error: null
  });
  
  // Share Preview Modal State
  const [sharePreviewModal, setSharePreviewModal] = useState<{
    isOpen: boolean;
    shareText: string;
    shareUrl: string;
    stakeInfo?: {
      amount: number;
      token: string;
      isYes: boolean;
    };
  }>({
    isOpen: false,
    shareText: '',
    shareUrl: ''
  });
  
  // AI Typing animation state
  const [aiTypingStep, setAiTypingStep] = useState(0);
  
  // Reset typing animation when analysis changes
  useEffect(() => {
    if (aiModal.analysis && aiModal.isOpen) {
      setAiTypingStep(0);
      // Animate through sections: 0=probability, 1=analysis, 2=value, 3=recommendation, 4=risks
      const timers = [
        setTimeout(() => setAiTypingStep(1), 300),
        setTimeout(() => setAiTypingStep(2), 800),
        setTimeout(() => setAiTypingStep(3), 1300),
        setTimeout(() => setAiTypingStep(4), 1800),
        setTimeout(() => setAiTypingStep(5), 2300),
      ];
      return () => timers.forEach(t => clearTimeout(t));
    }
  }, [aiModal.analysis, aiModal.isOpen]);
  
  const { address } = useAccount();
  // The chain the user actually has selected (ChainSwitcher), not the build-time
  // default. handleStakeBet's guard must gate on this, not on DEFAULT_CHAIN_KEY.
  const { chainKey, chain } = useActiveChain();
  // Signs each admin action; the server verifies it rather than trusting the UI.
  const signAdminRequest = useAdminRequest();
  // Every bet and every approval leaves through this. It resolves address, ABI,
  // chain id and collateral from one chainKey, re-checks isWritableMarket at send
  // time, moves the wallet onto the matching chain and pins chainId. The bare
  // useWriteContract below is what the admin and claim paths still use against
  // the archived contracts; it must not be used for a bet.
  const marketWrite = useMarketWrite();
  const { writeContract } = useWriteContract();
  const { composeCast: minikitComposeCast } = useComposeCast();
  const { context } = useMiniKit();
  const { viewCast: minikitViewCast } = useViewCast();
  const minikitOpenUrl = useOpenUrl();
  
  // Universal share function - works on both MiniKit (Base app) and Farcaster SDK (Warpcast)
  const composeCast = useCallback(async (params: { text: string; embeds?: string[] }) => {
    // Try MiniKit first (Base app)
    try {
      if (minikitComposeCast) {
        console.log('📱 Using MiniKit composeCast...');
        // MiniKit expects max 2 embeds as tuple
        const embedsParam = params.embeds?.slice(0, 2) as [] | [string] | [string, string] | undefined;
        await minikitComposeCast({ text: params.text, embeds: embedsParam });
        return;
      }
    } catch (error) {
      console.log('MiniKit composeCast failed, trying Farcaster SDK...', error);
    }
    
    // Fallback to Farcaster SDK (Warpcast and other clients)
    try {
      console.log('📱 Using Farcaster SDK composeCast...');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sdk.actions.composeCast({
        text: params.text,
        embeds: params.embeds?.map(url => ({ url })) as any
      });
    } catch (error) {
      console.error('Both composeCast methods failed:', error);
      throw error;
    }
  }, [minikitComposeCast]);
  
  // Universal viewCast function
  const viewCast = useCallback((params: { hash: string }) => {
    // Try MiniKit first
    try {
      if (minikitViewCast) {
        console.log('📱 Using MiniKit viewCast...');
        minikitViewCast(params);
        return;
      }
    } catch (error) {
      console.log('MiniKit viewCast failed, trying Farcaster SDK...', error);
    }
    
    // Fallback to Farcaster SDK
    try {
      console.log('📱 Using Farcaster SDK viewCast...');
      sdk.actions.viewCast({ hash: params.hash });
    } catch (error) {
      console.error('Both viewCast methods failed:', error);
    }
  }, [minikitViewCast]);
  
  // Universal openUrl function
  const openUrl = useCallback((url: string) => {
    // Try MiniKit first
    try {
      if (minikitOpenUrl) {
        console.log('📱 Using MiniKit openUrl...');
        minikitOpenUrl(url);
        return;
      }
    } catch (error) {
      console.log('MiniKit openUrl failed, trying Farcaster SDK...', error);
    }
    
    // Fallback to Farcaster SDK
    try {
      console.log('📱 Using Farcaster SDK openUrl...');
      sdk.actions.openUrl(url);
    } catch (error) {
      console.error('Both openUrl methods failed:', error);
    }
  }, [minikitOpenUrl]);
  
  // Component to render description with clickable links
  const DescriptionWithLinks = useCallback(({ text }: { text: string }) => {
    // URL regex pattern
    const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
    
    // Split text by URLs
    const parts = text.split(urlPattern);
    
    if (parts.length === 1) {
      // No URLs found
      return <>{text}</>;
    }
    
    return (
      <>
        {parts.map((part, index) => {
          // Check if this part is a URL
          if (part.match(urlPattern)) {
            const castHash = extractCastHash(part);
            
            if (castHash) {
              // This is a Farcaster cast URL - use viewCast
              return (
                <button
                  key={index}
                  onClick={() => {
                    console.log('Opening cast:', castHash);
                    viewCast({ hash: castHash });
                  }}
                  className="inline-flex items-center gap-1 cursor-pointer bg-transparent border-none p-0 hover:scale-105 transition-transform duration-200"
                  style={{ font: 'inherit' }}
                >
                  <GradientText 
                    colors={['#7a9900', '#4d6600', '#7a9900', '#5c7700', '#7a9900']}
                    animationSpeed={3}
                    showBorder={false}
                  >
                    <span className="font-bold text-xs underline decoration-1">
                      🔗 {part.includes('warpcast.com') ? 'View Cast' : 'Open Link'}
                    </span>
                  </GradientText>
                </button>
              );
            } else {
              // Regular URL - use openUrl
              return (
                <button
                  key={index}
                  onClick={() => {
                    console.log('Opening URL:', part);
                    openUrl(part);
                  }}
                  className="inline-flex items-center cursor-pointer bg-transparent border-none p-0 hover:scale-105 transition-transform duration-200"
                  style={{ font: 'inherit' }}
                >
                  <GradientText 
                    colors={['#0066aa', '#004477', '#0066aa', '#005588', '#0066aa']}
                    animationSpeed={3}
                    showBorder={false}
                  >
                    <span className="font-bold text-xs underline decoration-1">
                      🌐 {part.length > 35 ? part.substring(0, 35) + '...' : part}
                    </span>
                  </GradientText>
                </button>
              );
            }
          }
          
          // Regular text
          return <span key={index}>{part}</span>;
        })}
      </>
    );
  }, [viewCast, openUrl]);
  
  // Token prices for USD conversion
  const { formatUsdValue } = useTokenPrices();

  // State for category filtering
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Format large SWIPE numbers to K/M format
  const formatSwipeAmount = (amount: number): string => {
    if (amount >= 1000000) {
      return (amount / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (amount >= 1000) {
      return (amount / 1000).toFixed(0) + 'K';
    }
    return amount.toLocaleString();
  };

  // Wait for stake transaction confirmation
  const { isLoading: isStakeConfirming, isSuccess: isStakeConfirmed, isError: isStakeError } = useWaitForTransactionReceipt({
    hash: stakeTransactionHash || undefined,
  });
  
  // State to track if we've already handled the confirmation
  const [hasHandledConfirmation, setHasHandledConfirmation] = useState(false);
  
  // Handle stake transaction confirmation - this is where we actually move the card
  useEffect(() => {
    if (isStakeConfirmed && stakeTransactionHash && !hasHandledConfirmation) {
      console.log('✅ Transaction confirmed on blockchain!');
      setHasHandledConfirmation(true);
      
      // Now we can safely move to next card and show success
      handleStakeSuccess();
    }
    
    if (isStakeError && stakeTransactionHash && !hasHandledConfirmation) {
      console.log('❌ Transaction failed on blockchain!');
      setHasHandledConfirmation(true);
      
      // Transaction failed after being sent
      handleStakeError({ message: 'Transaction failed on blockchain' });
    }
  }, [isStakeConfirmed, isStakeError, stakeTransactionHash, hasHandledConfirmation]);
  
  // Reset confirmation handler when new transaction starts
  useEffect(() => {
    if (!stakeTransactionHash) {
      setHasHandledConfirmation(false);
    }
  }, [stakeTransactionHash]);
  
  // How much collateral the user holds, on whichever chain is selected. Read
  // against marketWrite.market.collateral rather than a Base USDC literal: USDC
  // and USDG share 6 decimals and differ in address, so a literal reads a
  // nonexistent token on the other chain and reports a confident zero.
  const { data: collateralBalance } = useReadContract({
    address: marketWrite.market?.collateral.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!marketWrite.market }
  });

  // Allowance against the contract that will actually pull the tokens. Reading
  // it against one address while approving another gives a needsApproval that
  // never clears.
  const { data: collateralAllowance, refetch: refetchAllowance } = useReadContract({
    address: marketWrite.market?.collateral.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && marketWrite.market ? [address, marketWrite.market.address] : undefined,
    query: { enabled: !!address && !!marketWrite.market }
  });

  // getFeeConfig() returns (platformFee, creatorFee, earlyExitFee, minBet), all
  // live values. The minimum and the fee are both settable by the owner, and the
  // contract's constructor defaults are not the launch rates, so both are read
  // rather than written down here.
  const { data: feeConfig } = useReadContract({
    address: marketWrite.market?.address,
    abi: marketWrite.market?.abi,
    functionName: 'getFeeConfig',
    query: { enabled: !!marketWrite.market }
  });

  // MIN_BET_FLOOR in PredictionMarket_V3.sol: 100000 units, 0.1 token at 6
  // decimals. Used only until getFeeConfig answers. It is the value minBet can
  // never go below, so a bet the UI accepts on this basis and the contract then
  // rejects is the worst case, and it costs a revert rather than a refusal on a
  // bet that was actually legal.
  const MIN_BET_FLOOR = BigInt(100000);
  const minBetUnits = feeConfig ? (feeConfig as readonly bigint[])[3] : MIN_BET_FLOOR;
  const platformFeeBps = feeConfig ? Number((feeConfig as readonly bigint[])[0]) : 0;
  const creatorFeeBps = feeConfig ? Number((feeConfig as readonly bigint[])[1]) : 0;

  // Labels for the dialog. The symbol is the chain's, never the string 'USDC'.
  const collateralDecimals = marketWrite.market?.collateral.decimals ?? 6;
  const collateralSymbol = marketWrite.market?.collateral.symbol ?? '';
  const minBetDisplay = formatUnits(minBetUnits, collateralDecimals);
  const formattedCollateralBalance = collateralBalance !== undefined
    ? parseFloat(formatUnits(collateralBalance as bigint, collateralDecimals)).toFixed(2)
    : '0.00';

  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const viewProfile = useViewProfile();

  // Użyj props jeśli są dostępne, inaczej wewnętrzny state
  const activeDashboard = propActiveDashboard !== undefined ? propActiveDashboard : internalActiveDashboard;
  const dashboardChangeHandler = onDashboardChange || setInternalActiveDashboard;
  
  // Use hybrid predictions hook
  const { predictions: hybridPredictions, loading: predictionsLoading, error: predictionsError, refresh: refreshPredictions, fetchAllPredictions } = useHybridPredictions();
  
  
  // State for forcing re-render of time display
  const [timeUpdate, setTimeUpdate] = useState(0);
  
  // State for SKIP/NEXT button animation
  const [skipButtonText, setSkipButtonText] = useState<'SKIP' | 'NEXT'>('SKIP');
  
  // Update time display every second for real-time countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeUpdate(prev => prev + 1);
    }, 1000); // Update every second
    
    return () => clearInterval(interval);
  }, []);
  
  // Animate SKIP/NEXT button text
  useEffect(() => {
    const interval = setInterval(() => {
      setSkipButtonText(prev => prev === 'SKIP' ? 'NEXT' : 'SKIP');
    }, 1500); // Change every 1.5 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Fetch all predictions when admin dashboard is active
  useEffect(() => {
    if (activeDashboard === 'admin' && fetchAllPredictions) {
      console.log('🔄 Admin dashboard: fetching ALL predictions...');
      fetchAllPredictions(); // Fetch all predictions for admin dashboard
    }
  }, [activeDashboard]); // Remove fetchAllPredictions from dependencies to prevent re-calls

  // No auto-refresh interval - only refresh on mount and after transactions
  // Auto-refresh was causing unnecessary flickering and API calls


  // Auto-refresh the collateral allowance while the stake dialog is open, so the
  // button flips from "Approve & bet" to "Confirm bet" without a reload.
  useEffect(() => {
    if (stakeModal.isOpen && !isTransactionLoading) {
      // 3s rather than 1s: this is an RPC read per tick, running for as long as
      // the modal sits open. An approval takes seconds to land and nobody
      // perceives the difference, so this is two thirds fewer calls for free.
      const interval = setInterval(async () => {
        if (refetchAllowance) {
          await refetchAllowance();
        }
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [stakeModal.isOpen, isTransactionLoading, refetchAllowance]);

  // Expose refresh function to parent component via ref
  useImperativeHandle(ref, () => ({
    refresh: refreshPredictions
  }), []); // Remove dependency to prevent re-creation

  // Global error handler for network/fetch errors
  useEffect(() => {
    const handleUnhandledError = (event: ErrorEvent) => {
      // Filtruj tylko fetch/network errors
      if (event.message.includes('fetch') || event.message.includes('network') ||
          event.message.includes('CORS') || event.message.includes('Failed to fetch')) {
        // Network error intercepted
        // Możesz tutaj dodać dodatkową logikę obsługi błędów
        event.preventDefault(); // Zapobiega domyślnemu logowaniu błędu
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason && typeof event.reason === 'object' &&
          'message' in event.reason &&
          (event.reason.message.includes('fetch') ||
           event.reason.message.includes('network') ||
           event.reason.message.includes('CORS'))) {
        // Unhandled promise rejection (network)
        event.preventDefault();
      }
    };

    window.addEventListener('error', handleUnhandledError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleUnhandledError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);



  // Transform hybrid predictions to match the expected format (memoized).
  //
  // The id used to be stripped by hand: `id.includes('v2')` then a replace, and
  // `|| Date.now()` when the parse failed. A `pred_v3_2` id took the else branch,
  // parseInt('v3_2') is NaN, and the fallback handed a millisecond timestamp on
  // as a market number. That number then reached placeBet. marketNumber returns
  // null instead of guessing, and a record it cannot read is dropped here rather
  // than rendered with a substitute.
  const transformedPredictions = useMemo(() => (hybridPredictions || [])
    .filter((pred) => marketNumber(pred.id) !== null)
    .map((pred) => ({
    id: marketNumber(pred.id) as number,
    // Canonical, never rebuilt by hand. Empty means "unknown", which the bet
    // path treats as a refusal rather than a prefix to guess at.
    redisId: parseMarketId(pred.id)?.redisId ?? '',
    question: pred.question,
    category: pred.category,
    yesTotalAmount: pred.yesTotalAmount,
    noTotalAmount: pred.noTotalAmount,
    swipeYesTotalAmount: pred.swipeYesTotalAmount,
    swipeNoTotalAmount: pred.swipeNoTotalAmount,
    usdcYesTotalAmount: pred.usdcYesTotalAmount || 0,
    usdcNoTotalAmount: pred.usdcNoTotalAmount || 0,
    deadline: pred.deadline,
    resolved: pred.resolved,
    outcome: pred.outcome || false,
    cancelled: pred.cancelled,
    participants: Array.isArray(pred.participants) ? pred.participants.length : 0,
    userYesStake: 0, // Will be updated when user stakes are fetched
    userNoStake: 0,  // Will be updated when user stakes are fetched
    potentialPayout: 0, // Will be calculated
    potentialProfit: 0, // Will be calculated
    needsApproval: pred.needsApproval,
    approvalCount: 0, // Will be updated when approval system is implemented
    requiredApprovals: 2,
    description: pred.description,
    creator: pred.creator,
    createdAt: pred.deadline - (24 * 60 * 60), // Approximate creation time
    /**
     * When the market really opened, or undefined when the record does not say.
     *
     * `createdAt` above is invented: deadline minus a day, regardless of the
     * market's actual window. Harmless where it is used, which is a V1 cutoff
     * comparison, and wrong for anything that measures how far through its life
     * a market is. The time weighting is exactly that, so it reads this instead
     * and shows nothing rather than a multiplier derived from a guess.
     */
    openedAt: typeof pred.createdAt === 'number' && pred.createdAt > 0 ? pred.createdAt : undefined,
    /** The collateral market's own backer count. `participants` is the V2 array. */
    usdcParticipantCount: (pred as { usdcParticipantCount?: number }).usdcParticipantCount ?? 0,
    hasUserApproved: false, // Will be updated when approval system is implemented
    isRejected: false,
    rejectionReason: "",
    resolutionDeadline: pred.deadline + (10 * 24 * 60 * 60), // 10 days after deadline
    imageUrl: pred.imageUrl,
    verified: pred.verified,
    approved: !pred.needsApproval,
    includeChart: pred.includeChart,
    selectedCrypto: pred.selectedCrypto
  })), [hybridPredictions]);

  // A preview, and only that. It is the plain parimutuel split: your stake back
  // plus your share of the losing pool after the platform and creator fees. V3
  // additionally weights the share of the losing pool by how early the bet was
  // placed (weightBpsAt), which is not modelled here, so a late bet's real payout
  // is lower than this and an early one's is higher. The dialog labels it EST.
  //
  // Pools are the collateral pools at the collateral's own decimals, not the
  // archived ETH and SWIPE pools divided by 1e18.
  const potentialEarnings = useMemo(() => {
    const amount = parseFloat(stakeModal.stakeAmount);
    if (!amount || amount <= 0) return null;
    if (!marketWrite.market) return null;

    // Keyed off the market the dialog is actually betting on. It used to read
    // transformedPredictions[currentIndex], which is a different list from the
    // sorted, filtered one the card came from.
    const currentPred = transformedPredictions.find(p => p.id === stakeModal.predictionId);
    if (!currentPred) return null;

    const unit = Math.pow(10, marketWrite.market.collateral.decimals);
    const yesPool = (currentPred.usdcYesTotalAmount || 0) / unit;
    const noPool = (currentPred.usdcNoTotalAmount || 0) / unit;

    // Live rates from getFeeConfig, in basis points. Both come off the losing
    // pool before winners split it, so both belong in the preview.
    const feeRate = (platformFeeBps + creatorFeeBps) / 10000;
    const winningPool = stakeModal.isYes ? yesPool : noPool;
    const losingPool = stakeModal.isYes ? noPool : yesPool;
    const winningPoolAfter = winningPool + amount;
    const netLosingPool = losingPool * (1 - feeRate);

    const payout = amount + (winningPoolAfter > 0 ? (amount / winningPoolAfter) * netLosingPool : 0);
    const profit = payout - amount;
    const profitPercent = amount > 0 ? (profit / amount) * 100 : 0;
    const sharePercent = winningPoolAfter > 0 ? (amount / winningPoolAfter) * 100 : 0;
    const totalPoolAfter = winningPoolAfter + losingPool;

    return {
      token: marketWrite.market.collateral.symbol,
      amount,
      payout,
      profit,
      profitPercent,
      sharePercent,
      totalPoolAfter,
      feeRate,
      yesPool,
      noPool,
    };
  }, [
    stakeModal.stakeAmount,
    stakeModal.isYes,
    stakeModal.predictionId,
    transformedPredictions,
    marketWrite.market,
    platformFeeBps,
    creatorFeeBps,
  ]);
  
  // Transform real predictions to match TinderCard format (memoized for performance)
  const realCardItems: PredictionData[] = useMemo(() => transformedPredictions.map((pred) => {
    // The live market's pools, at the collateral's decimals. These used to be the
    // archived ETH pools divided by 1e18, which read zero for every V3 market and
    // pinned every card at a flat 50/50.
    const collateralUnit = Math.pow(10, marketWrite.market?.collateral.decimals ?? 6);
    const collateralSymbol = marketWrite.market?.collateral.symbol ?? '';
    const totalYesAmount = pred.usdcYesTotalAmount || 0;
    const totalNoAmount = pred.usdcNoTotalAmount || 0;
    const totalPool = totalYesAmount + totalNoAmount;
    const votingYes = totalPool > 0 ? Math.floor((totalYesAmount / totalPool) * 100) : 50;

    return {
      // Already a number by the time it reaches here: transformedPredictions
      // resolved it through marketNumber and dropped anything unreadable.
      id: pred.id,
      redisId: pred.redisId,
      title: (pred.question || 'Unknown prediction').length > 50 ? (pred.question || 'Unknown prediction').substring(0, 50) + '...' : (pred.question || 'Unknown prediction'),
      image: pred.imageUrl || (() => {
            // Fixed images for each category
            const category = pred.category?.toLowerCase() || 'default';
            
            const categoryImages = {
              sports: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop", // Sports
              crypto: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop", // Crypto
              politics: "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=400&h=300&fit=crop", // Politics
              technology: "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=400&h=300&fit=crop", // Technology
              entertainment: "https://images.unsplash.com/photo-1489599808000-1a0b0b0b0b0b?w=400&h=300&fit=crop", // Entertainment
              default: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop" // Default
            };
            
            return categoryImages[category as keyof typeof categoryImages] || categoryImages.default;
          })(),
      prediction: pred.question || 'Unknown prediction',
      timeframe: pred.deadline ? formatTimeLeft(pred.deadline) : 'Unknown',
      confidence: totalPool > 0 ? Math.round((totalYesAmount / totalPool) * 100) : 50,
      category: pred.category || 'Unknown',
      price: totalPool > 0
        ? `${(totalPool / collateralUnit).toFixed(2)} ${collateralSymbol}`.trim()
        : `0.00 ${collateralSymbol}`.trim(),
      change: (() => {
        if (totalPool === 0) return "0%"; // No bets yet
        // Which side the money is on, as a signed swing off an even split. The
        // old string claimed a flat "99% profit after a 1% fee" on whichever side
        // had any stake at all, which was never a real number.
        const yesPercent = (totalYesAmount / totalPool) * 100;
        const swing = yesPercent - 50;
        return `${swing >= 0 ? '+' : ''}${swing.toFixed(1)}%`;
      })(),
      description: pred.description || 'No description available',
      isChart: pred.includeChart || false,
      votingYes: votingYes,
      creator: pred.creator,
      // Matched on the canonical Redis id, not on a number both generations share.
      participants: hybridPredictions.find(hp => parseMarketId(hp.id)?.redisId === pred.redisId)?.participants || []
    };
  }), [transformedPredictions, hybridPredictions, marketWrite.market]);


  // Open stake modal after swipe
  const openStakeModal = useCallback((direction: string, predictionId: number) => {
    const isYes = direction === 'right';
    // Opening stake modal

    // Find the prediction data for sharing later
    const prediction = realCardItems.find(p => p.id === predictionId);
    if (prediction) {
      setLastStakedPrediction(prediction);
    }

    // The card carries the Redis id it came from. Passing it through means the
    // send can re-parse the market instead of trusting a bare number that two
    // contract generations both answer to.
    setStakeModal({
      isOpen: true,
      predictionId,
      redisId: prediction?.redisId ?? '',
      isYes,
      stakeAmount: '1'
    });
  }, [realCardItems]);


  // Use real predictions from Redis - filter only active predictions
  const cardItems = useMemo(() => {
    const allItems = realCardItems.length > 0 ? realCardItems : (items && items.length ? items : []);

    /**
     * Only markets somebody can actually bet on.
     *
     * Matched by id, not by array position. This read
     * transformedPredictions[index] while the category filter immediately below
     * matched on item.id, and the two arrays are not guaranteed to line up:
     * allItems falls back to the `items` prop when realCardItems is empty, and
     * that prop has its own ordering. When they drift, every check here is
     * asking about somebody else's market, so a card can pass the "is it
     * approved" test on a different market's answer.
     *
     * The approval check is what keeps an unregistered proposal out of the deck.
     * A proposal is a Redis record with no market behind it, so a bet on one
     * reverts with "Prediction not registered" after the user has already
     * approved the token and signed.
     */
    const now = Date.now() / 1000;
    let activeItems = allItems.filter((item) => {
      const prediction = transformedPredictions.find((p) => p.id === item.id);
      if (!prediction) return false;

      return (
        prediction.deadline > now &&
        !prediction.resolved &&
        !prediction.cancelled &&
        !prediction.needsApproval
      );
    });

    // Apply category filter if not 'all'
    if (selectedCategory !== 'all') {
      activeItems = activeItems.filter(item => {
        const prediction = transformedPredictions.find(p => p.id === item.id);
        return prediction?.category?.toLowerCase() === selectedCategory.toLowerCase();
      });
    }

    // Sort active items by deadline (closest deadline first), then by ID as tiebreaker
    const sortedItems = activeItems.sort((a, b) => {
      // Find corresponding predictions for sorting
      const predictionA = transformedPredictions.find(p => p.id === a.id);
      const predictionB = transformedPredictions.find(p => p.id === b.id);

      // Sort by deadline (closest first)
      const deadlineA = predictionA?.deadline || 0;
      const deadlineB = predictionB?.deadline || 0;

      if (deadlineA !== deadlineB) {
        return deadlineA - deadlineB; // Closest deadline first
      }

      // If deadlines are equal, sort by ID
      return a.id - b.id;
    });

    // Log only when the actual data changes, not every second
    if (sortedItems.length > 0) {
      console.log(`📊 Total predictions: ${allItems.length}, Active predictions: ${activeItems.length}, Filtered: ${sortedItems.length} (${selectedCategory !== 'all' ? `Category: ${selectedCategory}` : 'All categories'})`);
      console.log(`📊 Card order:`, sortedItems.map(item => `ID:${item.id}`));
    }
    return sortedItems;
  }, [realCardItems, items, transformedPredictions, selectedCategory]);

  // Reset currentIndex when cardItems change (new data loaded)
  useEffect(() => {
    setCurrentIndex(0);
  }, [cardItems.length]); // Reset when number of cards changes

  // Handle navigation to specific prediction from URL parameter
  useEffect(() => {
    if (!initialPredictionId || cardItems.length === 0 || !hybridPredictions) return;
    
    console.log('🎯 Looking for prediction:', initialPredictionId);
    
    // Find the index of the prediction with matching ID
    const targetIndex = cardItems.findIndex((card, idx) => {
      // Matched on the canonical Redis id the card came from. The old hand parse
      // fell back to 0 here, so every unreadable record collided on market 0.
      const originalPred = card.redisId
        ? hybridPredictions.find(hp => parseMarketId(hp.id)?.redisId === card.redisId)
        : undefined;

      // Check if the original prediction ID matches
      if (originalPred) {
        const matches = originalPred.id === initialPredictionId || 
                       String(originalPred.id) === initialPredictionId;
        if (matches) {
          console.log('✅ Found matching prediction at index:', idx, 'id:', originalPred.id);
        }
        return matches;
      }
      return false;
    });
    
    if (targetIndex !== -1) {
      console.log('🎯 Navigating to prediction at index:', targetIndex);
      setCurrentIndex(targetIndex);
    } else {
      console.log('⚠️ Prediction not found in active cards:', initialPredictionId);
    }
    
    // Mark as handled
    if (onInitialPredictionHandled) {
      onInitialPredictionHandled();
    }
  }, [initialPredictionId, cardItems, hybridPredictions, onInitialPredictionHandled]);

  // Auto-sync after stake transaction confirmation
  useEffect(() => {
    if (isStakeConfirmed && stakeTransactionHash && stakePredictionId !== null && stakeRedisId && stakeAmount && stakeToken && stakeIsYes !== null) {
      const handleStakeAutoSync = async () => {
        console.log('⏳ Waiting for blockchain propagation after stake...');
        // Wait for blockchain propagation (same as create prediction)
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Find prediction data for transaction history
        const prediction = cardItems.find(card => card.id === stakePredictionId);
        const predictionQuestion = prediction?.title || `Prediction ${stakePredictionId}`;

        // Save transaction to user history
        try {
          console.log('💾 Saving stake transaction to user history...');
          // Raw collateral units, at the collateral's own decimals. It used to
          // multiply by 1e18 regardless, so a 5 USDC bet was recorded as five
          // million million USDC.
          const decimals = marketWrite.market?.collateral.decimals ?? 6;
          const amountInUnits = stakeAmount ? Math.round(stakeAmount * Math.pow(10, decimals)) : 0;
          const transactionData = {
            id: generateTransactionId(),
            type: 'stake' as const,
            // The market that was actually bet on, not a rebuilt v2 prefix.
            predictionId: stakeRedisId,
            predictionQuestion,
            amount: amountInUnits,
            tokenType: stakeToken,
            txHash: stakeTransactionHash,
            // The explorer of the chain the transaction was signed on. This is
            // stored, not derived at render, so a basescan link written for a
            // Robinhood transaction is wrong permanently.
            basescanUrl: txUrl(chainKey, stakeTransactionHash),
            timestamp: Date.now(),
            status: 'success' as const
          };

          const saveResponse = await fetch('/api/user-transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: address?.toLowerCase(),
              transaction: transactionData
            })
          });
          
          if (saveResponse.ok) {
            console.log('✅ Stake transaction saved to user history');
          } else {
            console.warn('⚠️ Failed to save stake transaction to history');
          }
        } catch (error) {
          console.error('❌ Failed to save stake transaction:', error);
        }
        
        console.log('🔄 Auto-syncing prediction after stake...');
        console.log('⏳ Waiting 3 seconds for blockchain propagation...');
        
        // Wait for blockchain to propagate the new participant
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Retry logic with better error handling
        let syncAttempts = 0;
        const maxSyncAttempts = 3;
        
        const attemptSync = async (): Promise<boolean> => {
          syncAttempts++;
          console.log(`🔄 Auto-sync attempt ${syncAttempts}/${maxSyncAttempts}...`);
          
          try {
            // /api/sync/usdc resolves the market through getMarketContract, so
            // it reads the same contract the bet was sent to. The old call went
            // to /api/blockchain/events, which hardcodes CONTRACTS.V2 and reads
            // userStakes/userSwipeStakes: against a V3 market number that reads
            // an archived contract and writes the answer back as truth.
            const syncResponse = await fetch('/api/sync/usdc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chain: chainKey, predictionIds: [stakeRedisId] })
            });

            if (syncResponse.ok) {
              const result = await syncResponse.json();
              console.log('✅ Prediction auto-synced after stake:', result);
              
              // Refresh data immediately to show new participant
              if (refreshPredictions) {
                console.log('🔄 Refreshing predictions to show new participant...');
                refreshPredictions();
              }
              
              // Refresh again after 2 seconds to ensure blockchain data is synced
              setTimeout(() => {
                if (refreshPredictions) {
                  console.log('🔄 Second refresh to ensure sync...');
                  refreshPredictions();
                }
              }, 2000);
              
              return true;
            } else {
              const errorData = await syncResponse.json();
              console.error(`⚠️ Auto-sync failed (attempt ${syncAttempts}):`, errorData);
              return false;
            }
          } catch (error) {
            console.error(`❌ Auto-sync error (attempt ${syncAttempts}):`, error);
            return false;
          }
        };
        
        // Try sync with retries
        let syncSuccess = await attemptSync();
        
        while (!syncSuccess && syncAttempts < maxSyncAttempts) {
          console.log(`⏳ Retrying auto-sync in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          syncSuccess = await attemptSync();
        }
        
        if (!syncSuccess) {
          console.error('❌ Auto-sync failed after all attempts - manual sync may be needed');
          // Show notification to user
          showNotification(
            'warning',
            'Sync Delayed',
            'Your stake is confirmed but display may be delayed. Refresh the page if needed.'
          );
        }
        
        // Reset transaction tracking
        setStakeTransactionHash(null);
        setStakePredictionId(null);
        setStakeRedisId(null);
        setStakeAmount(null);
        setStakeToken(null);
        setStakeIsYes(null);
      };

      handleStakeAutoSync();
    }
  }, [isStakeConfirmed, stakeTransactionHash, stakePredictionId, stakeRedisId, stakeAmount, stakeToken, stakeIsYes, address, cardItems, refreshPredictions, chainKey, marketWrite.market]);

  // Dashboard handlers

  /** Sends one bet. Returns true only when a transaction actually left. */
  const handleStakeBet = async (redisId: string, isYes: boolean, amount: number): Promise<boolean> => {
    const market = marketWrite.market;
    // The address this function is about to write to, named once. Everything
    // below, the guard and the send alike, goes through this one value, so the
    // check and the transaction cannot drift apart.
    const target = market?.address ?? null;

    // Refuse unless `target` *is* the market of the chain the user actually has
    // selected (not the build-time default). Both halves matter and the address
    // half is the one that protects the money: gating on the chain alone would
    // let a stake leave for a Base address while Robinhood is selected, an
    // address with no contract behind it, where the tokens are simply gone.
    //
    // useMarketWrite re-checks this at send time as well, because the network
    // switcher can move under an open dialog. This copy is the one that keeps
    // the refusal quiet and legible instead of throwing out of the wallet.
    if (!marketWrite.ready || !market || !isWritableMarket(chainKey, target)) {
      console.warn(`[swipe-bet] refused: ${target} is not ${chainKey}'s market contract.`);
      alert(
        marketWrite.wrongNetwork
          ? 'Your wallet is on a different network. Switch it to place this bet.'
          : 'This network has no Swipe market yet. Switch networks to place a bet.'
      );
      return false;
    }

    // The market number comes from parsing the Redis id, never from stripping a
    // prefix by hand. Null means "I do not know which market this is", and that
    // refuses the bet: the old code answered NaN here and then fell back to
    // Date.now(), handing a fabricated market number to the contract.
    const ref = parseMarketId(redisId);
    if (!ref) {
      console.warn(`[swipe-bet] refused: cannot read a market number from "${redisId}".`);
      alert('Cannot identify this market. Refresh and try again.');
      return false;
    }
    const predictionId = ref.numericId;

    const { decimals, symbol } = market.collateral;
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter an amount to bet.');
      return false;
    }
    // 6 decimals for USDC and USDG, not 18. toFixed keeps this a plain decimal
    // string: String(1e-7) is "1e-7", which parseUnits rejects, and the dialog
    // accepts free text.
    const amountInCollateral = parseUnits(amount.toFixed(decimals), decimals);

    // The contract's own floor, read live from getFeeConfig. There is no maximum
    // in V3, so there is no maximum here either.
    if (amountInCollateral < minBetUnits) {
      alert(`Minimum bet is ${formatUnits(minBetUnits, decimals)} ${symbol}`);
      return false;
    }

    if (collateralBalance !== undefined && amountInCollateral > (collateralBalance as bigint)) {
      alert(`Not enough ${symbol}. You have ${formatUnits(collateralBalance as bigint, decimals)}.`);
      return false;
    }

    // Check if user is trying to bet on their own prediction
    const currentPrediction = cardItems.find(card => card.redisId === ref.redisId);
    if (currentPrediction && address && currentPrediction.creator && currentPrediction.creator.toLowerCase() === address.toLowerCase()) {
      alert('❌ You cannot bet on your own prediction!');
      return false;
    }

    // V3 is collateralised in an ERC-20 and has no payable function at all, so
    // there is no `value:` here and no ETH branch. placeStake and
    // placeStakeWithToken do not exist on this contract.
    try {
      const tx = await marketWrite.write({
        functionName: 'placeBet',
        args: [BigInt(predictionId), isYes, amountInCollateral],
      });
      console.log('📤 Bet transaction sent:', tx);
      showNotification('info', 'Transaction Sent', 'Waiting for blockchain confirmation...');

      // Set transaction hash for tracking - card will move after confirmation in useEffect
      setStakeTransactionHash(tx);
      setStakePredictionId(predictionId);
      setStakeRedisId(ref.redisId);
      setStakeAmount(amount);
      setStakeToken(symbol);
      setStakeIsYes(isYes);

      // Keep modal open with loading state until confirmation
      // Card movement and modal close will happen in useEffect when isStakeConfirmed becomes true
      return true;
    } catch (error) {
      handleStakeError(error);
      return false;
    }
  };

  // Helper function for stake success
  const handleStakeSuccess = async () => {
    // Close modal and reset loading state
    setStakeModal(prev => ({ ...prev, isOpen: false }));
    setIsTransactionLoading(false);

    // The stake has genuinely landed on-chain at this point, because this only
    // runs once useWaitForTransactionReceipt confirms the transaction. This is
    // the one place "Stake Accepted" is actually true; onSwipe only reports that
    // a side was selected (see its own lastAction, status: 'selected').
    if (stakePredictionId !== null && stakeIsYes !== null) {
      setLastAction({
        type: 'bet',
        status: 'confirmed',
        predictionId: stakePredictionId,
        direction: stakeIsYes ? 'right' : 'left',
        timestamp: Date.now()
      });
      setShowActionFeedback(true);
      setTimeout(() => {
        setShowActionFeedback(false);
      }, 3000);
    }

    // Cache user's Farcaster profile to Redis (reduces Neynar API calls)
    if (address && context?.user) {
      try {
        console.log('💾 Caching user Farcaster profile to Redis...');
        fetch('/api/farcaster/cache-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: address,
            profile: context.user
          })
        }).catch(err => console.warn('Profile cache failed:', err));
      } catch (error) {
        console.warn('Failed to cache user profile:', error);
      }
    }
    
    // Move to next card after successful stake
    console.log('✅ Stake successful, moving to next card...');
    setCurrentIndex(prev => {
      const next = prev + 1;
      // Reset to first card when reaching the end, or stay on last if only one card
      return cardItems.length <= 1 ? 0 : (next >= cardItems.length ? 0 : next);
    });
    
    // Refresh predictions immediately after stake for live data
    console.log('🔄 Refreshing predictions for live data...');
    
    // First, quick refresh from Redis
    if (refreshPredictions) {
      refreshPredictions();
    }
    
    // Then sync this market's pools from the contract that was bet on.
    // /api/sync/v2/active-stakes walked the archived V2 pool, so after a V3 bet
    // it refreshed four dead markets and never the one the money went into.
    if (stakeRedisId) {
      try {
        console.log('🔄 Syncing this market from the chain after bet...');
        const syncResponse = await fetch('/api/sync/usdc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chain: chainKey, predictionIds: [stakeRedisId] })
        });

        if (syncResponse.ok) {
          console.log(`✅ Synced pools for ${stakeRedisId} after bet`);
          // Refresh again after sync to show updated data
          setTimeout(() => {
            if (refreshPredictions) {
              refreshPredictions();
            }
          }, 1000);
        }
      } catch (error) {
        console.error('Failed to sync market pools after bet:', error);
      }
    }
    
    // Send Farcaster notification about successful stake
    try {
      const userFid = await getUserFid();
      if (userFid && lastStakedPrediction && stakeAmount !== null && stakeToken && stakeIsYes !== null) {
        const stakeAmountStr = stakeAmount.toString();
        const outcome = stakeIsYes ? 'YES' : 'NO';
        
        await notifyStakeSuccess(
          userFid,
          lastStakedPrediction.title,
          stakeAmountStr,
          outcome,
          stakeToken
        );
      }
    } catch (error) {
      console.error('Failed to send stake success notification:', error);
    }
    
    // Save stake data for sharing BEFORE auto-sync resets the values
    if (stakeAmount !== null && stakeToken && stakeIsYes !== null) {
      setShareStakeData({
        amount: stakeAmount,
        token: stakeToken,
        isYes: stakeIsYes
      });
    }
    
    // Show share option after successful stake
    setTimeout(() => {
      setShowSharePrompt(true);
    }, 2000); // Show share prompt 2 seconds after success
  };

  // Helper function to get user's FID
  const getUserFid = async (): Promise<number | null> => {
    try {
      console.log('Getting user FID, context:', context);
      
      // Try user.fid first (newer MiniKit versions)
      if (context?.user?.fid) {
        const fid = context.user.fid;
        console.log('Found FID in user:', fid);
        return fid;
      }
      // Fallback to client.fid (older versions)
      else if (context?.client && 'fid' in context.client) {
        const fid = (context.client as any).fid;
        console.log('Found FID in client:', fid);
        return fid;
      }
      
      console.log('No FID found in context');
      return null;
    } catch (error) {
      console.error('Error getting user FID:', error);
      return null;
    }
  };

  // Function to analyze prediction with AI
  const analyzeWithAI = async () => {
    if (!currentCard || currentCard.id === 0) return;
    
    // Find the current prediction data
    const currentPrediction = transformedPredictions[currentIndex];
    if (!currentPrediction) return;
    
    // Open modal and start loading
    setAiModal({
      isOpen: true,
      isLoading: true,
      analysis: null,
      recommendation: null,
      confidence: null,
      aiProbability: null,
      error: null
    });
    
    try {
      // Calculate pool data
      const yesETH = (currentPrediction.yesTotalAmount || 0) / 1e18;
      const noETH = (currentPrediction.noTotalAmount || 0) / 1e18;
      const totalETH = yesETH + noETH;
      const yesSWIPE = (currentPrediction.swipeYesTotalAmount || 0) / 1e18;
      const noSWIPE = (currentPrediction.swipeNoTotalAmount || 0) / 1e18;
      const totalSWIPE = yesSWIPE + noSWIPE;
      
      const yesPercentage = totalETH > 0 ? (yesETH / totalETH) * 100 : 50;
      const noPercentage = totalETH > 0 ? (noETH / totalETH) * 100 : 50;
      
      const response = await fetch('/api/ai-assistant/analyze-prediction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          predictionId: currentPrediction.id,
          question: currentCard.prediction,
          description: currentCard.description,
          category: currentCard.category,
          yesPercentage,
          noPercentage,
          totalPoolETH: totalETH,
          totalPoolSWIPE: totalSWIPE,
          participantsCount: currentCardParticipants.length,
          deadline: currentPrediction.deadline,
          selectedCrypto: currentPrediction.selectedCrypto
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setAiModal(prev => ({
          ...prev,
          isLoading: false,
          analysis: data.analysis,
          recommendation: data.recommendation,
          confidence: data.confidence,
          aiProbability: data.aiProbability
        }));
      } else {
        setAiModal(prev => ({
          ...prev,
          isLoading: false,
          error: data.error || 'Failed to analyze prediction'
        }));
      }
    } catch (error) {
      console.error('AI Analysis error:', error);
      setAiModal(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to connect to AI service'
      }));
    }
  };

  // The Redis id behind a card, for building a share link.
  //
  // Returns null when no record matches. The old version fell back to
  // `pred_v2_${numericId}`, which produced a link to an archived market that
  // shares the number, so a shared V3 bet pointed at somebody else's market.
  const getPredictionIdForShare = useCallback((numericId: number): string | null => {
    const card = realCardItems.find(item => item.id === numericId);
    if (card?.redisId) return card.redisId;

    const originalPred = hybridPredictions?.find(hp => marketNumber(hp.id) === numericId);
    return parseMarketId(originalPred?.id)?.redisId ?? null;
  }, [hybridPredictions, realCardItems]);

  // Function to share prediction after stake
  // Function to open share preview modal after staking
  const shareStakedPrediction = (type: 'achievement' | 'challenge' | 'prediction' = 'achievement') => {
    // Use shareStakeData instead of stakeAmount/stakeToken (which may have been reset by auto-sync)
    if (!lastStakedPrediction || !shareStakeData) {
      console.log('Cannot share - missing data:', { lastStakedPrediction: !!lastStakedPrediction, shareStakeData });
      return;
    }
    
      // Use full prediction text (not truncated title)
      const fullPredictionText = lastStakedPrediction.prediction;
    
    // Get unique prediction URL for sharing - will show custom OG image.
    // Null means no record matched, and a link built on a guessed id points at
    // whatever market happens to carry that number, so there is nothing to share.
    const predictionId = lastStakedPrediction.redisId ?? getPredictionIdForShare(lastStakedPrediction.id);
    if (!predictionId) {
      console.warn('Cannot share: no canonical id for this market');
      return;
    }
    const predictionUrl = `${window.location.origin}/prediction/${predictionId}`;

    // Two decimals, the way the collateral is quoted.
    const formattedAmount = shareStakeData.amount.toFixed(2);

    // Build share text with random variants from share-texts.ts
    const { text: shareText } = buildStakeShareText(
      fullPredictionText,
      formattedAmount,
      shareStakeData.token,
      predictionUrl
    );
    
    // Close the share prompt and open preview modal
    setShowSharePrompt(false);
    
    // Open share preview modal with stake info
    setSharePreviewModal({
      isOpen: true,
      shareText,
      shareUrl: predictionUrl,
      stakeInfo: {
        amount: shareStakeData.amount,
        token: shareStakeData.token,
        isYes: shareStakeData.isYes
      }
    });
  };
  
  // Function to handle share modal close and cleanup
  const handleShareModalClose = () => {
    setSharePreviewModal(prev => ({ ...prev, isOpen: false }));
    // Clear stake data after modal is closed
    if (sharePreviewModal.stakeInfo) {
      setShareStakeData(null);
    }
  };

  // Legacy function kept for notification sending (called after successful share)
  const sendShareNotification = async (type: 'achievement' | 'challenge' | 'prediction' = 'achievement') => {
    if (!lastStakedPrediction) return;
    
      try {
        console.log('Attempting to send Farcaster notification...');
        const userFid = await getUserFid();
        console.log('User FID for notification:', userFid);
        
        if (userFid) {
          const shareTypeNames = {
            'achievement': 'achievement',
            'challenge': 'challenge', 
            'prediction': 'prediction'
          };
          
          console.log('Sending notification for FID:', userFid, 'type:', type);
          const result = await notifyPredictionShared(
            userFid, 
            lastStakedPrediction.title, 
            shareTypeNames[type] || 'prediction'
          );
          console.log('Notification result:', result);
        } else {
          console.log('No FID available, skipping notification');
        }
      } catch (error) {
        console.error('Failed to send Farcaster notification:', error);
        // Don't show error to user, just log it
    }
  };

  // Helper function for stake error
  const handleStakeError = (error: any) => {
    console.error('❌ Stake transaction failed:', error);

    let errorMessage = 'Failed to place stake. Please try again.';

    if (error?.message?.includes('insufficient funds')) {
      errorMessage = '❌ Insufficient funds for this transaction.';
    } else if (error?.message?.includes('gas')) {
      errorMessage = '❌ Gas estimation failed. Please try again.';
    } else if (error?.message?.includes('execution reverted')) {
      errorMessage = '❌ Transaction reverted by contract.';
    } else if (error?.message?.includes('allowance')) {
      errorMessage = '❌ Insufficient SWIPE allowance. Please approve first.';
    } else if (error?.message?.includes('rejected') || error?.message?.includes('denied') || error?.message?.includes('cancelled') || error?.message?.includes('User rejected')) {
      errorMessage = '❌ Transaction cancelled by user.';
    }

    showNotification('error', 'Stake Failed', errorMessage);
    
    // Close the stake modal and reset loading state
    setStakeModal(prev => ({ ...prev, isOpen: false }));
    setIsTransactionLoading(false);
    
    // Restore the card back to its position since transaction failed
    setTimeout(async () => {
      if (tinderCardRef.current) {
        try {
          console.log('🔄 Restoring card after stake error...');
          await tinderCardRef.current.restoreCard();
          console.log('✅ Card restored successfully after error');
        } catch (restoreError) {
          console.error('Failed to restore card:', restoreError);
        }
      }
    }, 100);
  };

  /**
   * Refuses a write to a contract that is not the selected chain's live market.
   *
   * Every admin and approver call below reaches for CONTRACTS.V2, an archived
   * Base deployment whose owner key is gone. None of them can succeed: resolve,
   * cancel, approve, reject, withdraw and pause are all owner-only there and
   * nobody can sign as the owner any more. None of them pinned a chainId
   * either, so with another network selected the call left for a Base address
   * on a chain where that address holds no code, which does not revert. The
   * wallet reports success and nothing happened.
   *
   * So the guard compares the address about to be written to against the market
   * of the chain the user actually has selected. An archived address is never
   * that, which is the point: these refuse, quietly and legibly, instead of
   * costing a signature to discover.
   */
  const refuseArchivedWrite = (target: string, action: string): boolean => {
    if (isWritableMarket(chainKey, target)) return false;
    console.warn(`[admin] refused ${action}: ${target} is not ${chainKey}'s market contract.`);
    alert(
      `Cannot ${action} here. That contract is archived, nobody holds the key ` +
      'that could sign for it, and it is not the market this network writes to.'
    );
    return true;
  };

  const handleClaimReward = (predictionId: number, token: 'ETH' | 'SWIPE' = 'ETH') => {
    // Determine which contract to use based on prediction creation date
    const prediction = transformedPredictions.find(p => p.id === predictionId);
    const isV1 = prediction && prediction.createdAt < new Date('2024-01-15').getTime() / 1000;
    const contract = isV1 ? CONTRACTS.V1 : CONTRACTS.V2;

    // Claiming is the one thing the archived contracts still do, so this path
    // is not refused the way the admin calls below are. The lost owner key
    // stops a market being resolved; it does not stop a market that resolved
    // before the key went from paying out, and refusing here would strand
    // money that is genuinely owed.
    //
    // What it must not do is leave for the wrong network. Both sends below are
    // pinned to ARCHIVED_CHAIN_ID so viem asserts the wallet is there rather
    // than signing wherever it happens to be, and the app refuses outright when
    // it is pointed at another chain.
    if (chainKey !== ARCHIVED_CHAIN_KEY) {
      alert(
        `These rewards sit on ${ARCHIVED_CHAIN_LABEL} contracts. Switch the app to ` +
        `${ARCHIVED_CHAIN_LABEL} to claim them.`
      );
      return;
    }

    // Execute claim transaction based on token type
    if (token === 'ETH' || isV1) {
      // ETH claiming or V1 (ETH only)
      writeContract({
        address: contract.address as `0x${string}`,
        abi: contract.abi,
        functionName: 'claimReward',
        args: [BigInt(predictionId)],
        chainId: ARCHIVED_CHAIN_ID,
      }, {
        onSuccess: () => {
          console.log('✅ ETH reward claimed successfully');
          showNotification('success', 'Reward Claimed!', `Successfully claimed ETH reward!`);
          // No need to refresh predictions after claim - data is already updated
        },
        onError: (error) => {
          console.error('❌ Claim reward transaction failed:', error);
          showNotification('error', 'Claim Failed', 'Failed to claim reward. Please try again.');
        }
      });
    } else {
      // SWIPE claiming (V2 only)
      writeContract({
        address: contract.address as `0x${string}`,
        abi: contract.abi,
        functionName: 'claimRewardWithToken',
        args: [BigInt(predictionId)],
        chainId: ARCHIVED_CHAIN_ID,
      }, {
        onSuccess: () => {
          console.log('✅ SWIPE reward claimed successfully');
          showNotification('success', 'Reward Claimed!', `Successfully claimed SWIPE reward!`);
          // No need to refresh predictions after claim - data is already updated
        },
        onError: (error) => {
          console.error('❌ Claim SWIPE reward transaction failed:', error);
          showNotification('error', 'Claim Failed', 'Failed to claim SWIPE reward. Please try again.');
        }
      });
    }
  };

  const handleResolvePrediction = async (predictionId: string | number, outcome: boolean) => {
    // Resolving prediction

    // Check if this is a Redis-based prediction (string ID) or on-chain prediction (number ID)
    if (typeof predictionId === 'string') {
      // Handle Redis-based prediction via API
      fetch('/api/predictions/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await signAdminRequest('resolve')),
        },
        body: JSON.stringify({
          predictionId: predictionId,
          outcome: outcome,
          reason: `Admin resolved as ${outcome ? 'YES' : 'NO'}`
        }),
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          console.log(`✅ Redis prediction ${predictionId} resolved successfully`);
          
          // Auto-sync claims after resolve
          fetch('/api/sync/v2/claims')
            .then(response => response.json())
            .then(syncData => {
              console.log('✅ Claims synced after resolve:', syncData);
            })
            .catch(syncError => {
              console.warn('⚠️ Claims sync failed after resolve:', syncError);
            });
          
          // Auto-sync will handle data refresh, no need for additional refresh
        } else {
          console.error('❌ Failed to resolve Redis prediction:', data.error);
          alert(`❌ Resolution failed: ${data.error}`);
        }
      })
      .catch(error => {
        console.error('❌ Error resolving Redis prediction:', error);
        alert('❌ Resolution failed. Please try again.');
      });
    } else {
      // Handle on-chain prediction - use V2 for new predictions
      const contract = CONTRACTS.V2;
      if (refuseArchivedWrite(contract.address, 'resolve this market')) return;
      writeContract({
        address: contract.address as `0x${string}`,
        abi: contract.abi,
        functionName: 'resolvePrediction',
        args: [BigInt(predictionId), outcome],
      }, {
        onSuccess: () => {
          console.log(`✅ Prediction ${predictionId} resolved successfully`);
          
          // Auto-sync claims after blockchain resolve
          fetch('/api/sync/v2/claims')
            .then(response => response.json())
            .then(syncData => {
              console.log('✅ Claims synced after blockchain resolve:', syncData);
            })
            .catch(syncError => {
              console.warn('⚠️ Claims sync failed after blockchain resolve:', syncError);
            });
          
          // Auto-sync will handle data refresh, no need for additional refresh
        },
        onError: (error) => {
          console.error('❌ Resolve prediction failed:', error);
          alert('❌ Resolution failed. Please try again.');
        }
      });
    }
  };

  const handleCancelPrediction = async (predictionId: string | number, reason: string) => {
    console.log(`🚫 Cancelling prediction ${predictionId} with reason: ${reason}`);

    // Check if this is a Redis-based prediction (string ID) or on-chain prediction (number ID)
    if (typeof predictionId === 'string') {
      // Handle Redis-based prediction via API
      fetch('/api/predictions/resolve', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(await signAdminRequest('cancel')),
        },
        body: JSON.stringify({
          predictionId: predictionId,
          reason: reason
        }),
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          console.log(`✅ Redis prediction ${predictionId} cancelled successfully`);
          // Auto-sync will handle data refresh, no need for additional refresh
        } else {
          console.error('❌ Failed to cancel Redis prediction:', data.error);
          alert(`❌ Cancellation failed: ${data.error}`);
        }
      })
      .catch(error => {
        console.error('❌ Error cancelling Redis prediction:', error);
        alert('❌ Cancellation failed. Please try again.');
      });
    } else {
      // Handle on-chain prediction - use V2 for new predictions
      const contract = CONTRACTS.V2;
      if (refuseArchivedWrite(contract.address, 'cancel this market')) return;
      writeContract({
        address: contract.address as `0x${string}`,
        abi: contract.abi,
        functionName: 'cancelPrediction',
        args: [BigInt(predictionId), reason],
      }, {
        onSuccess: () => {
          console.log(`✅ Prediction ${predictionId} cancelled successfully`);
          // Auto-sync will handle data refresh, no need for additional refresh
        },
        onError: (error) => {
          console.error('❌ Cancel prediction failed:', error);
          alert('❌ Cancellation failed. Please try again.');
        }
      });
    }
  };

  const handleApprovePrediction = (predictionId: number) => {
    console.log(`✅ Approving prediction ${predictionId}`);

    // Execute real approve prediction transaction - use V2 for new predictions
    const contract = CONTRACTS.V2;
    if (refuseArchivedWrite(contract.address, 'approve this market')) return;
    writeContract({
      address: contract.address as `0x${string}`,
      abi: contract.abi,
      functionName: 'approvePrediction',
      args: [BigInt(predictionId)],
    }, {
      onSuccess: async () => {
        console.log(`✅ Prediction ${predictionId} approved successfully`);

        // Auto-sync the approved prediction to Redis
        try {
          console.log('🔄 Auto-syncing approved prediction to Redis...');
          const syncResponse = await fetch('/api/blockchain/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventType: 'prediction_approved',
              predictionId: predictionId,
              contractVersion: 'V2'
            })
          });
          
          if (syncResponse.ok) {
            console.log('✅ Prediction approval auto-synced to Redis successfully');
          } else {
            console.warn('⚠️ Failed to auto-sync prediction approval to Redis');
          }
        } catch (syncError) {
          console.warn('⚠️ Auto-sync request failed:', syncError);
        }

        // Auto-sync will handle data refresh, no need for additional refresh
      },
      onError: (error) => {
        console.error('❌ Approve prediction failed:', error);
        alert('❌ Approval failed. Please try again.');
      }
    });
  };

  const handleRejectPrediction = (predictionId: number, reason: string) => {
    console.log(`❌ Rejecting prediction ${predictionId} with reason: ${reason}`);

    // Execute real reject prediction transaction - use V2 for new predictions
    const contract = CONTRACTS.V2;
    if (refuseArchivedWrite(contract.address, 'reject this market')) return;
    writeContract({
      address: contract.address as `0x${string}`,
      abi: contract.abi,
      functionName: 'rejectPrediction',
      args: [BigInt(predictionId), reason],
    }, {
      onSuccess: () => {
        console.log(`✅ Prediction ${predictionId} rejected successfully`);
        // Auto-sync will handle data refresh, no need for additional refresh
      },
      onError: (error) => {
        console.error('❌ Reject prediction failed:', error);
        alert('❌ Rejection failed. Please try again.');
      }
    });
  };

  const handleCreatePrediction = () => {
    console.log('➕ Opening prediction creation form...');
    // This would open a modal/form - for now just log
    alert('Prediction creation form will be implemented next');
  };

  const handleManageApprovers = () => {
    console.log('👥 Opening approver management panel...');
    // This would open a modal/form - for now just log
    alert('Approver management will be implemented next');
  };

  const handleWithdrawFees = () => {
    console.log('💰 Withdrawing collected fees to admin wallet...');

    // Execute real withdraw fees transaction - use V2 for new fees
    const contract = CONTRACTS.V2;
    if (refuseArchivedWrite(contract.address, 'withdraw fees')) return;
    writeContract({
      address: contract.address as `0x${string}`,
      abi: contract.abi,
      functionName: 'withdrawEthFees',
      args: [],
    });
  };

  const handlePauseContract = () => {
    console.log('⏸️ Pausing contract...');

    // Execute real pause contract transaction - use V2 for new contract
    const contract = CONTRACTS.V2;
    if (refuseArchivedWrite(contract.address, 'pause this contract')) return;
    writeContract({
      address: contract.address as `0x${string}`,
      abi: contract.abi,
      functionName: 'pause',
      args: [],
    });
  };

  // Stake modal handlers
  const handleStakeAmountChange = (amount: string) => {
    setStakeModal(prev => ({ 
      ...prev, 
      stakeAmount: amount
    }));
  };

  // Does the market still need permission to pull this much collateral?
  const needsApproval = useMemo(() => {
    const market = marketWrite.market;
    if (!market) return false;
    const amount = parseFloat(stakeModal.stakeAmount);
    if (!Number.isFinite(amount) || amount <= 0) return false;
    // Unknown allowance means "ask", not "assume granted".
    if (collateralAllowance === undefined || collateralAllowance === null) return true;
    const required = parseUnits(amount.toFixed(market.collateral.decimals), market.collateral.decimals);
    return BigInt(collateralAllowance.toString()) < required;
  }, [collateralAllowance, stakeModal.stakeAmount, marketWrite.market]);

  // Wait for the approval to actually be on chain before betting.
  //
  // Polling the allowance is the honest test: it is the state placeBet reads
  // when it calls transferFrom. The old code slept two seconds and hoped, which
  // fails on a slow block and then reverts after the user has already signed.
  const waitForAllowance = useCallback(async (needed: bigint): Promise<boolean> => {
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const { data } = await refetchAllowance();
      if (data !== undefined && data !== null && BigInt(data.toString()) >= needed) {
        return true;
      }
    }
    return false;
  }, [refetchAllowance]);

  const handleConfirmStake = async () => {
    const { redisId, isYes, stakeAmount } = stakeModal;
    const amount = parseFloat(stakeAmount);
    const market = marketWrite.market;

    // Answered before any wallet UI opens. `ready` is only the "is there a
    // market on this chain at all" half; the address comparison happens in
    // handleStakeBet and again inside useMarketWrite at send time.
    if (!marketWrite.ready || !market) {
      showNotification(
        'error',
        'No market here',
        'This network has no Swipe market yet. Switch networks to place a bet.'
      );
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      showNotification('error', 'Enter an amount', 'Type how much you want to bet.');
      return;
    }

    const { decimals, symbol } = market.collateral;
    const amountInCollateral = parseUnits(amount.toFixed(decimals), decimals);

    setIsTransactionLoading(true);
    try {
      if (needsApproval) {
        showNotification('info', 'Approval required', `Approving ${amount} ${symbol} for this bet`);

        // Spender is the market that will pull the tokens, and the token is this
        // chain's collateral. Both come from the same resolution as the bet
        // below, so an allowance can never be granted to one contract while
        // another does the transferFrom.
        const approveTx = await marketWrite.writeCollateral({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [market.address, amountInCollateral],
        });
        console.log('✅ Approval sent:', approveTx);

        const cleared = await waitForAllowance(amountInCollateral);
        if (!cleared) {
          showNotification(
            'error',
            'Approval not confirmed',
            'The approval has not landed yet. Try the bet again in a moment.'
          );
          setIsTransactionLoading(false);
          return;
        }
      }

      // Modal closing and success/error handling happen off the receipt:
      // handleStakeSuccess moves to the next card, handleStakeError restores it.
      const sent = await handleStakeBet(redisId, isYes, amount);
      if (!sent) setIsTransactionLoading(false);
    } catch (error) {
      handleStakeError(error);
    }
  };

  const handleCloseStakeModal = async () => {
    setStakeModal(prev => ({ ...prev, isOpen: false }));
    
    // Restore the card back to its position since stake was cancelled
    // Small delay to ensure modal is closed first
    setTimeout(async () => {
      if (tinderCardRef.current) {
        try {
          console.log('🔄 Restoring card after stake cancelled...');
          await tinderCardRef.current.restoreCard();
          console.log('✅ Card restored successfully');
        } catch (error) {
          console.error('Failed to restore card:', error);
        }
      }
    }, 100);
  };

  // Handle skip button click
  const handleSkip = (predictionId: number) => {
    console.log(`Skipping prediction ${predictionId}`);

    // Move to next card (no notification for skip)
    setCurrentIndex(prev => {
      const next = prev + 1;
      // Reset to first card when reaching the end, or stay on last if only one card
      return cardItems.length <= 1 ? 0 : (next >= cardItems.length ? 0 : next);
    });
  };

  const onSwipe = (direction: string, swipedId: number) => {
    console.log(`You swiped ${direction} on card ${swipedId}`);
    setSwipeDirection(null);
    setSwipeProgress(0);
    
    // Don't process swipes on fallback card
    if (swipedId === 0 || cardItems.length === 0) {
      console.log('Cannot swipe on fallback card');
      return;
    }
    
    // A swipe only picks a side and opens the stake dialog here. Nothing has
    // been staked yet (no amount chosen, no signature, no transaction). Record
    // it as "selected", not "bet", so the feedback overlay can't claim a stake
    // was accepted before one exists. The genuine "Stake Accepted" feedback is
    // fired separately, in handleStakeSuccess, once the transaction is confirmed.
    setLastAction({
      type: 'bet',
      status: 'selected',
      predictionId: swipedId,
      direction: direction as 'left' | 'right',
      timestamp: Date.now()
    });

    // Show feedback
    setShowActionFeedback(true);

    // Hide feedback after 3 seconds
    setTimeout(() => {
      setShowActionFeedback(false);
    }, 3000);

    // Open stake modal for bets (both left and right swipe)
    // Card will move to next only after successful stake (in handleStakeSuccess)
    openStakeModal(direction, swipedId);
  };

  const onCardLeftScreen = (swipedId: number) => {
    console.log(`Card ${swipedId} left the screen`);
  };

  // Handle swipe progress with threshold
  const onSwipeRequirementFulfilled = (direction: string) => {
    setSwipeDirection(direction as 'left' | 'right');
    setSwipeProgress(1);
  };

  const onSwipeRequirementUnfulfilled = () => {
    setSwipeDirection(null);
    setSwipeProgress(0);
  };

  // Handle iframe loading
  const handleIframeLoad = (cardId: number) => {
    console.log(`Successfully loaded iframe for card ${cardId}`);
    setLoadingStates(prev => ({ ...prev, [cardId]: false }));
  };

  const handleIframeError = (cardId: number) => {
    console.warn(`Failed to load iframe for card ${cardId} - showing fallback`);
    setLoadingStates(prev => ({ ...prev, [cardId]: false }));
    // Można tutaj dodać logikę fallback dla iframe'ów
  };

  // The card shown when the deck runs out.
  //
  // This used to be a changelog: four numbered sections about what V2 added
  // over V1, ETH and SWIPE minimums, two separate prize pools. None of it was
  // true any more and none of it was ever something a user could act on. What
  // replaces it says where they are and what to do next, and it names the
  // network from the switcher rather than assuming Base, because "no markets
  // left" is a fact about one chain and the user may be on another.
  const fallbackCard: PredictionData = {
    id: 0,
    title: "Nothing left to swipe",
    prediction: `No open markets on ${chain.label} right now`,
    category: "Markets",
    image: "/under.png",
    isChart: false,
    price: "---",
    change: "+0%",
    votingYes: 50,
    timeframe: `${chain.label} • check back later`,
    description: `You have been through every open market on ${chain.label}. Two ways forward.

Propose one. Write the question you want to bet on and send it for approval. Markets you create pay you a cut of the losing pool when they settle.

Or switch networks. Each network runs its own markets, so there may be open ones where you are not looking. The switcher is on the wallet row.

New markets land through the day, so it is worth coming back.`,
    confidence: 0,
    creator: address || "0x0000000000000000000000000000000000000000",
    participants: []
  };

  const currentCard = cardItems.length > 0 ? cardItems[currentIndex] : fallbackCard;
  
  // Get participants for current card to use with Farcaster profiles hook
  const currentCardParticipants = useMemo(() => {
    if (!currentCard || !hybridPredictions || currentCard.id === 0) {
      // console.log('🔍 currentCardParticipants: returning empty array');
      return [];
    }
    
    const currentPrediction = currentCard.redisId
      ? hybridPredictions.find(hp => parseMarketId(hp.id)?.redisId === currentCard.redisId)
      : undefined;

    /**
     * The collateral market's backers first, the V2 array as the fallback.
     *
     * This read only `participants`, which /api/sync/v2 fills. Markets on the
     * current contract get `usdcParticipants` instead, so a bet that had really
     * landed, and that the pool figures above were already showing, left this
     * panel saying nobody was here.
     */
    const participants =
      currentPrediction?.usdcParticipants?.length
        ? currentPrediction.usdcParticipants
        : currentPrediction?.participants || [];
    const uniqueParticipants = [...new Set(participants)];
    
    // console.log(`🔍 currentCardParticipants: cardId=${currentCard.id}, participants=${uniqueParticipants.length}`, uniqueParticipants);
    return uniqueParticipants;
  }, [currentCard?.id, hybridPredictions]);
  
  // Function to open share preview modal for current prediction
  const shareCurrentPrediction = useCallback(() => {
    if (!currentCard || currentCard.id === 0) {
      console.log('Cannot share - no current prediction');
      return;
    }
    
    // No canonical id means no link worth sharing. It used to fall through to
    // `pred_v2_${n}`, which pointed at an archived market with the same number.
    const predictionId = currentCard.redisId ?? getPredictionIdForShare(currentCard.id);
    if (!predictionId) {
      console.warn('Cannot share: no canonical id for this market');
      return;
    }
    const predictionUrl = `${window.location.origin}/prediction/${predictionId}`;

    // Get pool data for share text
    const currentPred = transformedPredictions[currentIndex];
    const totalPoolETH = currentPred ? ((currentPred.yesTotalAmount || 0) + (currentPred.noTotalAmount || 0)) / 1e18 : 0;
    const totalSwipe = currentPred ? ((currentPred.swipeYesTotalAmount || 0) + (currentPred.swipeNoTotalAmount || 0)) / 1e18 : 0;
    
    // Build share text with random variants from share-texts.ts
    const { text: shareText } = buildCurrentPredictionShareText(
      currentCard.prediction,
      totalPoolETH,
      totalSwipe,
      currentCardParticipants.length
    );
    
    // Open preview modal instead of sharing directly
    setSharePreviewModal({
      isOpen: true,
      shareText,
      shareUrl: predictionUrl,
      stakeInfo: undefined
    });
  }, [currentCard, currentIndex, transformedPredictions, currentCardParticipants, getPredictionIdForShare]);
  
  // Function to actually perform the share (called from modal)
  const performShare = useCallback(async () => {
    if (!sharePreviewModal.shareUrl) return;
    
    try {
      await composeCast({
        text: sharePreviewModal.shareText,
        embeds: [sharePreviewModal.shareUrl]
      });
      
      showNotification('success', 'Shared!', 'Prediction shared on Farcaster! 🚀');
    } catch (error) {
      console.error('Error sharing prediction:', error);
      showNotification('error', 'Share Failed', 'Failed to share. Please try again.');
      throw error;
    }
  }, [sharePreviewModal, composeCast]);
  
  // State for user stakes/votes with full stake data
  interface UserStakeData {
    vote: 'YES' | 'NO' | 'BOTH' | 'NONE';
    yesAmount: number;
    noAmount: number;
    totalStaked: number;
    swipeYesAmount: number;
    swipeNoAmount: number;
    totalSwipeStaked: number;
  }
  const [userStakes, setUserStakes] = useState<{[userId: string]: UserStakeData}>({});
  const [stakesLoading, setStakesLoading] = useState(false);
  
  // State for earnings pagination
  const [earningsPage, setEarningsPage] = useState(0);
  
  // State for copied addresses animation
  const [copiedAddresses, setCopiedAddresses] = useState<Set<string>>(new Set());
  
  // Fetch user stakes for current prediction - only when card changes, not when data loads
  useEffect(() => {
    const fetchUserStakes = async () => {
      if (!currentCard || !currentCard.id || !hybridPredictions || hybridPredictions.length === 0) return;
      
      // Find the original prediction from hybridPredictions, by canonical id.
      const currentPrediction = currentCard.redisId
        ? hybridPredictions.find(hp => parseMarketId(hp.id)?.redisId === currentCard.redisId)
        : undefined;


      if (!currentPrediction) {
        console.warn('No matching prediction found for current card');
        return;
      }
      
      const predictionId = currentPrediction.id; // Use original string ID
      
      setStakesLoading(true);
      // Clear previous stakes when switching predictions
      setUserStakes({});
      // Reset earnings pagination
      setEarningsPage(0);
      
      try {
        console.log(`🔍 Fetching stakes for prediction: ${predictionId}`);
        const response = await fetch(`/api/predictions/${predictionId}/stakes`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            const stakesMap: {[userId: string]: UserStakeData} = {};
            data.data.stakes.forEach((stake: any) => {
              stakesMap[stake.userId.toLowerCase()] = {
                vote: stake.vote,
                yesAmount: stake.yesAmount || 0,
                noAmount: stake.noAmount || 0,
                totalStaked: stake.totalStaked || 0,
                swipeYesAmount: stake.swipeYesAmount || 0,
                swipeNoAmount: stake.swipeNoAmount || 0,
                totalSwipeStaked: stake.totalSwipeStaked || 0
              };
            });
            setUserStakes(stakesMap);
            console.log(`✅ Loaded stakes for prediction ${predictionId}:`, stakesMap);
          }
        } else {
          console.warn(`Failed to fetch stakes: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.warn('Failed to fetch user stakes:', error);
      } finally {
        setStakesLoading(false);
      }
    };
    
    fetchUserStakes();
  }, [currentCard?.id]); // Only depend on currentCard.id, not hybridPredictions
  
  // Use Farcaster profiles hook at top level to avoid conditional hook calls
  const { profiles, loading: profilesLoading } = useFarcasterProfiles(currentCardParticipants);
  
  // Show logo before wallet connection
  if (!address) {
    return (
      <div className="tinder-container">
        <div style={{ 
          textAlign: 'center', 
          padding: '60px', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px'
        }}>
          <img 
            src="/icon.png" 
            alt="SWIPE Logo" 
            style={{ 
              maxWidth: '200px', 
              height: 'auto',
              marginBottom: '20px'
            }} 
          />
          <div style={{ fontSize: '18px', marginBottom: '8px', color: '#666' }}>Connect your wallet to start swiping</div>
          <div style={{ fontSize: '14px', color: '#999' }}>Join the prediction market and make your bets!</div>
        </div>
      </div>
    );
  }

  // Show loading state while fetching predictions
  if (predictionsLoading) {
    return (
      <div className="tinder-container">
        <div className="loading-container">
          <div className="loading-logo">
            <img src="/splash.png" alt="Loading..." className="spinning-logo" />
          </div>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>Loading Predictions</div>
          <div style={{ fontSize: '14px' }}>Fetching real data from blockchain...</div>
        </div>
      </div>
    );
  }

  // Show error state if there's an error
  if (predictionsError) {
    return (
      <div className="tinder-container">
        <div style={{ textAlign: 'center', padding: '60px', color: '#ff6b6b' }}>
          <div style={{ fontSize: '24px', marginBottom: '16px' }}>❌</div>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>Failed to Load Predictions</div>
          <div style={{ fontSize: '14px' }}>{predictionsError}</div>
          <button
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            onClick={() => {
              if (refreshPredictions) {
                refreshPredictions();
              }
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show empty state if no predictions
  if (!hybridPredictions || hybridPredictions.length === 0) {
    return (
      <div className="tinder-container">
        <div style={{ textAlign: 'center', padding: '60px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '16px' }}>⏰</div>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>No open markets</div>
          <div style={{ fontSize: '14px', marginBottom: '16px' }}>
            Nothing is running on {chain.label} right now. Everything here has either
            settled or closed for betting.
          </div>
          <div style={{ fontSize: '12px', color: '#999' }}>
            Propose a market, or switch to another network and look there.
          </div>
        </div>
      </div>
    );
  }



  // Dynamic background color based on swipe direction
  const getCardStyle = () => {
    if (!swipeDirection || swipeProgress === 0) {
      return { backgroundColor: 'white' };
    }

    if (swipeDirection === 'right') {
      return { 
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        boxShadow: '0 20px 60px rgba(76, 175, 80, 0.3)'
      };
    } else {
      return { 
        backgroundColor: 'rgba(244, 67, 54, 0.1)',
        boxShadow: '0 20px 60px rgba(244, 67, 54, 0.3)'
      };
    }
  };

  // Render different dashboard based on activeDashboard state
  if (activeDashboard === 'user') {
    return (
      <div>
        <UserDashboard
          predictions={transformedPredictions}
          onClaimReward={handleClaimReward}
        />
      </div>
    );
  }

  if (activeDashboard === 'admin') {
    // Sprawdź czy użytkownik ma uprawnienia admina (sprawdź zarówno zmienną środowiskową jak i kontrakt)
    const envAdmin = process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase();
    const isEnvAdmin = address && envAdmin === address.toLowerCase();

    // TODO: Add contract check for owner role
    // const { data: contractOwner } = useReadContract({
    //   address: CONTRACT_ADDRESS as `0x${string}`,
    //   abi: CONTRACT_ABI,
    //   functionName: 'owner',
    // });
    // const isContractOwner = address && contractOwner?.toLowerCase() === address.toLowerCase();

    const isAdmin = isEnvAdmin; // || isContractOwner;

    if (!isAdmin) {
      // Jeśli nie ma uprawnień, przekieruj do user dashboard
      dashboardChangeHandler('user');
      return null;
    }

    return (
      <div>
        <AdminDashboard
          predictions={transformedPredictions}
          onResolvePrediction={handleResolvePrediction}
          onCancelPrediction={handleCancelPrediction}
          onCreatePrediction={handleCreatePrediction}
          onManageApprovers={handleManageApprovers}
          onWithdrawFees={handleWithdrawFees}
          onPauseContract={handlePauseContract}
        />
      </div>
    );
  }

  if (activeDashboard === 'approver') {
    // Sprawdź czy użytkownik ma uprawnienia approver lub admina
    const envApprover1 = process.env.NEXT_PUBLIC_APPROVER_1?.toLowerCase();
    const envApprover2 = process.env.NEXT_PUBLIC_APPROVER_2?.toLowerCase();
    const envApprover3 = process.env.NEXT_PUBLIC_APPROVER_3?.toLowerCase();
    const envApprover4 = process.env.NEXT_PUBLIC_APPROVER_4?.toLowerCase();
    const envAdmin = process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase();

    const isEnvApprover = address && (
      envApprover1 === address.toLowerCase() ||
      envApprover2 === address.toLowerCase() ||
      envApprover3 === address.toLowerCase() ||
      envApprover4 === address.toLowerCase()
    );
    const isEnvAdmin = address && envAdmin === address.toLowerCase();

    // TODO: Add contract check for approver role
    // const { data: isContractApprover } = useReadContract({
    //   address: CONTRACT_ADDRESS as `0x${string}`,
    //   abi: CONTRACT_ABI,
    //   functionName: 'approvers',
    //   args: [address as `0x${string}`],
    // });

    const isApprover = isEnvApprover || isEnvAdmin; // || isContractApprover;

    if (!isApprover) {
      // Jeśli nie ma uprawnień, przekieruj do user dashboard
      dashboardChangeHandler('user');
      return null;
    }

    return (
      <div>
        <ApproverDashboard
          predictions={transformedPredictions}
          onApprovePrediction={handleApprovePrediction}
          onRejectPrediction={handleRejectPrediction}
        />
      </div>
    );
  }

  // Default: Tinder Mode
  return (
    <>
    <div className="tinder-container">
      {/* Action Feedback */}
      {showActionFeedback && lastAction && (
        <div className="action-feedback">
          <div className={`feedback-content ${lastAction.type}`}>
            <div className="feedback-icon">
              {lastAction.type === 'skip' ? '👎' : '👍'}
            </div>
            <div className="feedback-text">
              <div className="feedback-title">
                {lastAction.type === 'skip'
                  ? 'Skipped'
                  : lastAction.status === 'confirmed'
                    ? 'Stake Accepted'
                    : `${lastAction.direction === 'right' ? 'YES' : 'NO'} Selected`
                }
              </div>
              <div className="feedback-subtitle">
                {lastAction.type === 'skip'
                  ? 'Prediction skipped'
                  : lastAction.status === 'confirmed'
                    ? `Staked ${lastAction.direction === 'right' ? 'YES' : 'NO'}`
                    : 'Choose an amount to confirm'
                }
              </div>
            </div>
            <div className="feedback-prediction">
              ID: {lastAction.predictionId}
            </div>
          </div>
        </div>
      )}

      {/* Share Prompt */}
      {showSharePrompt && lastStakedPrediction && (
        <div className="share-prompt-overlay">
          <div className="share-prompt-content-new">
            {/* Close button */}
            <button 
              onClick={() => setShowSharePrompt(false)}
              className="share-close-btn"
            >
              ✕
            </button>
            
            {/* Header with logos */}
            <div className="share-logos">
              <img src="/farc.png" alt="Farcaster" className="share-logo" />
              <span className="share-logo-divider">×</span>
              <img src="/Base_square_blue.png" alt="Base" className="share-logo" />
            </div>
            
            {/* Success icon */}
            <div className="share-success-icon">
              <div className="share-success-circle">
                <span>✓</span>
              </div>
            </div>
            
            {/* Title */}
            <h2 className="share-title">Congratulations!</h2>
            <p className="share-subtitle">Your bet has been accepted!</p>
            
            {/* Description */}
            <p className="share-description">Share your bet and challenge your friends!</p>
            
            {/* Share button */}
            <button 
              onClick={() => shareStakedPrediction('achievement')}
              className="share-main-btn"
            >
              <svg className="share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              Share
            </button>
            
            {/* Skip link */}
            <button 
              onClick={() => setShowSharePrompt(false)}
              className="share-skip-link"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}

      {/* Tinder Card */}
      <div className="card-container">
        <TinderCard
          ref={tinderCardRef}
          key={currentCard.id}
          onSwipe={(dir) => onSwipe(dir, currentCard.id)}
          onCardLeftScreen={() => onCardLeftScreen(currentCard.id)}
          onSwipeRequirementFulfilled={(dir) => onSwipeRequirementFulfilled(dir)}
          onSwipeRequirementUnfulfilled={onSwipeRequirementUnfulfilled}
          preventSwipe={currentCard.id === 0 ? ['up', 'down', 'left', 'right'] : ['up', 'down']}
          className="tinder-card"
          swipeRequirementType="position"
          swipeThreshold={120} /* Increased for better mobile experience */
        >
          <div 
            className="card" 
            style={getCardStyle()}
          >
                         <div className="card-image">
                               {currentCard.isChart ? (
                  <>
                    {loadingStates[currentCard.id] && (
                      <div className="chart-loading">
                        <div className="loading-spinner"></div>
                        <p>Loading chart...</p>
                      </div>
                    )}
                    <iframe
                      id="geckoterminal-embed"
                      title="GeckoTerminal Embed"
                      src={currentCard.image}
                      frameBorder="0"
                      allow="clipboard-write"
                      allowFullScreen
                      style={{
                        width: '100%',
                        height: '100%',
                        display: loadingStates[currentCard.id] ? 'none' : 'block'
                      }}
                      onLoad={() => handleIframeLoad(currentCard.id)}
                      onError={() => {
                        console.warn(`Failed to load iframe: ${currentCard.image}`);
                        handleIframeError(currentCard.id);
                      }}
                      sandbox="allow-scripts allow-same-origin"
                    />
                  </>
                ) : (
                 <img
                   src={currentCard.image}
                   alt={currentCard.title}
                   onError={(e) => {
                     console.warn(`Failed to load image: ${currentCard.image}`);
                     // Ustaw fallback image lub ukryj obraz
                     (e.target as HTMLImageElement).style.display = 'none';
                   }}
                   onLoad={() => {
                     // Image loaded successfully
                   }}
                 />
               )}
               {/* Only show overlay for non-chart cards */}
               {!currentCard.isChart && (
                 <div className="image-overlay">
                   <div className="category-badge">{currentCard.category}</div>
                 </div>
               )}
             </div>
            <div className="card-content">
              <h3 className="card-title">{currentCard.prediction}</h3>
              
              {/* Simple Countdown Line */}
              <div className="countdown-line">
                <span className="countdown-icon">⏰</span>
                <span className={`countdown-text ${getTimeUrgencyClass(transformedPredictions[currentIndex]?.deadline || 0)}`}>
                  {currentCard.timeframe || 'Loading...'}
                </span>
              </div>
            </div>
             
             {/* Voting Bar - Fixed at bottom */}
             <div className="voting-section-fixed">
               <div className="voting-bar">
                 <div className="voting-no" style={{ width: `${100 - currentCard.votingYes}%` }}>
                   <span className="voting-text">NO {100 - currentCard.votingYes}%</span>
                 </div>
                 <div className="voting-yes" style={{ width: `${currentCard.votingYes}%` }}>
                   <span className="voting-text">YES {currentCard.votingYes}%</span>
                 </div>
               </div>
             </div>
            
            {/* Dynamic YES/NO overlay */}
            {swipeDirection && swipeProgress > 0 && (
              <div className={`swipe-text-overlay ${swipeDirection}`}>
                <div className="swipe-text">
                  {swipeDirection === 'right' ? 'YES' : 'NO'}
                </div>
              </div>
            )}
          </div>
        </TinderCard>
      </div>

    </div>

    {/* Category Filter Buttons */}
    <div className="category-filter-section">
      <div className="category-filter-container">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`category-filter-btn ${selectedCategory === 'all' ? 'active' : ''}`}
        >
          <span className="text-xs font-bold">ALL</span>
          <span className="text-[10px] opacity-70 ml-1">
            ({realCardItems.filter(item => {
              const prediction = transformedPredictions.find(p => p.id === item.id);
              if (!prediction) return false;
              const now = Date.now() / 1000;
              return prediction.deadline > now && !prediction.resolved && !prediction.cancelled && !prediction.needsApproval;
            }).length})
          </span>
        </button>

        {/* Dynamic category buttons based on available categories */}
        {(() => {
          const availableCategories = [...new Set(
            realCardItems
              .filter(item => {
                const prediction = transformedPredictions.find(p => p.id === item.id);
                if (!prediction) return false;
                const now = Date.now() / 1000;
                return prediction.deadline > now && !prediction.resolved && !prediction.cancelled && !prediction.needsApproval;
              })
              .map(item => {
                const prediction = transformedPredictions.find(p => p.id === item.id);
                return prediction?.category || 'Unknown';
              })
              .filter(Boolean)
          )].sort();

          return availableCategories.map(category => {
            const count = realCardItems.filter(item => {
              const prediction = transformedPredictions.find(p => p.id === item.id);
              if (!prediction) return false;
              const now = Date.now() / 1000;
              return prediction.category === category &&
                     prediction.deadline > now &&
                     !prediction.resolved &&
                     !prediction.cancelled &&
                     !prediction.needsApproval;
            }).length;

            if (count === 0) return null;

            return (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`category-filter-btn ${selectedCategory === category ? 'active' : ''}`}
              >
                <span className="text-xs font-bold">{category.toUpperCase()}</span>
                <span className="text-[10px] opacity-70 ml-1">({count})</span>
              </button>
            );
          });
        })()}
      </div>
    </div>

    {/* Action Buttons - Share, AI, and Skip */}
    <div className="action-buttons-section">
      {/* Share Button */}
      <button
        className="share-button"
        onClick={shareCurrentPrediction}
        title="Share this prediction"
      >
        <svg 
          width="18" 
          height="18" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="#d4ff00" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </button>

      <button
        className="ai-analyze-button"
        onClick={analyzeWithAI}
        disabled={aiModal.isLoading}
      >
        <GradientText 
          colors={['#d4ff00', '#00ff88', '#d4ff00', '#88ff00', '#d4ff00']}
          animationSpeed={3}
          showBorder={false}
        >
          <span className="font-bold text-sm">{aiModal.isLoading ? 'Analyzing...' : 'Ask AI'}</span>
        </GradientText>
      </button>
      
      <div className="or-text">OR</div>
      
      <button
        className={`skip-button ${skipButtonText === 'NEXT' ? 'pulse-glow' : ''}`}
        onClick={() => handleSkip(currentCard.id)}
      >
        <GradientText 
          colors={['#d4ff00', '#00ff88', '#d4ff00', '#88ff00', '#d4ff00']}
          animationSpeed={skipButtonText === 'NEXT' ? 2 : 3}
          showBorder={false}
        >
          <span className="font-bold text-sm tracking-wide">
            {skipButtonText} →
          </span>
        </GradientText>
      </button>
    </div>

    {/* Prediction Details - Hacker/Cyberpunk Style */}
    <div className="cyber-analysis px-4 pb-6">
      {/* Terminal Header */}
      <div className="cyber-terminal mb-4">
        <div className="terminal-header">
          <div className="terminal-title">
            <span className="text-[#1a1a1a] font-mono text-xs font-bold">[ DESCRIPTION ]</span>
            <span className="text-[#666] font-mono text-xs ml-2">--id {currentCard.id}</span>
         </div>
           </div>
        <div className="terminal-body">
          <p className="text-[#1a1a1a] font-mono text-xs leading-relaxed">
            <DescriptionWithLinks text={currentCard.description} />
          </p>
           </div>
          </div>

      {/* Stats Table - Hacker Style */}
      <div className="cyber-table mb-4">
        <div className="table-header">
          <span className="text-[#1a1a1a] font-mono text-xs font-bold">[ SYSTEM_INFO ]</span>
         </div>
        <table className="w-full">
          <tbody>
            <tr className="cyber-row">
              <td className="cyber-label">Category</td>
              <td className="cyber-value text-[#0066cc] font-bold">{currentCard.category}</td>
            </tr>
            <tr className="cyber-row">
              <td className="cyber-label">Time_Left</td>
              <td className={`cyber-value font-bold ${getTimeUrgencyClass(transformedPredictions[currentIndex]?.deadline || 0)}`}>
                {currentCard.timeframe}
              </td>
            </tr>
            <tr className="cyber-row">
              <td className="cyber-label">Confidence</td>
              <td className="cyber-value">
                <div className="flex items-center gap-2">
                  <div className="cyber-progress-bar flex-1">
                    <div className="cyber-progress-fill confidence" style={{ width: `${currentCard.confidence}%` }}></div>
             </div>
                  <span className="text-[#1a1a1a] font-mono font-bold">{currentCard.confidence}%</span>
           </div>
              </td>
            </tr>
            {/* Risk Level - Full Width Section */}
            <tr className="cyber-row">
              <td colSpan={2} className="risk-full-section">
              {(() => {
                const confidence = currentCard.confidence;
                const totalStakedETH = ((transformedPredictions[currentIndex]?.yesTotalAmount || 0) + (transformedPredictions[currentIndex]?.noTotalAmount || 0)) / 1e18;
                const totalStakedSWIPE = ((transformedPredictions[currentIndex]?.swipeYesTotalAmount || 0) + (transformedPredictions[currentIndex]?.swipeNoTotalAmount || 0)) / 1e18;
                const participantCount = transformedPredictions[currentIndex]?.participants || 0;
                  const timeLeft = (transformedPredictions[currentIndex]?.deadline || 0) - Date.now() / 1000;
                  
                  // Calculate individual risk components
                  const confRisk = (100 - confidence) * 0.4;
                  let liqRisk = 0;
                  if (totalStakedETH < 0.1 && totalStakedSWIPE < 100000) liqRisk = 30;
                  else if (totalStakedETH < 1 && totalStakedSWIPE < 50000) liqRisk = 15;
                  let partRisk = 0;
                  if (participantCount < 3) partRisk = 20;
                  else if (participantCount < 10) partRisk = 10;
                 let timeRisk = 0;
                  if (timeLeft < 3600) timeRisk = 25;
                  else if (timeLeft < 86400) timeRisk = 15;
                  
                  const riskScore = confRisk + liqRisk + partRisk + timeRisk;
                  
                  let riskLevel = 'LOW';
                  let riskColor = 'text-emerald-700';
                  if (riskScore >= 60) { riskLevel = 'HIGH'; riskColor = 'text-red-600'; }
                  else if (riskScore >= 30) { riskLevel = 'MEDIUM'; riskColor = 'text-amber-700'; }
                 
                 return (
                    <div className="risk-container">
                      <div className="risk-line-1">
                        <span className="risk-label-main">RISK_LEVEL</span>
                        <div className="cyber-progress-bar risk-bar">
                          <div className={`cyber-progress-fill ${riskScore >= 60 ? 'danger' : riskScore >= 30 ? 'warning' : 'safe'}`} style={{ width: `${Math.min(riskScore, 100)}%` }}></div>
                   </div>
                        <span className={`risk-level-text ${riskColor}`}>{riskLevel}</span>
                        <span className="risk-pts">{Math.round(riskScore)} pts</span>
             </div>
                      <div className="risk-line-2">
                        <span className="risk-detail">Conf: {confRisk.toFixed(1)}</span>
                        <span className="risk-divider">|</span>
                        <span className="risk-detail">Liq: {liqRisk}</span>
                        <span className="risk-divider">|</span>
                        <span className="risk-detail">Part: {partRisk}</span>
                        <span className="risk-divider">|</span>
                        <span className="risk-detail">Time: {timeRisk}</span>
             </div>
                    </div>
                  );
                })()}
              </td>
            </tr>
            <tr className="cyber-row">
              <td className="cyber-label">Participants</td>
              <td className="cyber-value text-[#7c3aed] font-bold">{currentCardParticipants.length} swipers</td>
            </tr>
          </tbody>
        </table>
           </div>
           
      {/* Your own stake, read from the contract rather than from Redis, so it
          appears the moment the bet mines instead of waiting for a sync and a
          snapshot rebuild. Renders nothing until you hold a position. */}
      {marketWrite.market && transformedPredictions[currentIndex]?.id > 0 && (
        <YourPosition
          marketAddress={marketWrite.market.address}
          abi={marketWrite.market.abi as readonly unknown[]}
          chainId={marketWrite.market.chainId}
          numericId={transformedPredictions[currentIndex].id}
          decimals={collateralDecimals}
          symbol={collateralSymbol || 'USDC'}
          platformFeeBps={platformFeeBps}
          creatorFeeBps={creatorFeeBps}
          resolved={Boolean(transformedPredictions[currentIndex]?.resolved)}
          outcome={Boolean(transformedPredictions[currentIndex]?.outcome)}
          cancelled={Boolean(transformedPredictions[currentIndex]?.cancelled)}
        />
      )}

      {/* The exit list, below the deck. One row per side held on the market in
          front of you, straight from positions() on chain, and nothing when
          you hold nothing. The component owns its own reads and sends through
          the same guarded useMarketWrite path as everything else; no send
          lives in this file for it. */}
      {transformedPredictions[currentIndex]?.redisId && (
        <ExitPanel
          predictionId={transformedPredictions[currentIndex].redisId}
          question={transformedPredictions[currentIndex]?.question}
          onExited={refreshPredictions}
        />
      )}

      {/* Pools and rules. Was two panels reading the archived V2 fields, so on
          every market this app now makes they showed an empty ETH pool and an
          empty SWIPE pool while the real collateral pool was nowhere on screen.
          MarketPools renders the leg the market actually has, and the archived
          legs only when they hold something. */}
      <MarketPools
        yes={transformedPredictions[currentIndex]?.usdcYesTotalAmount || 0}
        no={transformedPredictions[currentIndex]?.usdcNoTotalAmount || 0}
        decimals={collateralDecimals}
        symbol={collateralSymbol || 'USDC'}
        createdAt={transformedPredictions[currentIndex]?.openedAt}
        deadline={transformedPredictions[currentIndex]?.deadline || 0}
        platformFeeBps={platformFeeBps}
        creatorFeeBps={creatorFeeBps}
        minBet={minBetDisplay}
        participants={transformedPredictions[currentIndex]?.usdcParticipantCount || 0}
        ethYes={transformedPredictions[currentIndex]?.yesTotalAmount || 0}
        ethNo={transformedPredictions[currentIndex]?.noTotalAmount || 0}
        swipeYes={transformedPredictions[currentIndex]?.swipeYesTotalAmount || 0}
        swipeNo={transformedPredictions[currentIndex]?.swipeNoTotalAmount || 0}
        marketAddress={marketWrite.market?.address}
        abi={marketWrite.market?.abi as readonly unknown[] | undefined}
        chainId={marketWrite.market?.chainId}
        numericId={transformedPredictions[currentIndex]?.id}
      />

      {/* Active Swipers - Hacker Style */}
      <div className="cyber-swipers">
        <div className="swipers-header">
          <span className="text-[#1a1a1a] font-mono text-xs font-bold">[ ACTIVE_SWIPERS ]</span>
          <span className="text-[#d4ff00] font-mono text-sm font-bold">{currentCardParticipants.length}</span>
                   </div>
        <div className="swipers-content">
          {currentCardParticipants.length === 0 ? (
            <div className="text-center text-zinc-500 font-mono text-xs py-4">No swipers yet...</div>
          ) : (
            <div className="flex flex-wrap gap-2 justify-center">
                           {profilesLoading ? (
                <div className="text-xs text-[#1a1a1a] font-mono">Loading profiles...</div>
                           ) : (
                            currentCardParticipants.map((participantAddress, i) => {
                              const profile = profiles.find((p: any) => p && p.address === participantAddress);
                              const hasFarcasterProfile = profile && profile.fid !== null && !profile.isWalletOnly;
                               
                               const getInitials = () => {
                                 if (hasFarcasterProfile && profile?.display_name) {
                                   return profile.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                                 }
                                 return participantAddress.slice(2, 4).toUpperCase();
                               };

                               const getAvatarColor = (addr: string) => {
                    const colors = ['bg-[#d4ff00]', 'bg-emerald-500', 'bg-purple-500', 'bg-pink-500', 'bg-amber-500', 'bg-red-500', 'bg-indigo-500', 'bg-teal-500'];
                    const hash = addr.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
                                 return colors[Math.abs(hash) % colors.length];
                               };
                               
                               const userStakeData = userStakes[participantAddress.toLowerCase()];
                               const userVote = userStakeData?.vote || 'NONE';
                               
                               const getVoteIndicatorClass = () => {
                                 switch (userVote) {
                      case 'YES': return 'ring-2 ring-emerald-400 shadow-emerald-400/50';
                      case 'NO': return 'ring-2 ring-rose-400 shadow-rose-400/50';
                      case 'BOTH': return 'ring-2 ring-amber-400 shadow-amber-400/50';
                      default: return 'ring-1 ring-zinc-600';
                                 }
                               };
                               
                              return (
                                <div key={`${participantAddress}-${i}`} className="relative">
                                     <Avatar
                        className={`cursor-pointer hover:scale-110 transition-all duration-300 shadow-lg ${getVoteIndicatorClass()}`}
                                       onClick={() => {
                                         if (!hasFarcasterProfile) {
                                           navigator.clipboard.writeText(participantAddress);
                                           setCopiedAddresses(prev => new Set(prev).add(participantAddress));
                                           setTimeout(() => {
                                             setCopiedAddresses(prev => {
                                               const newSet = new Set(prev);
                                               newSet.delete(participantAddress);
                                               return newSet;
                                             });
                            }, 2000);
                                           return;
                                         }
                                         try {
                                           if (profile.fid) {
                              viewProfile(parseInt(profile.fid, 10));
                                           }
                                         } catch (error) {
                                           console.error('Error opening Farcaster profile:', error);
                                         }
                                       }}
                                     >
                                       <AvatarImage 
                                         src={hasFarcasterProfile ? (profile?.pfp_url || undefined) : `https://api.dicebear.com/7.x/avataaars/svg?seed=${participantAddress.slice(2, 8)}`} 
                                         alt={hasFarcasterProfile ? (profile?.display_name || `User ${participantAddress.slice(2, 6)}`) : `Wallet ${participantAddress.slice(2, 6)}`}
                                       />
                                       <AvatarFallback className={getAvatarColor(participantAddress)}>
                          <span className="text-white text-xs font-semibold">{getInitials()}</span>
                                       </AvatarFallback>
                                     </Avatar>
                                     {userVote !== 'NONE' && (
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                          userVote === 'YES' ? 'bg-emerald-500 text-white' : 
                          userVote === 'NO' ? 'bg-rose-500 text-white' : 
                          'bg-amber-500 text-black'
                        }`}>
                          {userVote === 'YES' ? '✓' : userVote === 'NO' ? '✗' : '±'}
                                       </div>
                                     )}
                                   {!hasFarcasterProfile && copiedAddresses.has(participantAddress) && (
                                     <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-green-500 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-2xl animate-bounce z-[9999] border-2 border-white">
                                       ✅ Copied!
                                     </div>
                                   )}
                                 </div>
                               );
                            })
                           )}
                         </div>
          )}
          <div className="swipers-footer">Click avatars to view profiles</div>
           </div>
         </div>

      {/*
        The POTENTIAL_EARNINGS table was removed rather than repaired.

        It computed a payout with `const platformFee = 0.01`, a rate that has
        never been live: the contract takes 300 bps plus 50 bps, and both come
        out of the losing pool rather than off the top. It also divided by the
        raw pool instead of the weighted one, so it handed a late bet the share
        an early bet paid for, and it rendered two columns per staker in ETH and
        $SWIPE, which are pools on the archived contracts.

        Its data came from /api/predictions/[id]/stakes, which answers only for
        V1 and V2 markets now, so on a live market the table did not render at
        all. On an archived one it printed potential earnings for a market whose
        resolver key is gone and which can therefore never settle.

        The stake dialog already shows a correct preview, built from the live
        platformFeeBps and creatorFeeBps against the losing pool. This was the
        stale second copy, and two answers to the same question is worse than
        one.
      */}
        </div>

      {/* Modern Professional Stake Modal - Compact for Mini App */}
      <Dialog open={stakeModal.isOpen} onOpenChange={(open) => !open && handleCloseStakeModal()}>
        <DialogContent className="stake-dialog">
          {/* Header */}
          <div className="swipe-stake__head">
            {/* Retired decorative layers, hidden by .swipe-stake__gone */}
            <div className="swipe-stake__gone" />
            <div className="swipe-stake__gone" />
            <div className="swipe-stake__gone" style={{
              backgroundSize: '200% 100%',
              animation: 'shimmer 3s ease-in-out infinite'
            }} />

            <DialogHeader className="swipe-stake__headrow">
              <div className="swipe-stake__topline">
                <div className="swipe-stake__idblock">
                  <div className="swipe-stake__iconwrap">
                    {/* Retired glow layers, hidden by .swipe-stake__gone */}
                    <div className="swipe-stake__gone" style={{ animationDuration: '2s' }} />
                    <div className="swipe-stake__gone" />
                    <div className={`swipe-stake__icon ${stakeModal.isYes ? 'swipe-stake__icon--yes' : 'swipe-stake__icon--no'}`}>
                      <div className="swipe-stake__gone" style={{ animationDuration: '3s' }} />
                      {stakeModal.isYes ? <TrendingUp className="swipe-stake__icon-mark" /> : <TrendingDown className="swipe-stake__icon-mark" />}
              </div>
                  </div>
                  <div className="swipe-stake__titles">
                    <DialogTitle className="swipe-stake__title">
                      Prediction #{stakeModal.predictionId}
                    </DialogTitle>
                    <DialogDescription className={`swipe-stake__side ${stakeModal.isYes ? 'swipe-stake__side--yes' : 'swipe-stake__side--no'}`}>
                      <Target className="swipe-stake__side-ico" />
                      <span className="swipe-stake__side-text">Betting <span className="swipe-stake__side-word">{stakeModal.isYes ? 'YES' : 'NO'}</span></span>
                    </DialogDescription>
                  </div>
                </div>
                <Badge variant="outline" className={`swipe-stake__flag ${stakeModal.isYes ? 'swipe-stake__flag--yes' : 'swipe-stake__flag--no'}`}>
                  {/* Retired shine layer, hidden by .swipe-stake__gone */}
                  <div className="swipe-stake__gone" style={{
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 2s ease-in-out infinite'
                  }} />
                  <span>{stakeModal.isYes ? 'BULLISH ↗' : 'BEARISH ↘'}</span>
                </Badge>
              </div>
            </DialogHeader>
            </div>

          <Separator className="swipe-stake__rule" />

          {/* Bet amount, in this chain's collateral. One token, no selector:
              V3 pulls a single ERC-20 and has no payable function. */}
          <div className="swipe-stake__body">
            <Card className="swipe-stake__panel">
              <CardContent className="swipe-stake__panel-in">
                <div className="swipe-stake__stack">
                  <div className="swipe-stake__labelrow">
                    <label className="swipe-stake__label">
                      <Wallet className="swipe-stake__label-ico" />
                      Bet amount ({collateralSymbol})
                    </label>
                    <span className="swipe-stake__bal">
                      Balance {formattedCollateralBalance} {collateralSymbol}
                    </span>
                  </div>

                  {/* Quick amounts */}
                  <div className="swipe-stake__quick">
                    {['1', '5', '10', '25'].map((amount) => (
                      <Button
                        key={amount}
                        onClick={() => handleStakeAmountChange(amount)}
                        variant="outline"
                        className="swipe-stake__chip"
                      >
                        {amount}
                      </Button>
                    ))}
                  </div>

                  <div className="swipe-stake__inputblock">
                    <div className="swipe-stake__inputwrap">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={stakeModal.stakeAmount}
                        onChange={(e) => handleStakeAmountChange(e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder={minBetDisplay}
                        className="swipe-stake__input"
                        style={{
                          WebkitAppearance: 'none',
                          MozAppearance: 'textfield',
                        }}
                      />
                      <div className="swipe-stake__gone" />
                    </div>
                  </div>

                  <div className="swipe-stake__note">
                    <Info className="swipe-stake__note-ico" />
                    <span>
                      Minimum {minBetDisplay} {collateralSymbol}
                    </span>
                  </div>

                  {marketWrite.wrongNetwork && (
                    <div className="swipe-stake__note swipe-stake__note--warn">
                      <AlertTriangle className="swipe-stake__note-ico" />
                      <span>
                        Your wallet is on another network. It will be asked to switch before signing.
                      </span>
                    </div>
                  )}
                </div>

                {/* Potential Earnings - the ledger */}
                <Card className="swipe-stake__ledger">
                  <CardContent className="swipe-stake__ledger-in">
                    <div className="swipe-stake__ledgerhead">
                      <div className="swipe-stake__ledgertitle">
                        <Calculator className="swipe-stake__ledger-ico" />
                        <span>Potential earnings</span>
                      </div>
                      <Badge variant="outline" className="swipe-stake__est">EST.</Badge>
                    </div>
                    {potentialEarnings ? (
                      <Table>
                        <TableBody>
                          <TableRow className="swipe-stake__tr">
                            <TableCell className="swipe-stake__td swipe-stake__td--key">
                              <div className="swipe-stake__keywrap">
                                <ArrowUpRight className="swipe-stake__key-ico" />
                                <span>Payout</span>
                              </div>
                            </TableCell>
                            <TableCell className="swipe-stake__td swipe-stake__td--val">
                              <div className="swipe-stake__val swipe-stake__val--lime">
                                {potentialEarnings.payout.toFixed(2)} {potentialEarnings.token}
                              </div>
                            </TableCell>
                          </TableRow>

                          <TableRow className="swipe-stake__tr">
                            <TableCell className="swipe-stake__td swipe-stake__td--key">
                              <div className="swipe-stake__keywrap">
                                <TrendingUp className="swipe-stake__key-ico" />
                                <span>Profit</span>
                              </div>
                            </TableCell>
                            <TableCell className="swipe-stake__td swipe-stake__td--val">
                              <div className="swipe-stake__val swipe-stake__val--lime">
                                +{potentialEarnings.profit.toFixed(2)} {potentialEarnings.token}
                              </div>
                              <div className="swipe-stake__sub">
                                {potentialEarnings.profitPercent.toFixed(1)}% ROI
                              </div>
                            </TableCell>
                          </TableRow>

                          <TableRow className="swipe-stake__tr">
                            <TableCell className="swipe-stake__td swipe-stake__td--key">
                              <div className="swipe-stake__keywrap">
                                <PieChart className="swipe-stake__key-ico" />
                                <span>Share of pool</span>
                              </div>
                            </TableCell>
                            <TableCell className="swipe-stake__td swipe-stake__td--val">
                              <div className="swipe-stake__val">
                                {potentialEarnings.sharePercent.toFixed(2)}%
                              </div>
                              <Progress value={Math.min(potentialEarnings.sharePercent, 100)} className="swipe-stake__meter" />
                            </TableCell>
                          </TableRow>

                          <TableRow className="swipe-stake__tr">
                            <TableCell className="swipe-stake__td swipe-stake__td--key">
                              <div className="swipe-stake__keywrap">
                                <Info className="swipe-stake__key-ico" />
                                <span>Pool after bet</span>
                              </div>
                            </TableCell>
                            <TableCell className="swipe-stake__td swipe-stake__td--val">
                              <div className="swipe-stake__val">
                                {potentialEarnings.totalPoolAfter.toFixed(2)} {potentialEarnings.token}
                              </div>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="swipe-stake__empty">
                        <Info className="swipe-stake__note-ico" />
                        <span>Enter an amount to preview potential payout</span>
                      </div>
                    )}
                    <p className="swipe-stake__caveat">
                      An estimate on the pools as they stand. Your share of the losing pool is also weighted by how early you bet, which this does not model.
                    </p>
                  </CardContent>
                </Card>

              </CardContent>
            </Card>
              </div>

          {/* Footer actions */}
          <DialogFooter className="swipe-stake__foot">
            <Button
              variant="outline"
              onClick={handleCloseStakeModal}
              disabled={isTransactionLoading}
              className="swipe-stake__btn swipe-stake__btn--quiet"
            >
                  Cancel
            </Button>
            <Button
                  onClick={handleConfirmStake}
                  disabled={isTransactionLoading || !marketWrite.ready}
              className={`swipe-stake__btn swipe-stake__btn--go${isTransactionLoading ? ' swipe-stake__btn--busy' : ''}`}
                >
                  {isTransactionLoading ? (
                <div className="swipe-stake__btnrow">
                  <div className="swipe-stake__spin" />
                  <span>Processing...</span>
                </div>
                  ) : !marketWrite.ready ? (
                    <div className="swipe-stake__btnrow">
                      <AlertTriangle className="swipe-stake__btn-ico" />
                      <span>No market on this network</span>
                    </div>
                  ) : needsApproval ? (
                    <div className="swipe-stake__btnrow">
                      <Zap className="swipe-stake__btn-ico" />
                      <span>Approve and bet {stakeModal.stakeAmount} {collateralSymbol}</span>
                    </div>
                  ) : (
                    <div className="swipe-stake__btnrow">
                      <Target className="swipe-stake__btn-ico" />
                      <span>Bet {stakeModal.stakeAmount} {collateralSymbol}</span>
                    </div>
                  )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Analysis Modal */}
      <Dialog open={aiModal.isOpen} onOpenChange={(open) => !open && setAiModal(prev => ({ ...prev, isOpen: false }))}>
        <ElectricBorder 
          color="#d4ff00" 
          speed={1.5} 
          chaos={0.8} 
          thickness={2}
          className="rounded-2xl"
          style={{}}
        >
          <DialogContent className="sm:max-w-[500px] bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 border-none text-white p-0 gap-0 overflow-hidden max-h-[85vh] rounded-2xl">
            {/* Header */}
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-[#d4ff00]/10 via-[#d4ff00]/5 to-transparent" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#d4ff00]/10 via-transparent to-transparent" />
              
              <DialogHeader className="relative p-4 pb-3">
                <div className="flex items-center gap-3">
                  {/* Swiper Avatar on black background */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-[#d4ff00]/20 blur-xl rounded-full" />
                    <div className="relative w-14 h-14 rounded-xl flex items-center justify-center bg-black border border-[#d4ff00]/20 shadow-lg shadow-[#d4ff00]/10 overflow-hidden">
                      <img 
                        src="/swiper1.png" 
                        alt="Swiper AI" 
                        className="w-12 h-12 object-contain"
                      />
                    </div>
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                      <span className="bg-gradient-to-r from-[#d4ff00] to-[#a8cc00] bg-clip-text text-transparent">
                        Swiper AI
                      </span>
                      <Sparkles className="w-4 h-4 text-[#d4ff00] animate-pulse" />
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400 text-xs">
                      Real-time prediction analysis
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
            </div>

          <Separator className="bg-gradient-to-r from-transparent via-[#d4ff00]/30 to-transparent h-px" />

          {/* Content */}
          <div className="p-5 overflow-y-auto max-h-[60vh]">
            {aiModal.isLoading ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-5">
                {/* Animated Logo with glow */}
                <div className="relative">
                  <div className="absolute inset-0 bg-[#d4ff00]/40 blur-2xl rounded-full animate-pulse" />
                  <div className="relative w-24 h-24 rounded-2xl flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 border border-[#d4ff00]/30 shadow-lg shadow-[#d4ff00]/30">
                    <img 
                      src="/splash.png" 
                      alt="Swipe" 
                      className="w-16 h-16 object-contain"
                      style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
                    />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <p className="text-[#d4ff00] font-bold text-lg animate-pulse">Analyzing...</p>
                  <p className="text-zinc-400 text-sm">This may take a few moments</p>
                  <p className="text-zinc-500 text-xs">Searching real-time data & news</p>
                </div>
              </div>
            ) : aiModal.error ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="w-14 h-14 rounded-full bg-rose-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7 text-rose-400" />
                </div>
                <div className="text-center">
                  <p className="text-rose-400 font-bold">Analysis Failed</p>
                  <p className="text-zinc-500 text-sm mt-1">{aiModal.error}</p>
                </div>
                <Button 
                  onClick={analyzeWithAI}
                  className="mt-2 bg-zinc-700 hover:bg-zinc-600"
                >
                  Try Again
                </Button>
              </div>
            ) : aiModal.analysis ? (
              <div className="space-y-4">
                {/* Step 1: AI Probability - Modern glassmorphism design */}
                {aiTypingStep >= 1 && aiModal.aiProbability?.yes !== null && (
                  <div className="animate-fadeIn">
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-800/80 via-zinc-900/90 to-black/80 backdrop-blur-xl border border-white/10 shadow-2xl">
                      {/* Subtle animated gradient background */}
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-rose-500/5 animate-pulse" />
                      
                      <div className="relative p-5">
                        {/* Header with confidence badge */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-[#d4ff00] animate-pulse shadow-lg shadow-[#d4ff00]/50" />
                            <ShinyText 
                              text="AI PREDICTION" 
                              className="text-xs font-bold tracking-[0.2em] text-zinc-300"
                              speed={3}
                            />
                          </div>
                          <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${
                            aiModal.confidence === 'HIGH' 
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-lg shadow-emerald-500/20' 
                              : aiModal.confidence === 'MEDIUM' 
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-lg shadow-amber-500/20' 
                              : 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/30'
                          }`}>
                            {aiModal.confidence}
                          </div>
                        </div>
                        
                        {/* Probability display - modern style */}
                        <div className="grid grid-cols-2 gap-4">
                          {/* YES */}
                          <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 p-4 transition-all duration-300 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-colors" />
                            <div className="relative">
                              <div className="flex items-center gap-1.5 mb-2">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                <span className="text-xs font-semibold text-emerald-400/80 uppercase tracking-wider">Yes</span>
                              </div>
                              <GradientText 
                                colors={['#34d399', '#10b981', '#34d399']} 
                                animationSpeed={4}
                                className="text-4xl font-black"
                              >
                                {aiModal.aiProbability?.yes?.toFixed(0)}%
                              </GradientText>
                            </div>
                          </div>
                          
                          {/* NO */}
                          <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-rose-500/10 to-rose-600/5 border border-rose-500/20 p-4 transition-all duration-300 hover:border-rose-500/40 hover:shadow-lg hover:shadow-rose-500/10">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/10 rounded-full blur-2xl group-hover:bg-rose-500/20 transition-colors" />
                            <div className="relative">
                              <div className="flex items-center gap-1.5 mb-2">
                                <TrendingDown className="w-4 h-4 text-rose-400" />
                                <span className="text-xs font-semibold text-rose-400/80 uppercase tracking-wider">No</span>
                              </div>
                              <GradientText 
                                colors={['#fb7185', '#f43f5e', '#fb7185']} 
                                animationSpeed={4}
                                className="text-4xl font-black"
                              >
                                {aiModal.aiProbability?.no?.toFixed(0)}%
                              </GradientText>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Parse analysis into sections */}
                {(() => {
                  const sections: { type: string; content: string[] }[] = [];
                  let currentSection = { type: 'analysis', content: [] as string[] };
                  
                  aiModal.analysis?.split('\n').forEach(line => {
                    if (!line.trim()) return;
                    const cleanLine = line.replace(/\*\*/g, '').trim();
                    
                    if (line.includes('ANALYSIS') || line.includes('📊')) {
                      currentSection = { type: 'analysis', content: [] };
                      sections.push(currentSection);
                    } else if (line.includes('AI PROBABILITY') || line.includes('🎯')) {
                      // Skip - shown in card above
                    } else if (line.includes('VALUE') || line.includes('💰')) {
                      currentSection = { type: 'value', content: [] };
                      sections.push(currentSection);
                    } else if (line.includes('RECOMMENDATION') || line.includes('⚡')) {
                      // Skip - we generate our own recommendation based on probability
                      currentSection = { type: 'skip', content: [] };
                    } else if (line.includes('RISK') || line.includes('⚠️')) {
                      currentSection = { type: 'risk', content: [] };
                      sections.push(currentSection);
                    } else if (!line.match(/YES:\s*\d+.*NO:\s*\d+/i) && currentSection.type !== 'skip') {
                      currentSection.content.push(cleanLine);
                    }
                  });
                  
                  const formatText = (text: string) => {
                    return text
                      .replace(/(https?:\/\/[^\s\)]+)/g, '<span class="text-cyan-400 underline text-xs">$1</span>')
                      .replace(/\(Sources?:([^)]+)\)/gi, '<span class="text-cyan-400 text-xs">(Source:$1)</span>')
                      .replace(/BET YES/gi, '<span class="text-emerald-400 font-bold">BET YES</span>')
                      .replace(/BET NO/gi, '<span class="text-rose-400 font-bold">BET NO</span>')
                      .replace(/SKIP/gi, '<span class="text-amber-400 font-bold">SKIP</span>');
                  };
                  
                  return (
                    <>
                      {/* Step 2: Analysis - Modern glassmorphism with TextType */}
                      {aiTypingStep >= 2 && sections.find(s => s.type === 'analysis') && (
                        <div className="animate-fadeIn">
                          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500/5 via-zinc-900/50 to-zinc-900/80 backdrop-blur-sm border border-blue-500/10">
                            <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
                            <div className="relative p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-1 h-4 rounded-full bg-gradient-to-b from-blue-400 to-blue-600" />
                                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Analysis</span>
                              </div>
                              <TextType 
                                text={sections.find(s => s.type === 'analysis')?.content.join(' ') || ''}
                                className="text-zinc-300/90 text-sm leading-relaxed font-light"
                                typingSpeed={15}
                                showCursor={true}
                                cursorCharacter="▋"
                                cursorClassName="text-blue-400/50"
                                loop={false}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Step 3: Value - With accent glow and TextType */}
                      {aiTypingStep >= 3 && sections.find(s => s.type === 'value') && (
                        <div className="animate-fadeIn">
                          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#d4ff00]/5 via-zinc-900/50 to-zinc-900/80 backdrop-blur-sm border border-[#d4ff00]/20">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-[#d4ff00]/10 rounded-full blur-2xl" />
                            <div className="relative p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-1 h-4 rounded-full bg-gradient-to-b from-[#d4ff00] to-[#a8cc00]" />
                                <ShinyText text="VALUE" className="text-xs font-bold text-[#d4ff00] uppercase tracking-wider" speed={2} />
                              </div>
                              <TextType 
                                text={sections.find(s => s.type === 'value')?.content.join(' ') || ''}
                                className="text-zinc-300/90 text-sm leading-relaxed font-light"
                                typingSpeed={15}
                                showCursor={true}
                                cursorCharacter="▋"
                                cursorClassName="text-[#d4ff00]/50"
                                loop={false}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Step 4: Recommendation - Prominent card with glow */}
                      {aiTypingStep >= 4 && aiModal.aiProbability && (
                        <div className="animate-fadeIn">
                          <div className={`relative overflow-hidden rounded-xl backdrop-blur-sm border-2 transition-all duration-500 ${
                            aiModal.recommendation === 'YES' 
                              ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-600/5 to-transparent border-emerald-500/40 shadow-lg shadow-emerald-500/10' 
                              : aiModal.recommendation === 'NO'
                              ? 'bg-gradient-to-br from-rose-500/10 via-rose-600/5 to-transparent border-rose-500/40 shadow-lg shadow-rose-500/10'
                              : 'bg-gradient-to-br from-amber-500/10 via-amber-600/5 to-transparent border-amber-500/40 shadow-lg shadow-amber-500/10'
                          }`}>
                            {/* Animated glow */}
                            <div className={`absolute inset-0 opacity-30 ${
                              aiModal.recommendation === 'YES' ? 'bg-gradient-to-r from-emerald-500/20 via-transparent to-emerald-500/20' :
                              aiModal.recommendation === 'NO' ? 'bg-gradient-to-r from-rose-500/20 via-transparent to-rose-500/20' :
                              'bg-gradient-to-r from-amber-500/20 via-transparent to-amber-500/20'
                            } animate-pulse`} />
                            
                            <div className="relative p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <div className={`w-2 h-2 rounded-full animate-pulse shadow-lg ${
                                  aiModal.recommendation === 'YES' ? 'bg-emerald-400 shadow-emerald-400/50' :
                                  aiModal.recommendation === 'NO' ? 'bg-rose-400 shadow-rose-400/50' :
                                  'bg-amber-400 shadow-amber-400/50'
                                }`} />
                                <span className={`text-xs font-bold uppercase tracking-wider ${
                                  aiModal.recommendation === 'YES' ? 'text-emerald-400' :
                                  aiModal.recommendation === 'NO' ? 'text-rose-400' :
                                  'text-amber-400'
                                }`}>Recommendation</span>
                              </div>
                              
                              <GradientText 
                                colors={
                                  aiModal.recommendation === 'YES' 
                                    ? ['#34d399', '#10b981', '#34d399'] 
                                    : aiModal.recommendation === 'NO'
                                    ? ['#fb7185', '#f43f5e', '#fb7185']
                                    : ['#fbbf24', '#f59e0b', '#fbbf24']
                                } 
                                animationSpeed={3}
                                className="text-xl font-black mb-2"
                              >
                                {aiModal.recommendation === 'YES' 
                                  ? `BET YES · ${aiModal.aiProbability.yes?.toFixed(0)}%`
                                  : aiModal.recommendation === 'NO'
                                  ? `BET NO · ${aiModal.aiProbability.no?.toFixed(0)}%`
                                  : `SKIP · Too Close`
                                }
                              </GradientText>
                              
                              <p className="text-zinc-500 text-xs font-light">
                                {aiModal.confidence === 'HIGH' 
                                  ? 'Strong signal, high confidence'
                                  : aiModal.confidence === 'MEDIUM'
                                  ? 'Moderate signal, weigh your risk tolerance'
                                  : 'Weak signal, proceed with caution'
                                }
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Step 5: Risks - Subtle warning style with TextType */}
                      {aiTypingStep >= 5 && sections.find(s => s.type === 'risk') && (
                        <div className="animate-fadeIn">
                          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-rose-500/5 via-zinc-900/50 to-zinc-900/80 backdrop-blur-sm border border-rose-500/10">
                            <div className="relative p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400/70" />
                                <span className="text-xs font-bold text-rose-400/80 uppercase tracking-wider">Risks</span>
                              </div>
                              <TextType 
                                text={sections.find(s => s.type === 'risk')?.content.join(' ') || ''}
                                className="text-zinc-400/80 text-sm leading-relaxed font-light"
                                typingSpeed={12}
                                showCursor={true}
                                cursorCharacter="▋"
                                cursorClassName="text-rose-400/50"
                                loop={false}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Quick Action Buttons - Modern glassmorphism style */}
                {aiTypingStep >= 5 && (
                  <div className="animate-fadeIn grid grid-cols-2 gap-3 pt-3">
                    <button
                      onClick={() => {
                        setAiModal(prev => ({ ...prev, isOpen: false }));
                        onSwipe('right', currentCard.id);
                      }}
                      className="group relative h-14 overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 backdrop-blur-sm transition-all duration-300 hover:border-emerald-400/60 hover:shadow-lg hover:shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-emerald-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                      <div className="relative flex items-center justify-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-400" />
                        <span className="font-bold text-emerald-300 tracking-wide">BET YES</span>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setAiModal(prev => ({ ...prev, isOpen: false }));
                        onSwipe('left', currentCard.id);
                      }}
                      className="group relative h-14 overflow-hidden rounded-xl bg-gradient-to-br from-rose-500/20 to-rose-600/10 border border-rose-500/30 backdrop-blur-sm transition-all duration-300 hover:border-rose-400/60 hover:shadow-lg hover:shadow-rose-500/20 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-rose-500/0 via-rose-500/10 to-rose-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                      <div className="relative flex items-center justify-center gap-2">
                        <TrendingDown className="w-5 h-5 text-rose-400" />
                        <span className="font-bold text-rose-300 tracking-wide">BET NO</span>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="border-t border-[#d4ff00]/20 p-3 bg-zinc-900/80">
            <div className="flex items-center justify-center text-xs">
              <span className="text-zinc-500">Powered by </span>
              <span className="text-[#d4ff00] font-bold ml-1">Swipe</span>
            </div>
          </div>
        </DialogContent>
        </ElectricBorder>
      </Dialog>

      {/* Share Preview Modal */}
      {currentCard && currentCard.id !== 0 && currentCard.redisId && (
        <SharePreviewModal
          isOpen={sharePreviewModal.isOpen}
          onClose={handleShareModalClose}
          prediction={{
            id: currentCard.redisId,
            question: currentCard.prediction,
            category: currentCard.category,
            totalPoolETH: transformedPredictions[currentIndex]
              ? ((transformedPredictions[currentIndex].usdcYesTotalAmount || 0) + (transformedPredictions[currentIndex].usdcNoTotalAmount || 0)) / Math.pow(10, collateralDecimals)
              : 0,
            participantsCount: currentCardParticipants.length,
            imageUrl: currentCard.image,
            yesPercentage: currentCard.votingYes,
            noPercentage: 100 - currentCard.votingYes,
            includeChart: currentCard.isChart || false
          }}
          shareText={sharePreviewModal.shareText}
          shareUrl={sharePreviewModal.shareUrl}
          onShare={async () => {
            await performShare();
            // Send notification after successful share
            if (sharePreviewModal.stakeInfo) {
              await sendShareNotification('achievement');
            }
          }}
          stakeInfo={sharePreviewModal.stakeInfo}
        />
      )}

      {/* Global Notification System */}
      <NotificationSystem />
    </>
    );
  });

TinderCardComponent.displayName = 'TinderCardComponent';

export default TinderCardComponent;


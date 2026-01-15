import React, { useState, useCallback, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import TinderCard from 'react-tinder-card';
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { ethers } from 'ethers';
import { CONTRACTS, SWIPE_TOKEN, getV2Contract, getContractForAction } from '../../../lib/contract';
import { calculateApprovalAmount } from '../../../lib/constants/approval';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useFarcasterProfiles } from '../../../lib/hooks/useFarcasterProfiles';
import SharePredictionButton from '../Actions/SharePredictionButton';
import { notifyPredictionShared, notifyStakeSuccess } from '../../../lib/notification-helpers';
import { generateTransactionId, generateBasescanUrl } from '../../../lib/utils/redis-utils';
import { useTokenPrices } from '../../../lib/hooks/useTokenPrices';
import { Bot, Loader2, Sparkles, X, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Coins, PieChart, ArrowUpRight, ArrowDownRight, Info, Zap, Target, Award, Wallet, Calculator } from 'lucide-react';
import ElectricBorder from '@/components/ElectricBorder';
import ShinyText from '@/components/ShinyText';
import GradientText from '@/components/GradientText';
import TextType from '@/components/TextType';
import { SharePreviewModal } from '../Modals/SharePreviewModal';

interface PredictionData {
  id: number;
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
  const [stakeModal, setStakeModal] = useState<{
    isOpen: boolean;
    predictionId: number;
    isYes: boolean;
    stakeAmount: string;
    selectedToken: 'ETH' | 'SWIPE';
  }>({
    isOpen: false,
    predictionId: 0,
    isYes: true,
    stakeAmount: '0.001',
    selectedToken: 'ETH'
  });

  // Track user actions for feedback
  const [lastAction, setLastAction] = useState<{
    type: 'skip' | 'bet' | null;
    predictionId: number;
    direction: 'left' | 'right' | null;
    timestamp: number;
  } | null>(null);

  // Show action feedback for 3 seconds
  const [showActionFeedback, setShowActionFeedback] = useState(false);
  // Show share prompt after successful stake
  const [showSharePrompt, setShowSharePrompt] = useState(false);
  const [lastStakedPrediction, setLastStakedPrediction] = useState<PredictionData | null>(null);
  // Store stake details for sharing (separate from transaction tracking to avoid reset issues)
  const [shareStakeData, setShareStakeData] = useState<{
    amount: number;
    token: 'ETH' | 'SWIPE';
    isYes: boolean;
  } | null>(null);
  
  // State for tracking stake transactions
  const [stakeTransactionHash, setStakeTransactionHash] = useState<`0x${string}` | null>(null);
  const [stakePredictionId, setStakePredictionId] = useState<number | null>(null);
  const [stakeAmount, setStakeAmount] = useState<number | null>(null);
  const [stakeToken, setStakeToken] = useState<'ETH' | 'SWIPE' | null>(null);
  const [stakeIsYes, setStakeIsYes] = useState<boolean | null>(null);
  const [ethInputMode, setEthInputMode] = useState<'eth' | 'usd'>('eth');
  
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
      token: 'ETH' | 'SWIPE';
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
  const { formatUsdValue, getUsdValue } = useTokenPrices();

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

  const formatEthAmount = (amount: number): string => {
    if (!Number.isFinite(amount)) return '0';
    const fixed = amount.toFixed(6);
    return fixed.replace(/\.?0+$/, '');
  };

  const formatTokenAmount = (amount: number, token: 'ETH' | 'SWIPE'): string => {
    return token === 'ETH' ? formatEthAmount(amount) : formatSwipeAmount(amount);
  };

  const formatUsdValueLocal = (amount: number, token: 'ETH' | 'SWIPE'): string | null => {
    const usdValue = getUsdValue(amount, token);
    if (usdValue === null || !Number.isFinite(usdValue)) return null;
    if (usdValue < 0.01) return usdValue.toFixed(4);
    if (usdValue < 1) return usdValue.toFixed(3);
    return usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  
  // Check SWIPE allowance for user
  const { data: swipeAllowance, refetch: refetchAllowance } = useReadContract({
    address: SWIPE_TOKEN.address as `0x${string}`,
    abi: [
      {
        "inputs": [{"name": "owner", "type": "address"}, {"name": "spender", "type": "address"}],
        "name": "allowance",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
      }
    ],
    functionName: 'allowance',
    args: address ? [address as `0x${string}`, CONTRACTS.V2.address as `0x${string}`] : undefined,
  });

  // Debug log
  useEffect(() => {
    if (swipeAllowance !== undefined) {
      console.log('=== SWIPE ALLOWANCE DEBUG ===');
      console.log('Raw allowance:', swipeAllowance);
      console.log('Allowance type:', typeof swipeAllowance);
      console.log('Allowance string:', swipeAllowance.toString());
      console.log('User address:', address);
      console.log('Spender (V2 contract):', CONTRACTS.V2.address);
      console.log('=============================');
    } else {
      console.log('SWIPE Allowance is undefined');
    }
  }, [swipeAllowance, address]);
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


  // Auto-refresh SWIPE allowance when modal is open and using SWIPE
  useEffect(() => {
    if (stakeModal.isOpen && stakeModal.selectedToken === 'SWIPE' && !isTransactionLoading) {
      const interval = setInterval(async () => {
        if (refetchAllowance) {
          await refetchAllowance();
        }
      }, 1000); // Check every second
      
      return () => clearInterval(interval);
    }
  }, [stakeModal.isOpen, stakeModal.selectedToken, isTransactionLoading, refetchAllowance]);

  // Force re-render when allowance changes (for button text update)
  useEffect(() => {
    if (stakeModal.isOpen && stakeModal.selectedToken === 'SWIPE') {
      console.log('Allowance changed, forcing modal re-render');
      // This will trigger a re-render of the modal component
    }
  }, [swipeAllowance, stakeModal.isOpen, stakeModal.selectedToken]);

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



  // Transform hybrid predictions to match the expected format (memoized)
  const transformedPredictions = useMemo(() => (hybridPredictions || []).map((pred) => ({
    id: typeof pred.id === 'string' 
      ? (pred.id.includes('v2') 
        ? parseInt(pred.id.replace('pred_v2_', ''), 10) || Date.now()
        : parseInt(pred.id.replace('pred_', ''), 10) || Date.now())
      : (pred.id || Date.now()),
    question: pred.question,
    category: pred.category,
    yesTotalAmount: pred.yesTotalAmount,
    noTotalAmount: pred.noTotalAmount,
    swipeYesTotalAmount: pred.swipeYesTotalAmount,
    swipeNoTotalAmount: pred.swipeNoTotalAmount,
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

  const potentialEarnings = useMemo(() => {
    const amount = parseFloat(stakeModal.stakeAmount);
    if (!amount || amount <= 0) return null;

    const currentPred = transformedPredictions[currentIndex];
    if (!currentPred) return null;

    const isEth = stakeModal.selectedToken === 'ETH';
    const yesPool = isEth
      ? (currentPred.yesTotalAmount || 0) / 1e18
      : (currentPred.swipeYesTotalAmount || 0) / 1e18;
    const noPool = isEth
      ? (currentPred.noTotalAmount || 0) / 1e18
      : (currentPred.swipeNoTotalAmount || 0) / 1e18;

    const platformFee = 0.01;
    const winningPool = stakeModal.isYes ? yesPool : noPool;
    const losingPool = stakeModal.isYes ? noPool : yesPool;
    const winningPoolAfter = winningPool + amount;
    const netLosingPool = losingPool * (1 - platformFee);

    const payout = amount + (winningPoolAfter > 0 ? (amount / winningPoolAfter) * netLosingPool : 0);
    const profit = payout - amount;
    const profitPercent = amount > 0 ? (profit / amount) * 100 : 0;
    const sharePercent = winningPoolAfter > 0 ? (amount / winningPoolAfter) * 100 : 0;
    const totalPoolAfter = winningPoolAfter + losingPool;

    return {
      token: stakeModal.selectedToken,
      amount,
      payout,
      profit,
      profitPercent,
      sharePercent,
      totalPoolAfter,
      platformFee,
      yesPool,
      noPool,
    };
  }, [
    stakeModal.stakeAmount,
    stakeModal.selectedToken,
    stakeModal.isYes,
    transformedPredictions,
    currentIndex,
  ]);
  
  // Transform real predictions to match TinderCard format (memoized for performance)
  const realCardItems: PredictionData[] = useMemo(() => transformedPredictions.map((pred) => {
    // Only use ETH amounts for main display (SWIPE is separate)
    const totalPool = (pred.yesTotalAmount || 0) + (pred.noTotalAmount || 0);
    const totalYesAmount = (pred.yesTotalAmount || 0);
    const totalNoAmount = (pred.noTotalAmount || 0);
    const votingYes = totalPool > 0 ? Math.floor((totalYesAmount / totalPool) * 100) : 50;

    return {
      id: typeof pred.id === 'string'
        ? (() => {
            const idStr = pred.id as string;
            if (idStr.includes('v2')) {
              return parseInt(idStr.replace('pred_v2_', ''), 10) || Date.now();
            }
            return idStr.startsWith('pred_')
              ? parseInt(idStr.replace('pred_', ''), 10) || Date.now()
              : parseInt(idStr, 10) || Date.now();
          })()
        : (pred.id || Date.now()),
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
      confidence: (() => {
        // Calculate confidence based on ETH stake distribution only (SWIPE is separate)
        const yesAmount = (pred.yesTotalAmount || 0);
        const noAmount = (pred.noTotalAmount || 0);
        const totalAmount = yesAmount + noAmount;
        
        if (totalAmount === 0) {
          return 50; // Neutral confidence when no stakes
        }
        
        // Confidence = percentage of YES stakes
        const yesPercentage = (yesAmount / totalAmount) * 100;
        
        // Return the actual percentage (0-100%)
        return Math.round(yesPercentage);
      })(),
      category: pred.category || 'Unknown',
      price: totalPool > 0 ? `${(totalPool / 1e18).toFixed(4)} ETH` : "0.0000 ETH", // Convert wei to ETH
      change: (() => {
        const yesAmount = (pred.yesTotalAmount || 0);
        const noAmount = (pred.noTotalAmount || 0);
        const totalAmount = yesAmount + noAmount;
        
        if (totalAmount === 0) return "0%"; // No stakes yet
        
        // Calculate profit percentage after 1% platform fee
        const platformFee = totalAmount * 0.01; // 1% fee from total pool
        const netPool = totalAmount - platformFee; // Pool after fee
        
        if (netPool <= 0) return "0%"; // After fee, nothing left
        
        // Show profit as percentage of original stake (99% after 1% fee)
        const yesProfitPercentage = yesAmount > 0 ? 99.0 : 0; // 99% profit after 1% fee
        const noProfitPercentage = noAmount > 0 ? 99.0 : 0; // 99% profit after 1% fee
        
        // Show the winning side percentage (after platform fee)
        return yesProfitPercentage > noProfitPercentage ? `+${yesProfitPercentage.toFixed(1)}%` : `-${noProfitPercentage.toFixed(1)}%`;
      })(),
      description: pred.description || 'No description available',
      isChart: pred.includeChart || false,
      votingYes: votingYes,
      creator: pred.creator,
      participants: hybridPredictions.find(hp => {
        const hpId = typeof hp.id === 'string' 
          ? (hp.id.includes('v2') 
            ? parseInt(hp.id.replace('pred_v2_', ''), 10) || Date.now()
            : parseInt(hp.id.replace('pred_', ''), 10) || Date.now())
          : (hp.id || Date.now());
        return hpId === pred.id;
      })?.participants || []
    };
  }), [transformedPredictions]);


  // Open stake modal after swipe
  const openStakeModal = useCallback((direction: string, predictionId: number) => {
    const isYes = direction === 'right';
    // Opening stake modal

    // Find the prediction data for sharing later
    const prediction = realCardItems.find(p => p.id === predictionId);
    if (prediction) {
      setLastStakedPrediction(prediction);
    }

    setStakeModal({
      isOpen: true,
      predictionId,
      isYes,
      stakeAmount: '0.001',
      selectedToken: 'ETH' // Default to ETH
    });
  }, [realCardItems]);


  // Use real predictions from Redis - filter only active predictions
  const cardItems = useMemo(() => {
    const allItems = realCardItems.length > 0 ? realCardItems : (items && items.length ? items : []);

    // Filter only active predictions (not resolved, not cancelled, not expired)
    let activeItems = allItems.filter((item, index) => {
      const prediction = transformedPredictions[index];
      if (!prediction) return false;

      // Check if prediction is active
      const now = Date.now() / 1000;
      const isNotExpired = prediction.deadline > now;
      const isNotResolved = !prediction.resolved;
      const isNotCancelled = !prediction.cancelled;
      const isApproved = !prediction.needsApproval;

      return isNotExpired && isNotResolved && isNotCancelled && isApproved;
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
      // Get the original prediction from hybridPredictions
      const originalPred = hybridPredictions.find(hp => {
        const hpId = typeof hp.id === 'string' 
          ? (hp.id.includes('v2') 
            ? parseInt(hp.id.replace('pred_v2_', ''), 10) || 0
            : parseInt(hp.id.replace('pred_', ''), 10) || 0)
          : (hp.id || 0);
        return hpId === card.id;
      });
      
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
    if (isStakeConfirmed && stakeTransactionHash && stakePredictionId && stakeAmount && stakeToken && stakeIsYes !== null) {
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
          // Convert amount to wei for consistent storage
          const amountInWei = stakeAmount ? stakeAmount * Math.pow(10, 18) : 0;
          const transactionData = {
            id: generateTransactionId(),
            type: 'stake' as const,
            predictionId: `pred_v2_${stakePredictionId}`,
            predictionQuestion,
            amount: amountInWei,
            tokenType: stakeToken || 'ETH',
            txHash: stakeTransactionHash,
            basescanUrl: generateBasescanUrl(stakeTransactionHash),
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
            const syncResponse = await fetch('/api/blockchain/events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventType: 'stake_placed',
                predictionId: stakePredictionId,
                contractVersion: 'V2',
                userId: address?.toLowerCase(),
                txHash: stakeTransactionHash
              })
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
        setStakeAmount(null);
        setStakeToken(null);
        setStakeIsYes(null);
      };
      
      handleStakeAutoSync();
    }
  }, [isStakeConfirmed, stakeTransactionHash, stakePredictionId, stakeAmount, stakeToken, stakeIsYes, address, cardItems, refreshPredictions]);

  // Dashboard handlers

  const handleStakeBet = (predictionId: number, isYes: boolean, amount: number, token: 'ETH' | 'SWIPE') => {
    // Validate based on token type
    if (token === 'ETH') {
      if (amount < 0.00001) {
        alert('❌ Minimum stake is 0.00001 ETH');
        return;
      }
      if (amount > 100) {
        alert('❌ Maximum stake is 100 ETH');
        return;
      }
    } else if (token === 'SWIPE') {
      if (amount < 100000) {
        alert('❌ Minimum stake is 100,000 SWIPE');
        return;
      }
      // SWIPE has unlimited maximum
      // Note: Allowance check is handled in the modal before calling this function
    }

    // Check if user is trying to bet on their own prediction
    const currentPrediction = cardItems.find(card => card.id === predictionId);
    if (currentPrediction && address && currentPrediction.creator && currentPrediction.creator.toLowerCase() === address.toLowerCase()) {
      alert('❌ You cannot bet on your own prediction!');
      return;
    }

    const side = isYes ? 'YES' : 'NO';
    const contract = CONTRACTS.V2; // Always use V2 for new stakes

    // Execute transaction based on token type
    if (token === 'ETH') {
      // ETH staking - use value parameter
      writeContract({
        address: contract.address as `0x${string}`,
        abi: contract.abi,
        functionName: 'placeStake',
        args: [BigInt(predictionId), isYes],
        value: ethers.parseEther(amount.toString()),
      }, {
        onSuccess: (tx) => {
          console.log('📤 ETH Stake transaction sent:', tx);
          showNotification('info', 'Transaction Sent', 'Waiting for blockchain confirmation...');
          
          // Set transaction hash for tracking - card will move after confirmation in useEffect
          setStakeTransactionHash(tx);
          setStakePredictionId(predictionId);
          setStakeAmount(amount);
          setStakeToken('ETH');
          setStakeIsYes(isYes);
          
          // Keep modal open with loading state until confirmation
          // Card movement and modal close will happen in useEffect when isStakeConfirmed becomes true
        },
        onError: (error) => {
          handleStakeError(error);
        }
      });
    } else {
      // SWIPE staking - use placeStakeWithToken
      writeContract({
        address: contract.address as `0x${string}`,
        abi: contract.abi,
        functionName: 'placeStakeWithToken',
        args: [BigInt(predictionId), isYes, ethers.parseEther(amount.toString())],
      }, {
        onSuccess: (tx) => {
          console.log('📤 SWIPE Stake transaction sent:', tx);
          showNotification('info', 'Transaction Sent', 'Waiting for blockchain confirmation...');
          
          // Set transaction hash for tracking - card will move after confirmation in useEffect
          setStakeTransactionHash(tx);
          setStakePredictionId(predictionId);
          setStakeAmount(amount);
          setStakeToken('SWIPE');
          setStakeIsYes(isYes);
          
          // Keep modal open with loading state until confirmation
          // Card movement and modal close will happen in useEffect when isStakeConfirmed becomes true
        },
        onError: (error) => {
          handleStakeError(error);
        }
      });
    }
  };

  // Helper function for stake success
  const handleStakeSuccess = async () => {
    // Close modal and reset loading state
    setStakeModal(prev => ({ ...prev, isOpen: false }));
    setIsTransactionLoading(false);
    
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
    
    // Then sync active predictions stakes from blockchain
    try {
      console.log('🔄 Syncing active predictions stakes from blockchain after stake...');
      const syncResponse = await fetch('/api/sync/v2/active-stakes', { 
        method: 'POST' 
      });
      
      if (syncResponse.ok) {
        const result = await syncResponse.json();
        console.log(`✅ Synced stakes for ${result.data?.syncedPredictions || 0} active predictions after stake`);
        // Refresh again after sync to show updated data
        setTimeout(() => {
          if (refreshPredictions) {
            refreshPredictions();
          }
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to sync active predictions stakes after stake:', error);
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

  // Helper function to get prediction ID for sharing (converts numeric ID back to Redis format)
  const getPredictionIdForShare = useCallback((numericId: number): string => {
    // Find the original prediction from hybridPredictions
    const originalPred = hybridPredictions?.find(hp => {
      const hpId = typeof hp.id === 'string' 
        ? (hp.id.includes('v2') 
          ? parseInt(hp.id.replace('pred_v2_', ''), 10) || 0
          : parseInt(hp.id.replace('pred_', ''), 10) || 0)
        : (hp.id || 0);
      return hpId === numericId;
    });
    
    if (originalPred && typeof originalPred.id === 'string') {
      return originalPred.id; // Return original string ID (e.g., 'pred_v2_123')
    }
    
    // Fallback: assume V2 format
    return `pred_v2_${numericId}`;
  }, [hybridPredictions]);

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
    
    // Get unique prediction URL for sharing - will show custom OG image
    const predictionId = getPredictionIdForShare(lastStakedPrediction.id);
    const predictionUrl = `${window.location.origin}/prediction/${predictionId}`;
      
      // Format stake amount for display
    const formatStakeAmountLocal = (amount: number, token: 'ETH' | 'SWIPE') => {
        if (token === 'SWIPE') {
          if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
          if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
          return amount.toFixed(0);
        }
        return amount.toString();
      };
      
    const formattedAmount = formatStakeAmountLocal(shareStakeData.amount, shareStakeData.token);
      
    // Single unified share text with unique prediction link
    const shareText = `🎯 I just bet on SWIPE!\n\n"${fullPredictionText}"\n\n💰 My bet: ${formattedAmount} ${shareStakeData.token}\n\nWDYT? 👀\n\nCheck it out:`;
    
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

  const handleClaimReward = (predictionId: number, token: 'ETH' | 'SWIPE' = 'ETH') => {
    // Determine which contract to use based on prediction creation date
    const prediction = transformedPredictions.find(p => p.id === predictionId);
    const isV1 = prediction && prediction.createdAt < new Date('2024-01-15').getTime() / 1000;
    const contract = isV1 ? CONTRACTS.V1 : CONTRACTS.V2;

    // Execute claim transaction based on token type
    if (token === 'ETH' || isV1) {
      // ETH claiming or V1 (ETH only)
      writeContract({
        address: contract.address as `0x${string}`,
        abi: contract.abi,
        functionName: 'claimReward',
        args: [BigInt(predictionId)],
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

  const handleResolvePrediction = (predictionId: string | number, outcome: boolean) => {
    // Resolving prediction

    // Check if this is a Redis-based prediction (string ID) or on-chain prediction (number ID)
    if (typeof predictionId === 'string') {
      // Handle Redis-based prediction via API
      fetch('/api/predictions/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

  const handleCancelPrediction = (predictionId: string | number, reason: string) => {
    console.log(`🚫 Cancelling prediction ${predictionId} with reason: ${reason}`);

    // Check if this is a Redis-based prediction (string ID) or on-chain prediction (number ID)
    if (typeof predictionId === 'string') {
      // Handle Redis-based prediction via API
      fetch('/api/predictions/resolve', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
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

  const handleTokenChange = (token: 'ETH' | 'SWIPE') => {
    setStakeModal(prev => ({
      ...prev,
      selectedToken: token,
      stakeAmount: token === 'ETH' ? '0.00001' : '100000'
    }));
  };

  const handleConfirmStake = async () => {
    const { predictionId, isYes, stakeAmount, selectedToken } = stakeModal;
    const amount = parseFloat(stakeAmount);

    // For SWIPE, check if approval is needed first
    if (selectedToken === 'SWIPE') {
      const amountWei = BigInt(Math.floor(amount * 10**18));
      let currentAllowance = BigInt(0);
      
      try {
        if (swipeAllowance !== undefined && swipeAllowance !== null) {
          currentAllowance = BigInt(swipeAllowance.toString());
        }
      } catch (e) {
        console.error('Error parsing allowance:', e);
        currentAllowance = BigInt(0);
      }
      
      console.log('Checking SWIPE approval:');
      console.log('Amount to stake (wei):', amountWei.toString());
      console.log('Current allowance:', currentAllowance.toString());
      console.log('Needs approval?', currentAllowance < amountWei);
      
      // TEMPORARY: Always do approve for SWIPE to test
      if (true) {
        // Need approval first
        setIsTransactionLoading(true);
        showNotification('info', 'Approval Required', `Approving ${amount} SWIPE for this stake`);
        
        // Execute approve transaction with slippage buffer to handle price fluctuations
        // Using calculateApprovalAmount to add 10% buffer (1000 bps)
        // This ensures approval covers potential slippage for large stakes
        const approvalAmount = calculateApprovalAmount(amountWei);
        
        console.log('💰 SWIPE Approval Details:');
        console.log('  Stake amount:', amountWei.toString(), 'wei');
        console.log('  Approval amount (with 10% buffer):', approvalAmount.toString(), 'wei');
        console.log('  Buffer:', ((approvalAmount - amountWei) * BigInt(100) / amountWei).toString() + '%');
        
        writeContract({
          address: SWIPE_TOKEN.address as `0x${string}`,
          abi: [
            {
              "inputs": [{"name": "spender", "type": "address"}, {"name": "amount", "type": "uint256"}],
              "name": "approve",
              "outputs": [{"name": "", "type": "bool"}],
              "stateMutability": "nonpayable",
              "type": "function"
            }
          ],
          functionName: 'approve',
          args: [CONTRACTS.V2.address as `0x${string}`, approvalAmount],
        }, {
          onSuccess: (tx) => {
            console.log('✅ SWIPE approval successful:', tx);
            showNotification('success', 'Approval Successful', `${amount} SWIPE approved! Now placing stake...`);
            
            // Immediately proceed to stake after approval
            setTimeout(() => {
              console.log('Proceeding to stake after approve...');
              // Call the actual stake function
              handleStakeBet(predictionId, isYes, amount, 'SWIPE');
              // Close modal
              setStakeModal(prev => ({ ...prev, isOpen: false }));
              setIsTransactionLoading(false);
            }, 2000); // Wait 2 seconds for approval to be mined
          },
          onError: (error) => {
            console.error('❌ SWIPE approval failed:', error);
            showNotification('error', 'Approval Failed', 'Failed to approve SWIPE token');
            setIsTransactionLoading(false);
          }
        });
        
        return; // Don't proceed with stake yet
      }
    }

    // If we get here, either it's ETH or SWIPE is already approved
    // Set loading state
    setIsTransactionLoading(true);

    // predictionId is already a number, no conversion needed
    const numericPredictionId = predictionId;

    // Call the stake handler from dashboard with token
    // The modal will be closed and card handled by onSuccess/onError callbacks in handleStakeBet
    handleStakeBet(numericPredictionId, isYes, amount, selectedToken);
    
    // Note: Modal closing and success/error handling is done in handleStakeBet callbacks
    // - onSuccess: calls handleStakeSuccess() which moves to next card, then shows share modal
    // - onError: calls handleStakeError() which shows notification and restores card
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
    
    // Determine action type
    const actionType = 'bet';

    // Record the action
    setLastAction({
      type: actionType,
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

  // Create a fallback card for when no predictions are available
  const fallbackCard: PredictionData = {
    id: 0,
    title: "Under Construction",
    prediction: "New predictions coming soon! Contract V2 on the way",
    category: "Platform Status",
    image: "/under.png",
    isChart: false,
    price: "---",
    change: "+0%",
    votingYes: 50,
    timeframe: "Check back later • V2 soon",
    description: `Our prediction platform is currently being updated with exciting new features!

KEY USER-FACING CHANGES: V1 → V2

1. Stake with $SWIPE or ETH
• Choose your token when placing bets
• Different minimum stakes: ETH (0.00001) vs SWIPE (100,000)

2. Create Predictions with $SWIPE
• Pay creation fee in ETH (0.0001) or SWIPE (200,000)
• Get automatic refund if prediction rejected

3. Two Separate Prize Pools
• ETH stakers compete for ETH pool
• SWIPE stakers compete for SWIPE pool
• Claim rewards separately for each token

4. Better Limits
• Lower ETH minimum: 0.00001 ETH (was 0.001)
• SWIPE unlimited maximum stake`,
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
    
    const currentPrediction = hybridPredictions.find(hp => {
      const hpId = typeof hp.id === 'string' 
        ? (hp.id.includes('v2') 
          ? parseInt(hp.id.replace('pred_v2_', ''), 10) || Date.now()
          : parseInt(hp.id.replace('pred_', ''), 10) || Date.now())
        : (hp.id || Date.now());
      return hpId === currentCard.id;
    });
    
    // Remove duplicates from participants array to avoid React key conflicts
    const participants = currentPrediction?.participants || [];
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
    
    const predictionId = getPredictionIdForShare(currentCard.id);
    const predictionUrl = `${window.location.origin}/prediction/${predictionId}`;
    
    // Get pool data for share text
    const currentPred = transformedPredictions[currentIndex];
    const totalPoolETH = currentPred ? ((currentPred.yesTotalAmount || 0) + (currentPred.noTotalAmount || 0)) / 1e18 : 0;
    const totalSwipe = currentPred ? ((currentPred.swipeYesTotalAmount || 0) + (currentPred.swipeNoTotalAmount || 0)) / 1e18 : 0;
    
    // Format SWIPE amount
    const formatSwipe = (amount: number): string => {
      if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
      if (amount >= 1000) return (amount / 1000).toFixed(0) + 'K';
      return amount.toFixed(0);
    };
    
    // Random crypto/prediction slang intros
    const intros = [
      `🔮 Ape in or fade? Here's my alpha:\n\n"${currentCard.prediction}"`,
      `📈 NFA but this looks spicy:\n\n"${currentCard.prediction}"`,
      `🎯 WAGMI or NGMI? You decide:\n\n"${currentCard.prediction}"`,
    ];
    let shareText = intros[Math.floor(Math.random() * intros.length)];
    
    if (totalPoolETH > 0 || totalSwipe > 0) {
      shareText += '\n';
      if (totalPoolETH > 0) {
        shareText += `\n💰 ETH Pool: ${totalPoolETH.toFixed(4)} ETH`;
      }
      if (totalSwipe > 0) {
        shareText += `\n🎯 SWIPE Pool: ${formatSwipe(totalSwipe)}`;
      }
    }
    
    if (currentCardParticipants.length > 0) {
      shareText += `\n👥 ${currentCardParticipants.length} swipers`;
    }
    
    shareText += `\n\nSwipe to predict! 🎯`;
    
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
      
      // Find the original prediction ID from hybridPredictions
      const currentPrediction = hybridPredictions.find(hp => {
        const hpId = typeof hp.id === 'string' 
          ? (hp.id.includes('v2') 
            ? parseInt(hp.id.replace('pred_v2_', ''), 10) || Date.now()
            : parseInt(hp.id.replace('pred_', ''), 10) || Date.now())
          : (hp.id || Date.now());
        return hpId === currentCard.id;
      });
      
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
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>No Active Predictions</div>
          <div style={{ fontSize: '14px', marginBottom: '16px' }}>
            All predictions have expired or no active predictions are available.
          </div>
          <div style={{ fontSize: '12px', color: '#999' }}>
            Create a new prediction to get started!
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
                {lastAction.type === 'skip' ? 'Skipped' : 'Stake Accepted'}
              </div>
              <div className="feedback-subtitle">
                {lastAction.type === 'skip'
                  ? 'Prediction skipped'
                  : `Staking ${lastAction.direction === 'right' ? 'YES' : 'NO'}`
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
           
      {/* ETH Pool - Hacker Style */}
      <div className="cyber-pool eth-pool mb-4">
        <div className="pool-header">
          <img src="/Ethereum-icon-purple.svg" alt="ETH" className="pool-logo" />
          <span className="pool-title">ETH_POOL</span>
          <span className="pool-total">
                   {(() => {
              const total = ((transformedPredictions[currentIndex]?.yesTotalAmount || 0) + (transformedPredictions[currentIndex]?.noTotalAmount || 0)) / 1e18;
              return total > 0 ? total.toFixed(5) : '0.00000';
                   })()} ETH
                 </span>
               </div>
        <div className="pool-grid">
          <div className="pool-side yes">
            <div className="side-label">YES</div>
            <div className="side-amount">
              {((transformedPredictions[currentIndex]?.yesTotalAmount || 0) / 1e18).toFixed(5)}
               </div>
            <div className="side-usd">
              {formatUsdValue((transformedPredictions[currentIndex]?.yesTotalAmount || 0) / 1e18, 'ETH')}
             </div>
                       </div>
          <div className="pool-side no">
            <div className="side-label">NO</div>
            <div className="side-amount">
              {((transformedPredictions[currentIndex]?.noTotalAmount || 0) / 1e18).toFixed(5)}
                     </div>
            <div className="side-usd">
              {formatUsdValue((transformedPredictions[currentIndex]?.noTotalAmount || 0) / 1e18, 'ETH')}
            </div>
          </div>
        </div>
        {/* Split Bar */}
        {(() => {
          const yesAmount = transformedPredictions[currentIndex]?.yesTotalAmount || 0;
          const noAmount = transformedPredictions[currentIndex]?.noTotalAmount || 0;
          const total = yesAmount + noAmount;
          if (total === 0) return <div className="pool-empty">No ETH stakes yet</div>;
          const yesPercent = (yesAmount / total) * 100;
                 return (
            <div className="pool-bar-container">
              <div className="pool-bar">
                <div className="bar-yes" style={{ width: `${yesPercent}%` }}></div>
                <div className="bar-no" style={{ width: `${100 - yesPercent}%` }}></div>
                     </div>
              <div className="bar-labels">
                <span className="label-yes">{yesPercent.toFixed(1)}%</span>
                <span className="label-no">{(100 - yesPercent).toFixed(1)}%</span>
                     </div>
                   </div>
                 );
               })()}
           </div>
           
      {/* SWIPE Pool - Hacker Style */}
      <div className="cyber-pool swipe-pool mb-4">
        <div className="pool-header">
          <img src="/icon.png" alt="SWIPE" className="pool-logo" />
          <span className="pool-title">SWIPE_POOL</span>
          <span className="pool-total">
            {(() => {
              const total = ((transformedPredictions[currentIndex]?.swipeYesTotalAmount || 0) + (transformedPredictions[currentIndex]?.swipeNoTotalAmount || 0)) / 1e18;
              return total > 0 ? total.toLocaleString() : '0';
            })()}
                 </span>
               </div>
        <div className="pool-grid">
          <div className="pool-side yes">
            <div className="side-label">YES</div>
            <div className="side-amount">
              {((transformedPredictions[currentIndex]?.swipeYesTotalAmount || 0) / 1e18).toLocaleString()}
               </div>
            <div className="side-usd">
              {formatUsdValue((transformedPredictions[currentIndex]?.swipeYesTotalAmount || 0) / 1e18, 'SWIPE')}
             </div>
          </div>
          <div className="pool-side no">
            <div className="side-label">NO</div>
            <div className="side-amount">
              {((transformedPredictions[currentIndex]?.swipeNoTotalAmount || 0) / 1e18).toLocaleString()}
            </div>
            <div className="side-usd">
              {formatUsdValue((transformedPredictions[currentIndex]?.swipeNoTotalAmount || 0) / 1e18, 'SWIPE')}
            </div>
          </div>
        </div>
        {/* Split Bar */}
               {(() => {
                 const yesAmount = transformedPredictions[currentIndex]?.swipeYesTotalAmount || 0;
                 const noAmount = transformedPredictions[currentIndex]?.swipeNoTotalAmount || 0;
          const total = yesAmount + noAmount;
          if (total === 0) return <div className="pool-empty">No SWIPE stakes yet</div>;
          const yesPercent = (yesAmount / total) * 100;
                   return (
            <div className="pool-bar-container">
              <div className="pool-bar">
                <div className="bar-yes" style={{ width: `${yesPercent}%` }}></div>
                <div className="bar-no" style={{ width: `${100 - yesPercent}%` }}></div>
                       </div>
              <div className="bar-labels">
                <span className="label-yes">{yesPercent.toFixed(1)}%</span>
                <span className="label-no">{(100 - yesPercent).toFixed(1)}%</span>
                     </div>
                   </div>
                 );
               })()}
           </div>

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

      {/* Potential Earnings Section */}
      {Object.keys(userStakes).length > 0 && (
        <div className="mt-4 rounded-xl overflow-hidden" style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700/50">
            <span className="text-white font-mono text-xs font-bold">[ POTENTIAL_EARNINGS ]</span>
            <span className="text-[#d4ff00] font-mono text-sm font-bold">💰</span>
          </div>
          <div className="p-3">
            {(() => {
              // Get current prediction pool data
              const currentPred = transformedPredictions[currentIndex];
              if (!currentPred) return null;

              // ETH pools
              const yesPoolETH = (currentPred.yesTotalAmount || 0);
              const noPoolETH = (currentPred.noTotalAmount || 0);
              // SWIPE pools
              const yesPoolSWIPE = (currentPred.swipeYesTotalAmount || 0);
              const noPoolSWIPE = (currentPred.swipeNoTotalAmount || 0);
              const platformFee = 0.01; // 1% fee

              // Calculate potential earnings for each staker
              const stakersWithEarnings = Object.entries(userStakes)
                .filter(([_, data]) => data.totalStaked > 0 || data.totalSwipeStaked > 0)
                .map(([address, data]) => {
                  const profile = profiles.find((p: any) => p && p.address === address);
                  const displayName = profile?.display_name || profile?.username || `${address.slice(0, 6)}...${address.slice(-4)}`;
                  
                  // === ETH EARNINGS ===
                  // Calculate potential ETH payout if YES wins
                  let ethYesEarnings = 0;
                  let ethYesProfitPercent = 0;
                  if (data.yesAmount > 0 && yesPoolETH > 0) {
                    const shareOfYesPool = data.yesAmount / yesPoolETH;
                    const winningsFromLosingPool = noPoolETH * (1 - platformFee);
                    ethYesEarnings = data.yesAmount + (shareOfYesPool * winningsFromLosingPool);
                    ethYesProfitPercent = ((ethYesEarnings - data.yesAmount) / data.yesAmount) * 100;
                  }

                  // Calculate potential ETH payout if NO wins
                  let ethNoEarnings = 0;
                  let ethNoProfitPercent = 0;
                  if (data.noAmount > 0 && noPoolETH > 0) {
                    const shareOfNoPool = data.noAmount / noPoolETH;
                    const winningsFromLosingPool = yesPoolETH * (1 - platformFee);
                    ethNoEarnings = data.noAmount + (shareOfNoPool * winningsFromLosingPool);
                    ethNoProfitPercent = ((ethNoEarnings - data.noAmount) / data.noAmount) * 100;
                  }

                  // === SWIPE EARNINGS ===
                  // Calculate potential SWIPE payout if YES wins
                  let swipeYesEarnings = 0;
                  let swipeYesProfitPercent = 0;
                  if (data.swipeYesAmount > 0 && yesPoolSWIPE > 0) {
                    const shareOfYesPool = data.swipeYesAmount / yesPoolSWIPE;
                    const winningsFromLosingPool = noPoolSWIPE * (1 - platformFee);
                    swipeYesEarnings = data.swipeYesAmount + (shareOfYesPool * winningsFromLosingPool);
                    swipeYesProfitPercent = ((swipeYesEarnings - data.swipeYesAmount) / data.swipeYesAmount) * 100;
                  }

                  // Calculate potential SWIPE payout if NO wins
                  let swipeNoEarnings = 0;
                  let swipeNoProfitPercent = 0;
                  if (data.swipeNoAmount > 0 && noPoolSWIPE > 0) {
                    const shareOfNoPool = data.swipeNoAmount / noPoolSWIPE;
                    const winningsFromLosingPool = yesPoolSWIPE * (1 - platformFee);
                    swipeNoEarnings = data.swipeNoAmount + (shareOfNoPool * winningsFromLosingPool);
                    swipeNoProfitPercent = ((swipeNoEarnings - data.swipeNoAmount) / data.swipeNoAmount) * 100;
                  }

                  return {
                    address,
                    displayName,
                    vote: data.vote,
                    // ETH data
                    yesAmount: data.yesAmount,
                    noAmount: data.noAmount,
                    ethYesEarnings,
                    ethNoEarnings,
                    ethYesProfitPercent,
                    ethNoProfitPercent,
                    // SWIPE data
                    swipeYesAmount: data.swipeYesAmount,
                    swipeNoAmount: data.swipeNoAmount,
                    swipeYesEarnings,
                    swipeNoEarnings,
                    swipeYesProfitPercent,
                    swipeNoProfitPercent,
                    pfp: profile?.pfp_url
                  };
                })
                .sort((a, b) => {
                  // Sort by total value (ETH + SWIPE combined)
                  const aTotal = (a.yesAmount + a.noAmount) + (a.swipeYesAmount + a.swipeNoAmount);
                  const bTotal = (b.yesAmount + b.noAmount) + (b.swipeYesAmount + b.swipeNoAmount);
                  return bTotal - aTotal;
                });

              if (stakersWithEarnings.length === 0) {
                return <div className="text-center text-zinc-400 font-mono text-xs py-4">No stakes data available</div>;
              }

              // Find current user's stake (if connected)
              const myStake = address ? stakersWithEarnings.find(s => s.address.toLowerCase() === address.toLowerCase()) : null;
              
              // Get other stakers (excluding current user)
              const allOtherStakers = stakersWithEarnings
                .filter(s => !address || s.address.toLowerCase() !== address.toLowerCase());
              
              // Pagination
              const ITEMS_PER_PAGE = 10;
              const totalPages = Math.ceil(allOtherStakers.length / ITEMS_PER_PAGE);
              const startIdx = earningsPage * ITEMS_PER_PAGE;
              const endIdx = startIdx + ITEMS_PER_PAGE;
              const otherStakers = allOtherStakers.slice(startIdx, endIdx);

              // Helper to render a staker row
              const renderStakerRow = (staker: typeof stakersWithEarnings[0], idx: number, isCurrentUser: boolean) => {
                const hasEthYes = staker.yesAmount > 0;
                const hasEthNo = staker.noAmount > 0;
                const hasSwipeYes = staker.swipeYesAmount > 0;
                const hasSwipeNo = staker.swipeNoAmount > 0;
                
                return (
                  <div 
                    key={staker.address} 
                    className={`grid grid-cols-12 gap-1 items-center px-2 py-2 rounded-lg ${
                      isCurrentUser 
                        ? 'bg-[#d4ff00]/15 border border-[#d4ff00]/40' 
                        : idx % 2 === 0 ? 'bg-zinc-800/50' : 'bg-zinc-900/30'
                    }`}
                  >
                    {/* User info */}
                    <div className="col-span-4 flex items-center gap-1.5 overflow-hidden">
                      <Avatar className={`w-5 h-5 flex-shrink-0 ${isCurrentUser ? 'ring-2 ring-[#d4ff00]' : ''}`}>
                        <AvatarImage src={staker.pfp || undefined} />
                        <AvatarFallback className={`text-[8px] ${isCurrentUser ? 'bg-[#d4ff00] text-black font-bold' : 'bg-zinc-600 text-white'}`}>
                          {isCurrentUser ? 'ME' : staker.displayName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className={`text-[10px] font-mono truncate font-medium ${isCurrentUser ? 'text-[#d4ff00]' : 'text-white'}`}>
                        {isCurrentUser ? '👉 YOU' : (staker.displayName.length > 8 ? staker.displayName.slice(0, 8) + '...' : staker.displayName)}
                      </span>
                    </div>
                    
                    {/* If YES wins */}
                    <div className="col-span-4 text-center">
                      {(hasEthYes || hasSwipeYes) ? (
                        <div className="space-y-0.5">
                          {hasEthYes && (
                            <div className={`text-[10px] font-mono font-bold ${isCurrentUser ? 'text-emerald-300' : 'text-emerald-400'}`}>
                              +{(staker.ethYesEarnings / 1e18).toFixed(4)} ETH
                            </div>
                          )}
                          {hasSwipeYes && (
                            <div className="text-[10px] font-mono text-[#d4ff00] font-bold">
                              +{formatSwipeAmount(staker.swipeYesEarnings / 1e18)} $SWIPE
                            </div>
                          )}
                          <div className={`text-[8px] font-mono ${isCurrentUser ? 'text-emerald-200' : 'text-emerald-300'}`}>
                            +{(hasEthYes ? staker.ethYesProfitPercent : staker.swipeYesProfitPercent).toFixed(0)}%
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-zinc-500">—</span>
                      )}
                    </div>
                    
                    {/* If NO wins */}
                    <div className="col-span-4 text-center">
                      {(hasEthNo || hasSwipeNo) ? (
                        <div className="space-y-0.5">
                          {hasEthNo && (
                            <div className={`text-[10px] font-mono font-bold ${isCurrentUser ? 'text-rose-300' : 'text-rose-400'}`}>
                              +{(staker.ethNoEarnings / 1e18).toFixed(4)} ETH
                            </div>
                          )}
                          {hasSwipeNo && (
                            <div className="text-[10px] font-mono text-[#d4ff00] font-bold">
                              +{formatSwipeAmount(staker.swipeNoEarnings / 1e18)} $SWIPE
                            </div>
                          )}
                          <div className={`text-[8px] font-mono ${isCurrentUser ? 'text-rose-200' : 'text-rose-300'}`}>
                            +{(hasEthNo ? staker.ethNoProfitPercent : staker.swipeNoProfitPercent).toFixed(0)}%
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-zinc-500">—</span>
                      )}
                    </div>
                  </div>
                );
              };

              return (
                <div className="space-y-2">
                  {/* Header row */}
                  <div className="grid grid-cols-12 gap-1 text-[10px] font-mono px-2 border-b border-zinc-600/50 pb-2">
                    <div className="col-span-4 text-zinc-400">SWIPER</div>
                    <div className="col-span-4 text-center text-emerald-400 font-bold">IF YES WINS</div>
                    <div className="col-span-4 text-center text-rose-400 font-bold">IF NO WINS</div>
                  </div>
                  
                  {/* Current user's stake - always first if they have one */}
                  {myStake && renderStakerRow(myStake, 0, true)}
                  
                  {/* Separator between user and others */}
                  {myStake && otherStakers.length > 0 && (
                    <div className="border-t border-zinc-600/50 my-1 pt-1">
                      <div className="text-[9px] font-mono text-zinc-500 px-2">TOP SWIPERS</div>
                    </div>
                  )}
                  
                  {/* Other stakers - paginated */}
                  {otherStakers.map((staker, idx) => renderStakerRow(staker, idx, false))}
                  
                  {/* Pagination controls - only if more than 10 other stakers */}
                  {allOtherStakers.length > ITEMS_PER_PAGE && (
                    <div className="flex items-center justify-center gap-2 pt-2 border-t border-zinc-700/50 mt-2">
                      <button
                        onClick={() => setEarningsPage(p => Math.max(0, p - 1))}
                        disabled={earningsPage === 0}
                        className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all ${
                          earningsPage === 0 
                            ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' 
                            : 'bg-zinc-700 text-white hover:bg-zinc-600'
                        }`}
                      >
                        ◀ PREV
                      </button>
                      
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => (
                          <button
                            key={i}
                            onClick={() => setEarningsPage(i)}
                            className={`w-6 h-6 rounded text-[10px] font-mono font-bold transition-all ${
                              earningsPage === i 
                                ? 'bg-[#d4ff00] text-black' 
                                : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600 hover:text-white'
                            }`}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                      
                      <button
                        onClick={() => setEarningsPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={earningsPage === totalPages - 1}
                        className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all ${
                          earningsPage === totalPages - 1 
                            ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' 
                            : 'bg-zinc-700 text-white hover:bg-zinc-600'
                        }`}
                      >
                        NEXT ▶
                      </button>
                    </div>
                  )}
                  
                  {/* Total count info */}
                  {allOtherStakers.length > ITEMS_PER_PAGE && (
                    <div className="text-center text-zinc-500 font-mono text-[9px] pt-1">
                      Showing {startIdx + 1}-{Math.min(endIdx, allOtherStakers.length)} of {allOtherStakers.length} swipers
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
        </div>

      {/* Modern Professional Stake Modal - Compact for Mini App */}
      <Dialog open={stakeModal.isOpen} onOpenChange={(open) => !open && handleCloseStakeModal()}>
        <DialogContent className="stake-dialog sm:max-w-[500px] max-h-[85vh] top-[45%] sm:top-[50%] translate-y-[-50%] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800/80 text-white p-0 gap-0 overflow-y-auto shadow-2xl backdrop-blur-xl">
          {/* Enhanced Glassmorphic Header with Neon Glow Effects */}
          <div className={`relative overflow-hidden border-b ${stakeModal.isYes ? 'border-lime-400/30' : 'border-red-500/30'} bg-gradient-to-r from-slate-900/95 via-slate-800/80 to-slate-900/95 backdrop-blur-xl`}>
            {/* Animated neon gradient overlay with pulse - More intense for YES */}
            <div className={`absolute inset-0 bg-gradient-to-r ${stakeModal.isYes ? 'from-lime-400/60 via-green-400/50 to-emerald-400/30' : 'from-red-500/50 via-rose-500/40 to-pink-500/30'} animate-pulse`} />
            {/* Neon radial glow effect - More intense for YES */}
            <div className={`absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] ${stakeModal.isYes ? 'from-lime-400/40 via-green-400/25 to-transparent' : 'from-red-500/30 via-rose-500/15 to-transparent'}`} />
            {/* Animated neon light streaks - More visible for YES */}
            <div className={`absolute inset-0 ${stakeModal.isYes ? 'opacity-50' : 'opacity-40'} ${stakeModal.isYes ? 'bg-gradient-to-r from-transparent via-lime-400/60 to-transparent' : 'bg-gradient-to-r from-transparent via-red-500/50 to-transparent'}`} style={{ 
              backgroundSize: '200% 100%',
              animation: 'shimmer 3s ease-in-out infinite'
            }} />
            
            <DialogHeader className="relative p-4 pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {/* Enhanced Icon with neon glow - smaller for mobile, more intense for YES */}
                  <div className="relative">
                    {/* Outer neon glow ring - More intense for YES */}
                    <div className={`absolute -inset-1.5 ${stakeModal.isYes ? 'bg-lime-400' : 'bg-red-500'} blur-xl ${stakeModal.isYes ? 'opacity-100' : 'opacity-80'} rounded-2xl animate-pulse`} style={{ animationDuration: '2s' }} />
                    {/* Middle neon glow - More intense for YES */}
                    <div className={`absolute inset-0 ${stakeModal.isYes ? 'bg-green-400' : 'bg-red-500'} blur-lg ${stakeModal.isYes ? 'opacity-90' : 'opacity-70'} rounded-xl`} />
                    {/* Icon container with neon gradient and glow - Brighter for YES */}
                    <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-2xl ${stakeModal.isYes ? 'bg-gradient-to-br from-lime-300 via-green-400 to-emerald-500 shadow-lime-400/100' : 'bg-gradient-to-br from-red-400 via-rose-500 to-pink-600 shadow-red-500/90'} border-2 ${stakeModal.isYes ? 'border-lime-300/90' : 'border-red-400/70'}`}>
                      <div className={`absolute inset-0 ${stakeModal.isYes ? 'bg-lime-400' : 'bg-red-500'} ${stakeModal.isYes ? 'opacity-40' : 'opacity-30'} rounded-xl animate-ping`} style={{ animationDuration: '3s' }} />
                      {stakeModal.isYes ? <TrendingUp className="w-5 h-5 text-white drop-shadow-lg relative z-10" /> : <TrendingDown className="w-5 h-5 text-white drop-shadow-lg relative z-10" />}
              </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="text-base font-bold text-white mb-0.5 tracking-tight drop-shadow-lg truncate">
                      Prediction #{stakeModal.predictionId}
                    </DialogTitle>
                    <DialogDescription className="text-slate-300 text-xs flex items-center gap-1.5 truncate">
                      <Target className={`w-3 h-3 flex-shrink-0 ${stakeModal.isYes ? 'text-lime-400' : 'text-red-500'}`} />
                      <span className="truncate">Betting <span className={`font-bold ${stakeModal.isYes ? 'text-lime-300 drop-shadow-[0_0_12px_rgba(132,204,22,0.8)]' : 'text-red-400 drop-shadow-[0_0_12px_rgba(239,68,68,0.8)]'}`}>{stakeModal.isYes ? 'YES' : 'NO'}</span></span>
                    </DialogDescription>
                  </div>
                </div>
                {/* Enhanced Badge - smaller for mobile */}
                <Badge variant="outline" className={`px-2.5 py-1 text-[10px] font-bold border-2 backdrop-blur-sm relative overflow-hidden flex-shrink-0 ${stakeModal.isYes ? 'border-lime-400/90 text-lime-200 bg-green-500/30 shadow-lg shadow-lime-400/60' : 'border-red-500/90 text-red-200 bg-rose-600/30 shadow-lg shadow-red-500/60'}`}>
                  {/* Animated neon shine effect */}
                  <div className={`absolute inset-0 ${stakeModal.isYes ? 'bg-gradient-to-r from-transparent via-lime-300/50 to-transparent' : 'bg-gradient-to-r from-transparent via-red-400/50 to-transparent'}`} style={{ 
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 2s ease-in-out infinite'
                  }} />
                  <span className={`relative z-10 drop-shadow-sm ${stakeModal.isYes ? 'text-lime-100' : 'text-red-100'}`}>{stakeModal.isYes ? 'BULLISH ↗' : 'BEARISH ↘'}</span>
                </Badge>
              </div>
            </DialogHeader>
            </div>

          <Separator className="bg-gradient-to-r from-transparent via-slate-700/50 to-transparent h-px" />

          {/* Modern Token Selection Tabs - Compact */}
          <div className="p-4 pt-3">
            <Tabs 
              value={stakeModal.selectedToken} 
              onValueChange={(value) => handleTokenChange(value as 'ETH' | 'SWIPE')}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 bg-slate-900/80 backdrop-blur-sm p-1 h-11 rounded-xl border border-slate-800/80 shadow-inner">
                <TabsTrigger 
                  value="ETH" 
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:via-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-xl data-[state=active]:shadow-blue-500/30 rounded-lg h-9 transition-all duration-300 data-[state=inactive]:hover:bg-slate-800/50"
                >
                  <span className="font-bold text-xs">ETH</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="SWIPE" 
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#d4ff00] data-[state=active]:via-[#b8e600] data-[state=active]:to-[#d4ff00] data-[state=active]:text-black data-[state=active]:shadow-xl data-[state=active]:shadow-[#d4ff00]/30 rounded-lg h-9 transition-all duration-300 data-[state=inactive]:hover:bg-slate-800/50 font-bold"
                >
                  <span className="font-bold text-xs">$SWIPE</span>
                </TabsTrigger>
              </TabsList>

              {/* ETH Content - Compact */}
              <TabsContent value="ETH" className="mt-3 space-y-3">
                <Card className="bg-gradient-to-br from-slate-900/90 via-slate-800/60 to-slate-900/90 border-slate-700/60 backdrop-blur-xl shadow-xl">
                  <CardContent className="p-3">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-[#d4ff00] font-semibold flex items-center gap-1.5">
                          <Wallet className="w-3.5 h-3.5" />
                          Bet Amount
                        </label>
                        {/* Modern Input Mode Toggle - Smaller */}
                        <div className="flex bg-slate-900/80 backdrop-blur-sm rounded-lg p-0.5 border border-slate-700/60 shadow-inner">
                    <button
                            onClick={() => setEthInputMode('eth')}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all duration-200 ${
                              ethInputMode === 'eth'
                                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            ETH
                    </button>
                    <button
                            onClick={() => setEthInputMode('usd')}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all duration-200 ${
                              ethInputMode === 'usd'
                                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            USD
                          </button>
                      </div>
                      </div>
                      
                      {/* Modern Quick Amount Buttons - Smaller */}
                      <div className="grid grid-cols-4 gap-2">
                        {ethInputMode === 'eth' 
                          ? ['0.00001', '0.0001', '0.001', '0.01'].map((amount) => (
                              <Button
                                key={amount}
                                onClick={() => handleStakeAmountChange(amount)}
                                variant="outline"
                                className="h-8 rounded-lg border-2 border-[#d4ff00]/50 bg-slate-900/50 text-white font-bold text-[9px] hover:bg-[#d4ff00]/20 hover:border-[#d4ff00]/80 hover:scale-105 transition-all duration-200 backdrop-blur-sm"
                              >
                                {amount}
                              </Button>
                            ))
                          : ['1', '5', '10', '50'].map((amount) => (
                              <Button
                                key={amount}
                                onClick={() => {
                                  const usdAmount = parseFloat(amount);
                                  const ethPrice = getUsdValue(1, 'ETH');
                                  if (ethPrice) {
                                    const ethAmount = usdAmount / ethPrice;
                                    handleStakeAmountChange(ethAmount.toFixed(6));
                                  }
                                }}
                                variant="outline"
                                className="h-8 rounded-lg border-2 border-[#d4ff00]/50 bg-slate-900/50 text-white font-bold text-[10px] hover:bg-[#d4ff00]/20 hover:border-[#d4ff00]/80 hover:scale-105 transition-all duration-200 backdrop-blur-sm"
                              >
                                ${amount}
                              </Button>
                            ))
                        }
                      </div>

                      {/* Modern Manual Input - Smaller for mobile */}
                      <div className="mt-3 relative">
                        <div className="relative">
                          <Input
                          type="text"
                          inputMode="decimal"
                          value={ethInputMode === 'eth' 
                            ? stakeModal.stakeAmount 
                            : (getUsdValue(parseFloat(stakeModal.stakeAmount) || 0, 'ETH')?.toFixed(2) || '')
                          }
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^0-9.]/g, '');
                            if (ethInputMode === 'eth') {
                              handleStakeAmountChange(value);
                            } else {
                              const usdAmount = parseFloat(value);
                              const ethPrice = getUsdValue(1, 'ETH');
                              if (ethPrice && usdAmount) {
                                const ethAmount = usdAmount / ethPrice;
                                handleStakeAmountChange(ethAmount.toFixed(6));
                              }
                            }
                          }}
                          placeholder={ethInputMode === 'eth' ? '0.00001' : '10.00'}
                            className="w-full h-12 text-2xl font-extrabold bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-2 border-[#d4ff00]/40 rounded-xl text-[#d4ff00] text-center placeholder:text-slate-600 focus:border-[#d4ff00] focus:ring-2 focus:ring-[#d4ff00]/20 focus:shadow-lg focus:shadow-[#d4ff00]/10 transition-all duration-300 backdrop-blur-sm"
                          style={{ 
                            WebkitAppearance: 'none', 
                            MozAppearance: 'textfield',
                          }}
                        />
                          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#d4ff00]/0 via-[#d4ff00]/5 to-[#d4ff00]/0 pointer-events-none" />
                  </div>
                </div>

                      {/* Modern Conversion Display */}
                      {(() => {
                        const amount = parseFloat(stakeModal.stakeAmount) || 0;
                        const usdValue = getUsdValue(amount, 'ETH');
                        if (usdValue !== null && amount > 0) {
                          return (
                            <div className="flex items-center justify-center gap-2 py-2 px-3 bg-gradient-to-r from-blue-500/15 via-blue-500/10 to-blue-500/15 rounded-lg border border-blue-500/30 backdrop-blur-sm shadow-lg shadow-blue-500/10">
                              {ethInputMode === 'eth' ? (
                                <>
                                  <DollarSign className="w-4 h-4 text-[#d4ff00]" />
                                  <span className="text-[#d4ff00] font-bold text-base">
                                    ≈ ${usdValue < 0.01 ? usdValue.toFixed(4) : usdValue < 1 ? usdValue.toFixed(3) : usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-slate-400 text-[10px] font-medium">USD</span>
                                </>
                              ) : (
                                <>
                                  <Coins className="w-4 h-4 text-[#d4ff00]" />
                                  <span className="text-[#d4ff00] font-bold text-base">
                                    ≈ {amount.toFixed(6)}
                                  </span>
                                  <span className="text-slate-400 text-[10px] font-medium">ETH</span>
                                </>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    {/* Modern Potential Earnings Card - Compact Table */}
                    <Card className="bg-gradient-to-br from-slate-900/90 via-emerald-950/30 to-slate-900/90 border-2 border-emerald-500/20 backdrop-blur-xl shadow-2xl">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <Calculator className="w-3.5 h-3.5 text-[#d4ff00]" />
                            <span className="text-xs font-bold text-[#d4ff00]">Potential Earnings</span>
                          </div>
                          <Badge variant="outline" className="text-[9px] border-[#d4ff00]/40 text-[#d4ff00] bg-[#d4ff00]/10 font-semibold px-1.5 py-0.5">EST.</Badge>
                        </div>
                        {potentialEarnings ? (
                          <Table>
                            <TableBody>
                              {/* Payout Row */}
                              <TableRow className="border-slate-700/50 hover:bg-slate-800/30">
                                <TableCell className="py-2 text-[10px] text-blue-300 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <ArrowUpRight className="w-3 h-3 text-blue-400" />
                                    <span>Payout</span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-2 text-right">
                                  <div className="text-xs font-extrabold text-[#d4ff00]">
                                    {formatTokenAmount(potentialEarnings.payout, 'ETH')} ETH
                                  </div>
                                  {(() => {
                                    const usd = formatUsdValueLocal(potentialEarnings.payout, 'ETH');
                                    return usd ? (
                                      <div className="text-[9px] text-cyan-300 mt-0.5">
                                        ${usd}
                                      </div>
                                    ) : null;
                                  })()}
                                </TableCell>
                              </TableRow>
                              
                              {/* Profit Row */}
                              <TableRow className="border-slate-700/50 hover:bg-slate-800/30">
                                <TableCell className="py-2 text-[10px] text-emerald-300 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                                    <span>Profit</span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-2 text-right">
                                  <div className="text-xs font-extrabold text-[#d4ff00]">
                                    +{formatTokenAmount(potentialEarnings.profit, 'ETH')} ETH
                                  </div>
                                  <div className="text-[9px] text-amber-300 font-semibold mt-0.5">
                                    {potentialEarnings.profitPercent.toFixed(1)}% ROI
                                  </div>
                                </TableCell>
                              </TableRow>
                              
                              {/* Share of Pool Row */}
                              <TableRow className="border-slate-700/50 hover:bg-slate-800/30">
                                <TableCell className="py-2 text-[10px] text-blue-300 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <PieChart className="w-3 h-3 text-blue-400" />
                                    <span>Share of pool</span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-2 text-right">
                                  <div className="text-xs font-bold text-blue-300 mb-1">
                                    {potentialEarnings.sharePercent.toFixed(2)}%
                                  </div>
                                  <Progress value={Math.min(potentialEarnings.sharePercent, 100)} className="h-1.5 bg-slate-800/60" />
                                </TableCell>
                              </TableRow>
                              
                              {/* Pool After Bet Row */}
                              <TableRow className="border-slate-700/50 hover:bg-slate-800/30">
                                <TableCell className="py-2 text-[10px] text-purple-300 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <Info className="w-3 h-3 text-purple-400" />
                                    <span>Pool after bet</span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-2 text-right">
                                  <div className="text-xs font-bold text-purple-300">
                                    {formatTokenAmount(potentialEarnings.totalPoolAfter, 'ETH')} ETH
                                  </div>
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="text-center py-3 text-cyan-300 text-xs flex items-center justify-center gap-2">
                            <Info className="w-3.5 h-3.5 text-[#d4ff00]" />
                            <span>Enter an amount to preview potential payout</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                  </CardContent>
                </Card>
              </TabsContent>

              {/* SWIPE Content - Compact */}
              <TabsContent value="SWIPE" className="mt-3 space-y-3">
                <Card className="bg-gradient-to-br from-slate-900/90 via-slate-800/60 to-slate-900/90 border-slate-700/60 backdrop-blur-xl shadow-xl">
                  <CardContent className="p-3">
                    <div className="space-y-3">
                      <label className="text-xs text-[#d4ff00] font-semibold flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5" />
                        Bet Amount
                      </label>
                      
                      {/* Modern Manual Input for SWIPE - Smaller */}
                      <div className="mt-3 relative">
                        <div className="relative">
                          <Input
                            type="text"
                            inputMode="numeric"
                          value={stakeModal.stakeAmount || "100000"}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9]/g, '');
                              if (value === '' || parseFloat(value) >= 100000) {
                                handleStakeAmountChange(value || "100000");
                              }
                            }}
                            placeholder="100000"
                            className="w-full h-12 text-2xl font-extrabold bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-2 border-[#d4ff00]/40 rounded-xl text-[#d4ff00] text-center placeholder:text-slate-600 focus:border-[#d4ff00] focus:ring-2 focus:ring-[#d4ff00]/20 focus:shadow-lg focus:shadow-[#d4ff00]/10 transition-all duration-300 backdrop-blur-sm"
                          style={{
                              WebkitAppearance: 'none', 
                              MozAppearance: 'textfield',
                            }}
                          />
                          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#d4ff00]/0 via-[#d4ff00]/5 to-[#d4ff00]/0 pointer-events-none" />
                  </div>
                      </div>
                      
                      {/* Modern USD Equivalent - Smaller */}
                      {(() => {
                        const amount = parseFloat(stakeModal.stakeAmount) || 0;
                        const usdValue = getUsdValue(amount, 'SWIPE');
                        if (usdValue !== null && amount > 0) {
                          return (
                            <div className="flex items-center justify-center gap-2 py-2 px-3 bg-gradient-to-r from-[#d4ff00]/15 via-[#d4ff00]/10 to-[#d4ff00]/15 rounded-lg border border-[#d4ff00]/30 backdrop-blur-sm shadow-lg shadow-[#d4ff00]/10">
                              <DollarSign className="w-3.5 h-3.5 text-[#d4ff00]" />
                              <span className="text-[#d4ff00] font-bold text-base">
                                ≈ ${usdValue < 0.01 ? usdValue.toFixed(4) : usdValue < 1 ? usdValue.toFixed(3) : usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-slate-400 text-[10px] font-medium">USD</span>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Modern Quick Amount Buttons - Smaller */}
                      <div className="grid grid-cols-4 gap-2">
                        {['100000', '500000', '1000000', '5000000'].map((amount) => (
                          <Button
                            key={amount}
                            onClick={() => handleStakeAmountChange(amount)}
                            variant="outline"
                            className="h-8 rounded-lg border-2 border-[#d4ff00]/50 bg-slate-900/50 text-white font-bold text-[9px] hover:bg-[#d4ff00]/20 hover:border-[#d4ff00]/80 hover:scale-105 transition-all duration-200 backdrop-blur-sm"
                          >
                            {parseInt(amount) >= 1000000 ? `${parseInt(amount) / 1000000}M` : `${parseInt(amount) / 1000}K`}
                          </Button>
                        ))}
                  </div>
                </div>

                    {/* Modern Potential Earnings Card for SWIPE - Compact Table */}
                    <Card className="bg-gradient-to-br from-slate-900/90 via-emerald-950/30 to-slate-900/90 border-2 border-emerald-500/20 backdrop-blur-xl shadow-2xl">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <Calculator className="w-3.5 h-3.5 text-[#d4ff00]" />
                            <span className="text-xs font-bold text-[#d4ff00]">Potential Earnings</span>
                          </div>
                          <Badge variant="outline" className="text-[9px] border-[#d4ff00]/40 text-[#d4ff00] bg-[#d4ff00]/10 font-semibold px-1.5 py-0.5">EST.</Badge>
                        </div>
                        {potentialEarnings ? (
                          <Table>
                            <TableBody>
                              {/* Payout Row */}
                              <TableRow className="border-slate-700/50 hover:bg-slate-800/30">
                                <TableCell className="py-2 text-[10px] text-blue-300 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <ArrowUpRight className="w-3 h-3 text-blue-400" />
                                    <span>Payout</span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-2 text-right">
                                  <div className="text-xs font-extrabold text-[#d4ff00]">
                                    {formatTokenAmount(potentialEarnings.payout, 'SWIPE')} SWIPE
                                  </div>
                                  {(() => {
                                    const usd = formatUsdValueLocal(potentialEarnings.payout, 'SWIPE');
                                    return usd ? (
                                      <div className="text-[9px] text-cyan-300 mt-0.5">
                                        ${usd}
                                      </div>
                                    ) : null;
                                  })()}
                                </TableCell>
                              </TableRow>
                              
                              {/* Profit Row */}
                              <TableRow className="border-slate-700/50 hover:bg-slate-800/30">
                                <TableCell className="py-2 text-[10px] text-emerald-300 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                                    <span>Profit</span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-2 text-right">
                                  <div className="text-xs font-extrabold text-[#d4ff00]">
                                    +{formatTokenAmount(potentialEarnings.profit, 'SWIPE')} SWIPE
                                  </div>
                                  <div className="text-[9px] text-amber-300 font-semibold mt-0.5">
                                    {potentialEarnings.profitPercent.toFixed(1)}% ROI
                                  </div>
                                </TableCell>
                              </TableRow>
                              
                              {/* Share of Pool Row */}
                              <TableRow className="border-slate-700/50 hover:bg-slate-800/30">
                                <TableCell className="py-2 text-[10px] text-blue-300 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <PieChart className="w-3 h-3 text-blue-400" />
                                    <span>Share of pool</span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-2 text-right">
                                  <div className="text-xs font-bold text-blue-300 mb-1">
                                    {potentialEarnings.sharePercent.toFixed(2)}%
                                  </div>
                                  <Progress value={Math.min(potentialEarnings.sharePercent, 100)} className="h-1.5 bg-slate-800/60" />
                                </TableCell>
                              </TableRow>
                              
                              {/* Pool After Bet Row */}
                              <TableRow className="border-slate-700/50 hover:bg-slate-800/30">
                                <TableCell className="py-2 text-[10px] text-purple-300 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <Info className="w-3 h-3 text-purple-400" />
                                    <span>Pool after bet</span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-2 text-right">
                                  <div className="text-xs font-bold text-purple-300">
                                    {formatTokenAmount(potentialEarnings.totalPoolAfter, 'SWIPE')} SWIPE
                                  </div>
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="text-center py-3 text-cyan-300 text-xs flex items-center justify-center gap-2">
                            <Info className="w-3.5 h-3.5 text-[#d4ff00]" />
                            <span>Enter an amount to preview potential payout</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
              </div>

          {/* Modern Footer Actions - Compact */}
          <DialogFooter className="p-4 pt-3 gap-2 border-t border-slate-800/80 bg-slate-900/40 backdrop-blur-sm">
            <Button
              variant="outline"
              onClick={handleCloseStakeModal}
              disabled={isTransactionLoading}
              className="flex-1 h-11 bg-slate-900/60 border-2 border-slate-700/60 hover:bg-slate-800/80 hover:border-slate-600 text-white font-semibold rounded-lg transition-all duration-200 backdrop-blur-sm text-sm"
            >
                  Cancel
            </Button>
            <Button
                  onClick={handleConfirmStake}
                  disabled={isTransactionLoading}
              className={`flex-1 h-11 font-bold text-sm rounded-lg transition-all duration-300 shadow-xl hover:scale-[1.02] active:scale-[0.98] ${
                stakeModal.selectedToken === 'ETH' 
                  ? 'bg-gradient-to-r from-[#d4ff00] via-[#b8e600] to-[#d4ff00] hover:from-[#c4ef00] hover:via-[#a8cc00] hover:to-[#c4ef00] text-black shadow-[#d4ff00]/30' 
                  : 'bg-gradient-to-r from-[#d4ff00] via-[#b8e600] to-[#d4ff00] hover:from-[#c4ef00] hover:via-[#a8cc00] hover:to-[#c4ef00] text-black shadow-[#d4ff00]/30'
              }`}
                >
                  {isTransactionLoading ? (
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin ${stakeModal.selectedToken === 'ETH' ? 'border-black' : 'border-black'}`} />
                  <span className="text-sm">Processing...</span>
                </div>
                  ) : (
                    (() => {
                      if (stakeModal.selectedToken === 'SWIPE') {
                        const amount = parseFloat(stakeModal.stakeAmount);
                    return (
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-4 h-4" />
                        <span className="text-sm">Approve & Bet {formatSwipeAmount(amount)} SWIPE</span>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-center gap-1.5">
                      <Target className="w-4 h-4" />
                      <span className="text-sm">Confirm Bet</span>
                    </div>
                  );
                    })()
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
                                  ? 'Strong signal — high confidence'
                                  : aiModal.confidence === 'MEDIUM'
                                  ? 'Moderate signal — consider risk tolerance'
                                  : 'Weak signal — proceed with caution'
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
      {currentCard && currentCard.id !== 0 && (
        <SharePreviewModal
          isOpen={sharePreviewModal.isOpen}
          onClose={handleShareModalClose}
          prediction={{
            id: getPredictionIdForShare(currentCard.id),
            question: currentCard.prediction,
            category: currentCard.category,
            totalPoolETH: transformedPredictions[currentIndex] 
              ? ((transformedPredictions[currentIndex].yesTotalAmount || 0) + (transformedPredictions[currentIndex].noTotalAmount || 0)) / 1e18 
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


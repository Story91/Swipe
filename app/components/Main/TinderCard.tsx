import React, { useState, useCallback, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import TinderCard from 'react-tinder-card';
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { ethers } from 'ethers';
import { CONTRACTS, SWIPE_TOKEN, getV2Contract, getContractForAction } from '../../../lib/contract';
import { useViewProfile, useComposeCast, useMiniKit } from '@coinbase/onchainkit/minikit';
import './TinderCard.css';
import './Dashboards.css';
import { NotificationSystem, showNotification, UserDashboard } from '../Portfolio/UserDashboard';
import { AdminDashboard } from '../Admin/AdminDashboard';
import { ApproverDashboard } from '../Approver/ApproverDashboard';
import { useHybridPredictions } from '../../../lib/hooks/useHybridPredictions';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useFarcasterProfiles } from '../../../lib/hooks/useFarcasterProfiles';
import SharePredictionButton from '../Actions/SharePredictionButton';
import { notifyPredictionShared, notifyStakeSuccess } from '../../../lib/notification-helpers';

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

const TinderCardComponent = forwardRef<{ refresh: () => void }, TinderCardProps>(({ items, activeDashboard: propActiveDashboard, onDashboardChange }, ref) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [loadingStates, setLoadingStates] = useState<{ [key: number]: boolean }>({});
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
  const { address } = useAccount();
  const { writeContract } = useWriteContract();
  const { composeCast } = useComposeCast();
  const { context } = useMiniKit();
  
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
  const { predictions: hybridPredictions, loading: predictionsLoading, error: predictionsError, refresh: refreshPredictions } = useHybridPredictions();
  
  // State for forcing re-render of time display
  const [timeUpdate, setTimeUpdate] = useState(0);
  
  // Update time display every second for real-time countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeUpdate(prev => prev + 1);
    }, 1000); // Update every second
    
    return () => clearInterval(interval);
  }, []);

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
  
  // Transform real predictions to match TinderCard format (memoized for performance)
  const realCardItems: PredictionData[] = useMemo(() => transformedPredictions.map((pred) => {
    const totalPool = (pred.yesTotalAmount || 0) + (pred.noTotalAmount || 0);
    const votingYes = totalPool > 0 ? Math.floor(((pred.yesTotalAmount || 0) / totalPool) * 100) : 50;

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
        // Calculate confidence based on real stake distribution
        const yesAmount = pred.yesTotalAmount || 0;
        const noAmount = pred.noTotalAmount || 0;
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
        const yesAmount = pred.yesTotalAmount || 0;
        const noAmount = pred.noTotalAmount || 0;
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
    const activeItems = allItems.filter((item, index) => {
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
    
    // Log only when the actual data changes, not every second
    if (activeItems.length > 0) {
      console.log(`📊 Total predictions: ${allItems.length}, Active predictions: ${activeItems.length}`);
    }
    return activeItems;
  }, [realCardItems, items, transformedPredictions]);



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
      if (amount < 10000) {
        alert('❌ Minimum stake is 10,000 SWIPE');
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
        onSuccess: async (tx) => {
          console.log('✅ ETH Stake transaction successful:', tx);
          showNotification('success', 'Stake Placed!', `Successfully staked ${amount} ETH on ${side}!`);
          
          // Auto-sync this specific prediction after stake
          try {
            console.log('🔄 Auto-syncing prediction after stake...');
            const syncResponse = await fetch('/api/blockchain/events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventType: 'stake_placed',
                predictionId: predictionId,
                contractVersion: 'V2'
              })
            });
            
            if (syncResponse.ok) {
              console.log('✅ Prediction auto-synced after stake - data updated in Redis');
              // No need for refresh - auto-sync handles data updates
            } else {
              console.warn('⚠️ Auto-sync failed after stake');
            }
          } catch (syncError) {
            console.error('❌ Failed to auto-sync after stake:', syncError);
          }
          
          await handleStakeSuccess();
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
        onSuccess: async (tx) => {
          console.log('✅ SWIPE Stake transaction successful:', tx);
          showNotification('success', 'Stake Placed!', `Successfully staked ${amount} SWIPE on ${side}!`);
          
          // Auto-sync this specific prediction after stake
          try {
            console.log('🔄 Auto-syncing prediction after stake...');
            const syncResponse = await fetch('/api/blockchain/events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventType: 'stake_placed',
                predictionId: predictionId,
                contractVersion: 'V2'
              })
            });
            
            if (syncResponse.ok) {
              console.log('✅ Prediction auto-synced after stake - data updated in Redis');
              // No need for refresh - auto-sync handles data updates
            } else {
              console.warn('⚠️ Auto-sync failed after stake');
            }
          } catch (syncError) {
            console.error('❌ Failed to auto-sync after stake:', syncError);
          }
          
          await handleStakeSuccess();
        },
        onError: (error) => {
          handleStakeError(error);
        }
      });
    }
  };

  // Helper function for stake success
  const handleStakeSuccess = async () => {
    // Data refresh is now handled by the auto-sync in onSuccess callbacks
    // No need for additional refresh - auto-sync handles it
    console.log('✅ Stake successful, auto-sync will handle data refresh');
    
    // Send Farcaster notification about successful stake
    try {
      const userFid = await getUserFid();
      if (userFid && lastStakedPrediction) {
        const stakeAmount = stakeModal.stakeAmount || '0.001';
        const outcome = stakeModal.isYes ? 'YES' : 'NO';
        
        await notifyStakeSuccess(
          userFid,
          lastStakedPrediction.title,
          stakeAmount,
          outcome
        );
      }
    } catch (error) {
      console.error('Failed to send stake success notification:', error);
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

  // Function to share prediction after stake
  const shareStakedPrediction = async (type: 'achievement' | 'challenge' | 'prediction' = 'achievement') => {
    if (!lastStakedPrediction) return;
    
    try {
      let shareText = '';
      const appUrl = window.location.origin; // Just the main app URL
      
      switch (type) {
        case 'achievement':
          shareText = `🎉 I just staked on: ${lastStakedPrediction.title}\n\n💰 Stake: ${lastStakedPrediction.price} ETH\n\nDo you dare predict the future? 🔮`;
          break;
        case 'challenge':
          shareText = `🏆 Challenge: Can you predict: ${lastStakedPrediction.title}?\n\n💰 Stake: ${lastStakedPrediction.price} ETH\n\nTry to beat my prediction! 🎯`;
          break;
        default:
          shareText = `🔮 I predict: ${lastStakedPrediction.title}\n💰 Stake: ${lastStakedPrediction.price} ETH\n\nJoin the game and create your own prediction! 🎯`;
      }
      
      await composeCast({
        text: shareText,
        embeds: [appUrl]
      });
      
      setShowSharePrompt(false);
      showNotification('success', 'Shared!', 'Your prediction has been shared on Farcaster! 🚀');
      
      // Send Farcaster notification if user has notifications enabled
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
    } catch (error) {
      console.error('Błąd podczas udostępniania:', error);
      showNotification('error', 'Sharing Error', 'Failed to share prediction. Please try again.');
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
    }

    showNotification('error', 'Stake Failed', errorMessage);
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
          fetch('/api/sync/claims')
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
          fetch('/api/sync/claims')
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
      stakeAmount: token === 'ETH' ? '0.00001' : '10000'
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
        
        // Execute approve transaction for exact amount
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
          args: [CONTRACTS.V2.address as `0x${string}`, amountWei],
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
    handleStakeBet(numericPredictionId, isYes, amount, selectedToken);

    // Close modal after a short delay to show loading
    setTimeout(() => {
      setStakeModal(prev => ({ ...prev, isOpen: false }));
      setIsTransactionLoading(false);

      // Show success animation
      const successMessage = `🎯 Successfully staked ${amount} ${selectedToken} on ${isYes ? 'YES' : 'NO'}!`;
      showNotification('success', 'Transaction Successful!', successMessage);
    }, 1500);
  };

  const handleCloseStakeModal = () => {
    setStakeModal(prev => ({ ...prev, isOpen: false }));
  };

  // Handle skip button click
  const handleSkip = (predictionId: number) => {
    console.log(`Skipping prediction ${predictionId}`);

    // Record the action
    setLastAction({
      type: 'skip',
      predictionId,
      direction: 'left',
      timestamp: Date.now()
    });

    // Show feedback
    setShowActionFeedback(true);

    // Hide feedback after 3 seconds
    setTimeout(() => {
      setShowActionFeedback(false);
    }, 3000);

    // Move to next card
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
    openStakeModal(direction, swipedId);
    
    // Move to next card
    setCurrentIndex(prev => {
      const next = prev + 1;
      // Reset to first card when reaching the end, or stay on last if only one card
      return cardItems.length <= 1 ? 0 : (next >= cardItems.length ? 0 : next);
    });
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
• Different minimum stakes: ETH (0.00001) vs SWIPE (10,000)

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
  
  // State for user stakes/votes
  const [userStakes, setUserStakes] = useState<{[userId: string]: 'YES' | 'NO' | 'BOTH' | 'NONE'}>({});
  const [stakesLoading, setStakesLoading] = useState(false);
  
  // State for copied addresses animation
  const [copiedAddresses, setCopiedAddresses] = useState<Set<string>>(new Set());
  
  // Fetch user stakes for current prediction
  useEffect(() => {
    const fetchUserStakes = async () => {
      if (!currentCard || !currentCard.id || !hybridPredictions) return;
      
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
      
      try {
        console.log(`🔍 Fetching stakes for prediction: ${predictionId}`);
        const response = await fetch(`/api/predictions/${predictionId}/stakes`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            const stakesMap: {[userId: string]: 'YES' | 'NO' | 'BOTH' | 'NONE'} = {};
            data.data.stakes.forEach((stake: any) => {
              stakesMap[stake.userId.toLowerCase()] = stake.vote;
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
  }, [currentCard?.id, hybridPredictions]); // Depend on both currentCard.id and hybridPredictions
  
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
    const envApprover = process.env.NEXT_PUBLIC_APPROVER_1?.toLowerCase();
    const envAdmin = process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase();

    const isEnvApprover = address && envApprover === address.toLowerCase();
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
          <div className="share-prompt-content">
            <div className="share-prompt-header">
              <div className="share-prompt-icon">🎉</div>
              <h3>Congratulations!</h3>
              <p>Your stake has been accepted!</p>
            </div>
            
            <div className="share-prompt-body">
              <p>Share your prediction on Farcaster and challenge your friends!</p>
            </div>
            
            <div className="share-prompt-actions">
              <button 
                onClick={() => shareStakedPrediction('achievement')}
                className="share-btn share-achievement"
              >
                🎉 Share Achievement
              </button>
              
              <button 
                onClick={() => shareStakedPrediction('challenge')}
                className="share-btn share-challenge"
              >
                🏆 Challenge Friends
              </button>
              
              <button 
                onClick={() => shareStakedPrediction('prediction')}
                className="share-btn share-prediction"
              >
                🔮 Share Prediction
              </button>
              
              <button 
                onClick={() => setShowSharePrompt(false)}
                className="share-btn share-skip"
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tinder Card */}
      <div className="card-container">
        <TinderCard
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

      {/* Action Buttons - moved under Tinder card */}
      <div className="action-buttons-section">
        <button
          className="tutorial-button"
          disabled
        >
          <div className="swipe-animation">
            <div className="swipe-icon">👈</div>
            <div className="swipe-icon">👉</div>
          </div>
        </button>
        
        <div className="or-text">OR</div>
        
        <button
          className="skip-button"
          onClick={() => handleSkip(currentCard.id)}
        >
          SKIP
        </button>
      </div>

             {/* Prediction Details Below Card */}
       <div className="prediction-details">
         <div className="details-header">
           <h4>Prediction Analysis</h4>
           <span className="card-number">ID: {currentCard.id} | {currentIndex + 1} / {cardItems.length}</span>
         </div>
         <p className="prediction-description">{currentCard.description}</p>
         <div className="prediction-stats">
           <div className="stat">
             <Badge variant="outline" className="stat-label-badge">Category</Badge>
             <Badge variant="secondary" className="stat-value-badge">{currentCard.category}</Badge>
           </div>
           <div className="stat">
             <Badge variant="outline" className="stat-label-badge">Time Left</Badge>
             <Badge variant="secondary" className={`stat-value-badge font-semibold ${getTimeUrgencyClass(transformedPredictions[currentIndex]?.deadline || 0)}`}>
               {currentCard.timeframe}
             </Badge>
           </div>
           <div className="stat">
             <Badge variant="outline" className="stat-label-badge">Total Staked</Badge>
             <Badge variant="secondary" className="stat-value-badge">{(() => {
               const total = ((transformedPredictions[currentIndex]?.yesTotalAmount || 0) + (transformedPredictions[currentIndex]?.noTotalAmount || 0)) / 1e18;
               return total > 0 ? total.toFixed(5) : '0.00000';
             })()} ETH</Badge>
           </div>

         </div>
         
         {/* New Charts and Diagrams Section */}
         <div className="charts-section">
           {/* Confidence Progress */}
           <div className="chart-item">
             <div className="chart-title">Confidence Level</div>
             <div className="chart-value">{currentCard.confidence}%</div>
             <div className="progress-bar">
               <div 
                 className="progress-fill" 
                 style={{ width: `${currentCard.confidence}%` }}
               ></div>
             </div>
             <div className="chart-subtitle">Success Probability</div>
           </div>
           
           {/* Risk Assessment */}
           <div className="chart-item">
             <div className="chart-title">Risk Level</div>
             <div className="chart-value">
               {(() => {
                 const confidence = currentCard.confidence;
                 const totalStaked = ((transformedPredictions[currentIndex]?.yesTotalAmount || 0) + (transformedPredictions[currentIndex]?.noTotalAmount || 0)) / 1e18;
                 const participantCount = transformedPredictions[currentIndex]?.participants || 0;
                 
                 // Calculate risk based on multiple factors
                 let riskScore = 0;
                 let factors = [];
                 
                 // Confidence factor (lower confidence = higher risk)
                 const confidenceRisk = (100 - confidence) * 0.4;
                 riskScore += confidenceRisk;
                 factors.push(`Conf: ${confidenceRisk.toFixed(1)}`);
                 
                 // Liquidity factor (less staked = higher risk)
                 let liquidityRisk = 0;
                 if (totalStaked < 0.1) liquidityRisk = 30;
                 else if (totalStaked < 1) liquidityRisk = 15;
                 else if (totalStaked < 5) liquidityRisk = 5;
                 riskScore += liquidityRisk;
                 factors.push(`Liq: ${liquidityRisk}`);
                 
                 // Participation factor (fewer participants = higher risk)
                 let participationRisk = 0;
                 if (participantCount < 3) participationRisk = 20;
                 else if (participantCount < 10) participationRisk = 10;
                 riskScore += participationRisk;
                 factors.push(`Part: ${participationRisk}`);
                 
                 // Time factor (less time = higher risk due to volatility)
                 const now = Date.now() / 1000;
                 const timeLeft = (transformedPredictions[currentIndex]?.deadline || 0) - now;
                 let timeRisk = 0;
                 if (timeLeft < 3600) timeRisk = 25; // Less than 1 hour
                 else if (timeLeft < 86400) timeRisk = 15; // Less than 1 day
                 riskScore += timeRisk;
                 factors.push(`Time: ${timeRisk}`);
                 
                 // Determine risk level
                 let riskLevel = 'Low';
                 if (riskScore >= 60) riskLevel = 'High';
                 else if (riskScore >= 30) riskLevel = 'Medium';
                 
                 return (
                   <div className="risk-details">
                     <div className="risk-level">{riskLevel}</div>
                     <div className="risk-score">{Math.round(riskScore)} pts</div>
                     <div className="risk-breakdown">{factors.join(' | ')}</div>
                   </div>
                 );
               })()}
             </div>
             <div className="progress-bar">
               <div 
                 className="progress-fill" 
                 style={{ 
                   width: `${100 - currentCard.confidence}%`,
                   background: currentCard.confidence > 80 ? 
                     'linear-gradient(90deg, #10b981, #34d399)' : 
                     currentCard.confidence > 60 ? 
                     'linear-gradient(90deg, #f59e0b, #fbbf24)' : 
                     'linear-gradient(90deg, #ef4444, #f87171)'
                 }}
               ></div>
             </div>
             <div className="chart-subtitle">Investment Risk</div>
           </div>
           
           {/* YES/NO Breakdown */}
           <div className="chart-item">
             <div className="chart-title">YES/NO Split</div>
             
             {/* Real-time YES/NO amounts with equal styling */}
             <div className="yes-no-amounts">
               <div className="amount-item yes-amount">
                 <span className="amount-label">YES</span>
                 <span className="amount-value">
                   {(() => {
                     const amount = (transformedPredictions[currentIndex]?.yesTotalAmount || 0) / 1e18;
                     return amount > 0 ? amount.toFixed(5) : '0.00000';
                   })()} ETH
                 </span>
               </div>
               <div className="amount-item no-amount">
                 <span className="amount-label">NO</span>
                 <span className="amount-value">
                   {(() => {
                     const amount = (transformedPredictions[currentIndex]?.noTotalAmount || 0) / 1e18;
                     return amount > 0 ? amount.toFixed(5) : '0.00000';
                   })()} ETH
                 </span>
               </div>
             </div>
             
             {/* Real proportional visualization */}
             <div className="proportional-chart">
               {(() => {
                 const yesAmount = transformedPredictions[currentIndex]?.yesTotalAmount || 0;
                 const noAmount = transformedPredictions[currentIndex]?.noTotalAmount || 0;
                 const totalAmount = yesAmount + noAmount;
                 
                 if (totalAmount === 0) {
                   return (
                     <div className="no-stakes">
                       <div className="no-stakes-text">No stakes yet</div>
                       <div className="no-stakes-bar">
                         <div className="no-stakes-fill"></div>
                       </div>
                     </div>
                   );
                 }
                 
                 const yesPercentage = (yesAmount / totalAmount) * 100;
                 const noPercentage = (noAmount / totalAmount) * 100;
                 
                 return (
                   <div className="split-visualization">
                     <div className="split-bar">
                       <div 
                         className="split-yes" 
                         style={{ width: `${yesPercentage}%` }}
                         title={`YES: ${yesPercentage.toFixed(1)}%`}
                       ></div>
                       <div 
                         className="split-no" 
                         style={{ width: `${noPercentage}%` }}
                         title={`NO: ${noPercentage.toFixed(1)}%`}
                       ></div>
                     </div>
                     <div className="split-percentages">
                       <span className="yes-percentage">{yesPercentage.toFixed(1)}%</span>
                       <span className="no-percentage">{noPercentage.toFixed(1)}%</span>
                     </div>
                   </div>
                 );
               })()}
             </div>
           </div>
           
           {/* SWIPE Pool */}
           <div className="chart-item">
             <div className="chart-title">SWIPE Pool</div>
             
             {/* SWIPE YES/NO amounts */}
             <div className="yes-no-amounts">
               <div className="amount-item yes-amount">
                 <span className="amount-label">YES</span>
                 <span className="amount-value">
                   {((transformedPredictions[currentIndex]?.swipeYesTotalAmount || 0) / 1e18).toFixed(0)} SWIPE
                 </span>
               </div>
               <div className="amount-item no-amount">
                 <span className="amount-label">NO</span>
                 <span className="amount-value">
                   {((transformedPredictions[currentIndex]?.swipeNoTotalAmount || 0) / 1e18).toFixed(0)} SWIPE
                 </span>
               </div>
             </div>
             
             {/* SWIPE proportional visualization */}
             <div className="proportional-chart">
               {(() => {
                 const yesAmount = transformedPredictions[currentIndex]?.swipeYesTotalAmount || 0;
                 const noAmount = transformedPredictions[currentIndex]?.swipeNoTotalAmount || 0;
                 const totalAmount = yesAmount + noAmount;
                 
                 if (totalAmount === 0) {
                   return (
                     <div className="no-stakes">
                       <div className="no-stakes-text">No SWIPE stakes yet</div>
                       <div className="no-stakes-bar">
                         <div className="no-stakes-fill"></div>
                       </div>
                     </div>
                   );
                 }
                 
                 const yesPercentage = (yesAmount / totalAmount) * 100;
                 const noPercentage = (noAmount / totalAmount) * 100;
                 
                 return (
                   <div className="split-visualization">
                     <div className="split-bar">
                       <div 
                         className="split-yes" 
                         style={{ width: `${yesPercentage}%` }}
                         title={`YES: ${yesPercentage.toFixed(1)}%`}
                       ></div>
                       <div 
                         className="split-no" 
                         style={{ width: `${noPercentage}%` }}
                         title={`NO: ${noPercentage.toFixed(1)}%`}
                       ></div>
                     </div>
                     <div className="split-percentages">
                       <span className="yes-percentage">{yesPercentage.toFixed(1)}%</span>
                       <span className="no-percentage">{noPercentage.toFixed(1)}%</span>
                     </div>
                   </div>
                 );
               })()}
             </div>
           </div>

           {/* Swipers */}
           <div className="chart-item">
             <div className="chart-title">Active Swipers</div>
             {(() => {
               const participantCount = currentCardParticipants.length;
               
               return (
                 <>
                   <div className="chart-value">
                     {participantCount}
                   </div>
                   <div className="swipers-visualization">
                     {participantCount === 0 ? (
                       <div className="no-swipers">
                         <div className="no-swipers-text">No swipers yet</div>
                         <div className="no-swipers-bar">
                           <div className="no-swipers-fill"></div>
                         </div>
                       </div>
                     ) : (
                       <>
                         {/* Show actual swiper avatars based on real participants */}
                         <div className="swipers-avatars-horizontal">
                           {profilesLoading ? (
                             <div className="loading-swipers">
                               <div className="loading-logo-container">
                                 <div className="loading-logo-spin"></div>
                               </div>
                               <div className="loading-text">Loading profiles...</div>
                             </div>
                           ) : (
                            currentCardParticipants.map((participantAddress, i) => {
                              const profile = profiles.find((p: any) => p && p.address === participantAddress);
                              const hasFarcasterProfile = profile && profile.fid !== null && !profile.isWalletOnly;
                               
                               // Get initials from profile or address
                               const getInitials = () => {
                                 if (hasFarcasterProfile && profile?.display_name) {
                                   return profile.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                                 }
                                 return participantAddress.slice(2, 4).toUpperCase();
                               };

                               // Get avatar color based on address
                               const getAvatarColor = (addr: string) => {
                                 const colors = [
                                   'bg-blue-500',
                                   'bg-green-500', 
                                   'bg-purple-500',
                                   'bg-pink-500',
                                   'bg-yellow-500',
                                   'bg-red-500',
                                   'bg-indigo-500',
                                   'bg-teal-500'
                                 ];
                                 const hash = addr.split('').reduce((a, b) => {
                                   a = ((a << 5) - a) + b.charCodeAt(0);
                                   return a & a;
                                 }, 0);
                                 return colors[Math.abs(hash) % colors.length];
                               };
                               
                               // Get user's vote from stakes
                               const userVote = userStakes[participantAddress.toLowerCase()] || 'NONE';
                               
                               // Determine vote indicator styling
                               const getVoteIndicatorClass = () => {
                                 switch (userVote) {
                                   case 'YES':
                                     return 'vote-yes';
                                   case 'NO':
                                     return 'vote-no';
                                   case 'BOTH':
                                     return 'vote-both';
                                   default:
                                     return 'vote-none';
                                 }
                               };
                               
                               const getVoteIcon = () => {
                                 switch (userVote) {
                                   case 'YES':
                                     return '✓';
                                   case 'NO':
                                     return '✗';
                                   case 'BOTH':
                                     return '±';
                                   default:
                                     return '';
                                 }
                               };
                               
                              return (
                                <div key={`${participantAddress}-${i}`} className="relative">
                                   <div className={`vote-indicator ${getVoteIndicatorClass()}`}>
                                     <Avatar
                                       className={hasFarcasterProfile 
                                         ? "cursor-pointer hover:scale-110 transition-all duration-300 shadow-lg hover:shadow-xl border-2 border-white/20 hover:border-blue-400/60 ring-2 ring-blue-500/20 hover:ring-blue-400/40"
                                         : "cursor-pointer hover:scale-105 transition-all duration-300 shadow-md border-2 border-gray-300 hover:border-gray-400"
                                       }
                                       onClick={() => {
                                         if (!hasFarcasterProfile) {
                                           // For wallet-only users, copy address to clipboard
                                           navigator.clipboard.writeText(participantAddress);
                                           console.log(`Copied wallet address: ${participantAddress}`);
                                           
                                           // Show copied animation
                                           setCopiedAddresses(prev => new Set(prev).add(participantAddress));
                                           setTimeout(() => {
                                             setCopiedAddresses(prev => {
                                               const newSet = new Set(prev);
                                               newSet.delete(participantAddress);
                                               return newSet;
                                             });
                                           }, 2000); // Hide after 2 seconds
                                           return;
                                         }
                                         
                                         console.log(`Clicked on swiper: ${participantAddress}`);
                                         console.log(`Profile: ${profile.display_name} (@${profile.username})`);
                                         
                                         // Open Farcaster profile using OnchainKit
                                         try {
                                           if (profile.fid) {
                                             const fidNumber = parseInt(profile.fid, 10);
                                             console.log(`Opening Farcaster profile with FID: ${fidNumber}`);
                                             viewProfile(fidNumber);
                                           } else {
                                             console.log(`No FID available for profile`);
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
                                         <span className="text-white text-xs font-semibold">
                                           {getInitials()}
                                         </span>
                                       </AvatarFallback>
                                     </Avatar>
                                     {/* Vote indicator */}
                                     {userVote !== 'NONE' && (
                                       <div className="vote-badge">
                                         <span className="vote-icon">{getVoteIcon()}</span>
                                       </div>
                                     )}
                                   </div>
                                   {/* Base verification indicator */}
                                   {hasFarcasterProfile && profile?.isBaseVerified && (
                                     <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center">
                                       <span className="text-white text-xs font-bold">B</span>
                                     </div>
                                   )}
                                   {/* Copied animation for wallet-only users */}
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
                       </>
                     )}
                   </div>
                   <div className="chart-subtitle">Click avatars to view profiles</div>
                 </>
               );
             })()}
           </div>
         </div>
        </div>

      {/* Modern Prediction Modal */}
      {stakeModal.isOpen && (
        <div className="modern-modal-overlay" onClick={handleCloseStakeModal}>
          <div className="modern-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modern-modal-header">
              <div className="modal-title">
                <span className="prediction-number">#{stakeModal.predictionId}</span>
                <span className="modal-subtitle">Prediction Market</span>
              </div>
              <button className="modern-close-btn" onClick={handleCloseStakeModal}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="modern-modal-content">
              <div className="prediction-choice">
                <div className={`choice-badge ${stakeModal.isYes ? 'yes' : 'no'}`}>
                  <span className="choice-icon">{stakeModal.isYes ? '↑' : '↓'}</span>
                  <span className="choice-text">{stakeModal.isYes ? 'YES' : 'NO'}</span>
                </div>
              </div>

              <div className="amount-section">
                {/* Token Selection */}
                <div className="token-selection">
                  <div className="token-options">
                    <button
                      className={`token-option ${stakeModal.selectedToken === 'ETH' ? 'active' : ''}`}
                      onClick={() => handleTokenChange('ETH')}
                    >
                      <div className="token-logo-container">
                        <img src="/eth.png" alt="ETH" className="token-logo" />
                      </div>
                      <span className="token-name">ETH</span>
                      <span className="token-limit">0.00001 - 100</span>
                    </button>
                    <button
                      className={`token-option ${stakeModal.selectedToken === 'SWIPE' ? 'active' : ''}`}
                      onClick={() => handleTokenChange('SWIPE')}
                    >
                      <div className="token-logo-container">
                        <img src="/logo.png" alt="SWIPE" className="token-logo swipe-logo" />
                      </div>
                      <span className="token-name">$SWIPE</span>
                      <span className="token-limit">10,000+</span>
                    </button>
                  </div>
                </div>

                {/* Amount Input */}
                <div className="amount-input-section">
                  <div className="amount-display">
                    <input
                      type="number"
                      className="amount-input"
                      value={stakeModal.stakeAmount}
                      onChange={(e) => handleStakeAmountChange(e.target.value)}
                      min={stakeModal.selectedToken === 'ETH' ? '0.00001' : '10000'}
                      step={stakeModal.selectedToken === 'ETH' ? '0.00001' : '1000'}
                      placeholder={stakeModal.selectedToken === 'ETH' ? '0.00001' : '10000'}
                    />
                    <span className="amount-currency">{stakeModal.selectedToken}</span>
                  </div>
                  <div className="amount-description">
                    {stakeModal.selectedToken === 'ETH' 
                      ? 'Minimum: 0.00001 ETH, Maximum: 100 ETH'
                      : 'Minimum: 10,000 SWIPE, Maximum: Unlimited'
                    }
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button className="modern-cancel-btn" onClick={handleCloseStakeModal} disabled={isTransactionLoading}>
                  Cancel
                </button>
                <button
                  className={`modern-confirm-btn ${isTransactionLoading ? 'loading' : ''}`}
                  onClick={handleConfirmStake}
                  disabled={isTransactionLoading}
                >
                  {isTransactionLoading ? (
                    <>
                      <div className="modern-spinner"></div>
                      Processing...
                    </>
                  ) : (
                    (() => {
                      // Check if SWIPE needs approval
                      if (stakeModal.selectedToken === 'SWIPE') {
                        const amount = parseFloat(stakeModal.stakeAmount);
                        const amountWei = BigInt(Math.floor(amount * 10**18));
                        let currentAllowance = BigInt(0);
                        
                        try {
                          if (swipeAllowance !== undefined && swipeAllowance !== null) {
                            currentAllowance = BigInt(swipeAllowance.toString());
                          }
                        } catch (e) {
                          currentAllowance = BigInt(0);
                        }
                        
                        console.log('=== BUTTON TEXT DEBUG ===');
                        console.log('Amount:', amount);
                        console.log('AmountWei:', amountWei.toString());
                        console.log('CurrentAllowance:', currentAllowance.toString());
                        console.log('Needs approval?', currentAllowance < amountWei);
                        console.log('========================');
                        
                        // TEMPORARY: Always show approve for SWIPE to test
                        return `Approve ${amount} SWIPE`;
                      }
                      return 'Confirm Stake';
                    })()
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Notification System */}
      <NotificationSystem />
      </div>
    );
  });

TinderCardComponent.displayName = 'TinderCardComponent';

export default TinderCardComponent;


import React, { useState, useCallback, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import TinderCard from 'react-tinder-card';
import { useAccount, useWriteContract } from "wagmi";
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../lib/contract';
import './TinderCard.css';
import './Dashboards.css';
import { NotificationSystem, showNotification, UserDashboard } from '../Portfolio/UserDashboard';
import { AdminDashboard } from '../Admin/AdminDashboard';
import { ApproverDashboard } from '../Approver/ApproverDashboard';
import { useHybridPredictions } from '../../../lib/hooks/useHybridPredictions';

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
function formatTimeLeft(deadline: number): string {
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
  }>({
    isOpen: false,
    predictionId: 0,
    isYes: true,
    stakeAmount: '0.001'
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
  const { address } = useAccount();
  const { writeContract } = useWriteContract();
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);

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

  // Expose refresh function to parent component via ref
  useImperativeHandle(ref, () => ({
    refresh: refreshPredictions
  }), []); // Remove dependency to prevent re-creation
  
  // Open stake modal after swipe
  const openStakeModal = useCallback((direction: string, predictionId: number) => {
    const isYes = direction === 'right';
    // Opening stake modal

    setStakeModal({
      isOpen: true,
      predictionId,
      isYes,
      stakeAmount: '0.001'
    });
  }, []);

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
    id: typeof pred.id === 'string' ? parseInt(pred.id.replace('pred_', ''), 10) || Date.now() : (pred.id || Date.now()),
    question: pred.question,
    category: pred.category,
    yesTotalAmount: pred.yesTotalAmount,
    noTotalAmount: pred.noTotalAmount,
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
            return idStr.startsWith('pred_')
              ? parseInt(idStr.replace('pred_', ''), 10) || Date.now()
              : parseInt(idStr, 10) || Date.now();
          })()
        : (pred.id || Date.now()),
      title: (pred.question || 'Unknown prediction').length > 50 ? (pred.question || 'Unknown prediction').substring(0, 50) + '...' : (pred.question || 'Unknown prediction'),
      image: pred.includeChart && pred.selectedCrypto 
        ? `https://www.geckoterminal.com/eth/pools/${pred.selectedCrypto.toLowerCase()}?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=f1f5f9`
        : pred.imageUrl || (() => {
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
        // Calculate confidence based on real data
        const yesAmount = pred.yesTotalAmount || 0;
        const noAmount = pred.noTotalAmount || 0;
        const totalAmount = yesAmount + noAmount;
        
        if (totalAmount === 0) {
          return 50; // Neutral confidence when no stakes
        }
        
        // Confidence based on stake distribution
        const yesPercentage = (yesAmount / totalAmount) * 100;
        
        // Factor in time remaining (more time = more uncertainty)
        const now = Date.now() / 1000;
        const timeLeft = pred.deadline - now;
        const timeFactor = Math.min(timeLeft / (24 * 60 * 60), 1); // Max 1 day factor
        
                 // Factor in number of participants (more participants = more confidence)
         const participantCount = pred.participants || 0;
         const participantFactor = Math.min(participantCount / 10, 1); // Max 10 participants factor
        
        // Calculate final confidence
        let confidence = yesPercentage;
        
        // Adjust based on time (less time = more confidence in current trend)
        confidence += (1 - timeFactor) * 10;
        
        // Adjust based on participants (more participants = more confidence)
        confidence += participantFactor * 5;
        
        // Ensure confidence is between 20-90%
        return Math.max(20, Math.min(90, Math.round(confidence)));
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
        const hpId = typeof hp.id === 'string' ? parseInt(hp.id.replace('pred_', ''), 10) || Date.now() : (hp.id || Date.now());
        return hpId === pred.id;
      })?.participants || []
    };
  }), [transformedPredictions, timeUpdate]);





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
    
    console.log(`📊 Total predictions: ${allItems.length}, Active predictions: ${activeItems.length}`);
    return activeItems;
  }, [realCardItems, items, transformedPredictions]);



  // Dashboard handlers
  const handleStakeBet = (predictionId: number, isYes: boolean, amount: number) => {
    if (amount < 0.001) {
      alert('❌ Minimum stake is 0.001 ETH');
      return;
    }
    if (amount > 100) {
      alert('❌ Maximum stake is 100 ETH');
      return;
    }

    // Check if user is trying to bet on their own prediction
    const currentPrediction = cardItems.find(card => card.id === predictionId);
    if (currentPrediction && address && currentPrediction.creator && currentPrediction.creator.toLowerCase() === address.toLowerCase()) {
      alert('❌ You cannot bet on your own prediction!');
      return;
    }

    const side = isYes ? 'YES' : 'NO';

    // Staking ETH



    // Execute real transaction with the smart contract
    writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'placeStake',
      args: [BigInt(predictionId), isYes],
      value: ethers.parseEther(amount.toString()),
    }, {
      onSuccess: async (tx) => {
        console.log('✅ Stake transaction successful:', tx);
        showNotification('success', 'Stake Placed!', `Successfully staked ${amount} ETH on ${side}!`);
        
        // Sync updated data from blockchain to Redis (only after transactions)
        try {
          console.log('🔄 Syncing updated prediction data after stake...');
          const syncResponse = await fetch('/api/sync');
          if (syncResponse.ok) {
            console.log('✅ Prediction data synced successfully');
            // Refresh predictions data
            if (refreshPredictions) {
              refreshPredictions();
            }
          } else {
            console.warn('⚠️ Failed to sync prediction data');
          }
        } catch (syncError) {
          console.warn('⚠️ Sync request failed:', syncError);
        }
        
        // Trigger data refresh as fallback
        setTimeout(() => {
          if (refreshPredictions) {
            refreshPredictions();
          }
        }, 3000);
      },
      onError: (error) => {
        console.error('❌ Stake transaction failed:', error);

        let errorMessage = 'Failed to place stake. Please try again.';

        if (error?.message?.includes('insufficient funds')) {
          errorMessage = '❌ Insufficient funds for this transaction.';
        } else if (error?.message?.includes('gas')) {
          errorMessage = '❌ Gas estimation failed. Please try again.';
        } else if (error?.message?.includes('execution reverted')) {
          errorMessage = '❌ Transaction reverted by contract.';
        }

        showNotification('error', 'Stake Failed', errorMessage);
      }
    });
  };

  const handleClaimReward = (predictionId: number) => {
    // Claiming reward

    // Execute real claim reward transaction
    writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'claimReward',
      args: [BigInt(predictionId)],
    }, {
      onSuccess: () => {
        // Reward claimed successfully
        // Auto-refresh data after successful transaction
        setTimeout(() => {
          if (refreshPredictions) {
            refreshPredictions();
          }
        }, 3000);
      },
      onError: (error) => {
        console.error('❌ Claim reward transaction failed:', error);
        alert('❌ Claim failed. Please try again.');
      }
    });
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
          setTimeout(() => {
            if (refreshPredictions) {
              refreshPredictions();
            }
          }, 1000);
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
      // Handle on-chain prediction
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'resolvePrediction',
        args: [BigInt(predictionId), outcome],
      }, {
        onSuccess: () => {
          console.log(`✅ Prediction ${predictionId} resolved successfully`);
          setTimeout(() => {
            if (refreshPredictions) {
              refreshPredictions();
            }
          }, 3000);
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
          setTimeout(() => {
            if (refreshPredictions) {
              refreshPredictions();
            }
          }, 1000);
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
      // Handle on-chain prediction
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'cancelPrediction',
        args: [BigInt(predictionId), reason],
      }, {
        onSuccess: () => {
          console.log(`✅ Prediction ${predictionId} cancelled successfully`);
          setTimeout(() => {
            if (refreshPredictions) {
              refreshPredictions();
            }
          }, 3000);
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

    // Execute real approve prediction transaction
    writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'approvePrediction',
      args: [BigInt(predictionId)],
    }, {
      onSuccess: async () => {
        console.log(`✅ Prediction ${predictionId} approved successfully`);

        // Sync updated prediction to Redis
        try {
          console.log('🔄 Syncing approved prediction to Redis...');
          const syncResponse = await fetch('/api/sync');
          if (syncResponse.ok) {
            console.log('✅ Prediction approval synced to Redis successfully');
          } else {
            console.warn('⚠️ Failed to sync prediction approval to Redis');
          }
        } catch (syncError) {
          console.warn('⚠️ Sync request failed:', syncError);
        }

        setTimeout(() => {
          if (refreshPredictions) {
            refreshPredictions();
          }
        }, 3000);
      },
      onError: (error) => {
        console.error('❌ Approve prediction failed:', error);
        alert('❌ Approval failed. Please try again.');
      }
    });
  };

  const handleRejectPrediction = (predictionId: number, reason: string) => {
    console.log(`❌ Rejecting prediction ${predictionId} with reason: ${reason}`);

    // Execute real reject prediction transaction
    writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'rejectPrediction',
      args: [BigInt(predictionId), reason],
    }, {
      onSuccess: () => {
        console.log(`✅ Prediction ${predictionId} rejected successfully`);
        setTimeout(() => {
          if (refreshPredictions) {
            refreshPredictions();
          }
        }, 3000);
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

    // Execute real withdraw fees transaction
    writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'withdrawFees',
    });
  };

  const handlePauseContract = () => {
    console.log('⏸️ Pausing contract...');

    // Execute real pause contract transaction
    writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'pause',
    });
  };

  // Stake modal handlers
  const handleStakeAmountChange = (amount: string) => {
    setStakeModal(prev => ({ ...prev, stakeAmount: '0.001' }));
  };

  const handleConfirmStake = () => {
    const { predictionId, isYes, stakeAmount } = stakeModal;
    const amount = parseFloat(stakeAmount);

    if (amount < 0.001) {
      alert('❌ Minimum stake is 0.001 ETH');
      return;
    }
    if (amount > 100) {
      alert('❌ Maximum stake is 100 ETH');
      return;
    }

    // Set loading state
    setIsTransactionLoading(true);

    // predictionId is already a number, no conversion needed
    const numericPredictionId = predictionId;

    // Call the stake handler from dashboard
    handleStakeBet(numericPredictionId, isYes, amount);

    // Close modal after a short delay to show loading
    setTimeout(() => {
      setStakeModal(prev => ({ ...prev, isOpen: false }));
      setIsTransactionLoading(false);

      // Show success animation
      const successMessage = `🎯 Successfully staked ${amount} ETH on ${isYes ? 'YES' : 'NO'}!`;
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

  const currentCard = cardItems[currentIndex];
  
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
        <div style={{ textAlign: 'center', padding: '60px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '16px' }}>🔄</div>
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
                {lastAction.type === 'skip' ? 'Skipped' : 'Bet Placed'}
              </div>
              <div className="feedback-subtitle">
                {lastAction.type === 'skip'
                  ? 'Prediction skipped'
                  : `Betting ${lastAction.direction === 'right' ? 'YES' : 'NO'}`
                }
              </div>
            </div>
            <div className="feedback-prediction">
              ID: {lastAction.predictionId}
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
          preventSwipe={['up', 'down']}
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
                   <div className="price-info">
                     <span className="price">{currentCard.price}</span>
                     <span className={`change ${currentCard.change.startsWith('+') ? 'positive' : 'negative'}`}>
                       {currentCard.change}
                     </span>
                     <span className="voters-info">👥 {transformedPredictions[currentIndex]?.participants || 0}</span>
                   </div>
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
             <span className="stat-label">Category</span>
             <span className="stat-value">{currentCard.category}</span>
           </div>
           <div className="stat">
             <span className="stat-label">Time Left</span>
             <span className={`stat-value font-semibold ${getTimeUrgencyClass(transformedPredictions[currentIndex]?.deadline || 0)}`}>
               {currentCard.timeframe}
             </span>
           </div>
           <div className="stat">
             <span className="stat-label">Total Staked</span>
             <span className="stat-value">{(((transformedPredictions[currentIndex]?.yesTotalAmount || 0) + (transformedPredictions[currentIndex]?.noTotalAmount || 0)) / 1e18).toFixed(4)} ETH</span>
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
           
           {/* Voters Count */}
           <div className="chart-item">
             <div className="chart-title">Swipers</div>
             <div className="chart-value">
               {transformedPredictions[currentIndex]?.participants || 0}
             </div>
             <div className="swipers-visualization">
               {(() => {
                 const participantCount = transformedPredictions[currentIndex]?.participants || 0;
                 
                 if (participantCount === 0) {
                   return (
                     <div className="no-swipers">
                       <div className="no-swipers-text">No swipers yet</div>
                       <div className="no-swipers-bar">
                         <div className="no-swipers-fill"></div>
                       </div>
                     </div>
                   );
                 }
                 
                 // Show actual swiper dots based on real count
                 const maxDots = 5; // Maximum dots to show
                 const dotsToShow = Math.min(participantCount, maxDots);
                 
                 return (
                   <div className="swipers-dots">
                     {Array.from({ length: maxDots }, (_, i) => (
                       <div 
                         key={i}
                         className={`swiper-dot ${i < dotsToShow ? 'active' : 'inactive'}`}
                         style={{ 
                           left: `${(i / (maxDots - 1)) * 80 + 10}%`,
                           animationDelay: `${i * 0.1}s`
                         }}
                       ></div>
                     ))}
                     {participantCount > maxDots && (
                       <div className="more-swipers">+{participantCount - maxDots}</div>
                     )}
                   </div>
                 );
               })()}
             </div>
             <div className="chart-subtitle">Active Swipers</div>
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
                 
                 // Confidence factor (lower confidence = higher risk)
                 riskScore += (100 - confidence) * 0.4;
                 
                 // Liquidity factor (less staked = higher risk)
                 if (totalStaked < 0.1) riskScore += 30;
                 else if (totalStaked < 1) riskScore += 15;
                 else if (totalStaked < 5) riskScore += 5;
                 
                 // Participation factor (fewer participants = higher risk)
                 if (participantCount < 3) riskScore += 20;
                 else if (participantCount < 10) riskScore += 10;
                 
                 // Time factor (less time = higher risk due to volatility)
                 const now = Date.now() / 1000;
                 const timeLeft = (transformedPredictions[currentIndex]?.deadline || 0) - now;
                 if (timeLeft < 3600) riskScore += 25; // Less than 1 hour
                 else if (timeLeft < 86400) riskScore += 15; // Less than 1 day
                 
                 // Determine risk level
                 if (riskScore < 30) return 'Low';
                 else if (riskScore < 60) return 'Medium';
                 else return 'High';
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
                   {((transformedPredictions[currentIndex]?.yesTotalAmount || 0) / 1e18).toFixed(4)} ETH
                 </span>
               </div>
               <div className="amount-item no-amount">
                 <span className="amount-label">NO</span>
                 <span className="amount-value">
                   {((transformedPredictions[currentIndex]?.noTotalAmount || 0) / 1e18).toFixed(4)} ETH
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
                <div className="amount-display">
                  <span className="amount-value">0.001</span>
                  <span className="amount-currency">ETH</span>
                </div>
                <div className="amount-description">
                  Minimum participation amount
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
                    'Confirm'
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


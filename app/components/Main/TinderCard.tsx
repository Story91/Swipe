import React, { useState, useCallback, useEffect } from 'react';
import TinderCard from 'react-tinder-card';
import { useAccount, useWriteContract } from "wagmi";
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../lib/contract';
import './TinderCard.css';
import './Dashboards.css';
import { NotificationSystem, showNotification, UserDashboard } from '../Portfolio/UserDashboard';
import { AdminDashboard } from '../Admin/AdminDashboard';
import { ApproverDashboard } from '../Approver/ApproverDashboard';

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
}

interface TinderCardProps {
  items?: PredictionData[];
  activeDashboard?: 'tinder' | 'user' | 'admin' | 'approver';
  onDashboardChange?: (dashboard: 'tinder' | 'user' | 'admin' | 'approver') => void;
}

type DashboardType = 'tinder' | 'user' | 'admin' | 'approver';

export default function TinderCardComponent({ items, activeDashboard: propActiveDashboard, onDashboardChange }: TinderCardProps) {
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
  const { address } = useAccount();
  const { writeContract } = useWriteContract();
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);

  // Użyj props jeśli są dostępne, inaczej wewnętrzny state
  const activeDashboard = propActiveDashboard !== undefined ? propActiveDashboard : internalActiveDashboard;
  const dashboardChangeHandler = onDashboardChange || setInternalActiveDashboard;
  
  // Mock data for dashboards
  const mockPredictions = [
    {
      id: 1,
      question: "Bitcoin hits $100,000 by end of 2024?",
      category: "Crypto",
      yesTotalAmount: 10.35,
      noTotalAmount: 4.85,
      deadline: Date.now() / 1000 + 5 * 24 * 60 * 60, // 5 days from now
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
      createdAt: Date.now() / 1000 - 2 * 60 * 60, // 2 hours ago
      hasUserApproved: false,
      isRejected: false,
      rejectionReason: "",
      resolutionDeadline: Date.now() / 1000 + 10 * 24 * 60 * 60,
      // Missing properties for Prediction interface
      imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop",
      verified: true,
      approved: true
    },
    {
      id: 2,
      question: "Manchester United wins Premier League 2024?",
      category: "Sports",
      yesTotalAmount: 3.2,
      noTotalAmount: 5.7,
      deadline: Date.now() / 1000 - 1 * 24 * 60 * 60, // 1 day ago (ended)
      resolved: true,
      outcome: false,
      cancelled: false,
      participants: 156,
      userYesStake: 0.0,
      userNoStake: 1.0,
      potentialPayout: 1.33,
      potentialProfit: 0.33,
      needsApproval: false,
      approvalCount: 0,
      requiredApprovals: 2,
      description: "Based on current form and squad depth analysis.",
      creator: "0x987c...d3F4",
      createdAt: Date.now() / 1000 - 5 * 60 * 60,
      hasUserApproved: false,
      isRejected: false,
      rejectionReason: "",
      resolutionDeadline: Date.now() / 1000 + 5 * 24 * 60 * 60,
      // Missing properties for Prediction interface
      imageUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=300&fit=crop",
      verified: true,
      approved: true
    },
    {
      id: 3,
      question: "Solana flips Ethereum in market cap by 2025?",
      category: "Crypto",
      yesTotalAmount: 0,
      noTotalAmount: 0,
      deadline: Date.now() / 1000 + 30 * 24 * 60 * 60, // 30 days from now
      resolved: false,
      outcome: false,
      cancelled: false,
      participants: 0,
      userYesStake: 0,
      userNoStake: 0,
      potentialPayout: 0,
      potentialProfit: 0,
      needsApproval: true,
      approvalCount: 1,
      requiredApprovals: 2,
      description: "Based on current DeFi trends and Solana's growing ecosystem. Many analysts predict Solana could challenge Ethereum's dominance.",
      creator: "0x742d...a9E2",
      createdAt: Date.now() / 1000 - 2 * 60 * 60,
      hasUserApproved: true,
      isRejected: false,
      rejectionReason: "",
      resolutionDeadline: Date.now() / 1000 + 35 * 24 * 60 * 60,
      // Missing properties for Prediction interface
      imageUrl: "https://images.unsplash.com/photo-1640839198195-2f8c8f4c8f7a?w=400&h=300&fit=crop",
      verified: false,
      approved: false
    },
    {
      id: 4,
      question: "Will I get rich quick from this prediction?",
      category: "Spam",
      yesTotalAmount: 0,
      noTotalAmount: 0,
      deadline: Date.now() / 1000 + 7 * 24 * 60 * 60,
      resolved: false,
      outcome: false,
      cancelled: false,
      participants: 0,
      userYesStake: 0,
      userNoStake: 0,
      potentialPayout: 0,
      potentialProfit: 0,
      needsApproval: true,
      approvalCount: 0,
      requiredApprovals: 2,
      description: "Low quality prediction content",
      creator: "0x123f...b7A1",
      createdAt: Date.now() / 1000 - 3 * 60 * 60,
      hasUserApproved: false,
      isRejected: true,
      rejectionReason: "Low quality / spam content",
      resolutionDeadline: Date.now() / 1000 + 12 * 24 * 60 * 60,
      // Missing properties for Prediction interface
      imageUrl: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400&h=300&fit=crop",
      verified: false,
      approved: false
    },
    {
      id: 5,
      question: "Ethereum hits $5,000 by Q1 2024?",
      category: "Crypto",
      yesTotalAmount: 25.8,
      noTotalAmount: 14.2,
      deadline: Date.now() / 1000 - 2 * 24 * 60 * 60, // 2 days ago (needs resolution)
      resolved: false,
      outcome: false,
      cancelled: false,
      participants: 287,
      userYesStake: 0,
      userNoStake: 0,
      potentialPayout: 0,
      potentialProfit: 0,
      needsApproval: false,
      approvalCount: 0,
      requiredApprovals: 2,
      description: "Current ETH price: $4,847. Technical analysis shows resistance levels.",
      creator: "0x1111...aaaa",
      createdAt: Date.now() / 1000 - 10 * 60 * 60,
      hasUserApproved: false,
      isRejected: false,
      rejectionReason: "",
      resolutionDeadline: Date.now() / 1000 + 5 * 24 * 60 * 60,
      // Missing properties for Prediction interface
      imageUrl: "https://images.unsplash.com/photo-1639762681057-408e52192e55?w=400&h=300&fit=crop",
      verified: true,
      approved: true
    }
  ];
  
  const defaultItems: PredictionData[] = [
               {
        id: 1,
        title: "Bitcoin Breakout",
        image: "https://www.geckoterminal.com/eth/pools/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=f1f5f9",
        prediction: "BTC will hit $130k this year",
        timeframe: "31.12.2025",
        confidence: 85,
        category: "Bitcoin",
        price: "$98,450",
        change: "+12.5%",
        description: "Strong accumulation pattern with institutional buying pressure. Key resistance at $100k likely to break on next momentum wave.",
        isChart: true,
        votingYes: 78
      },
      {
        id: 2,
        title: "Ethereum Merge Impact",
        image: "https://www.geckoterminal.com/eth/pools/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=f1f5f9",
        prediction: "ETH will hit $8k this year",
        timeframe: "31.12.2025",
        confidence: 78,
        category: "Ethereum",
        price: "$3,250",
        change: "+8.3%",
        description: "Post-merge staking rewards and reduced supply will create upward pressure. DeFi ecosystem growth continues to accelerate.",
        isChart: true,
        votingYes: 65
      },
           {
        id: 3,
        title: "Solana Recovery",
        image: "https://www.geckoterminal.com/solana/pools/So11111111111111111111111111111111111111112?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=f1f5f9",
        prediction: "SOL will recover to $200+",
        timeframe: "10.10.2025",
        confidence: 72,
        category: "Solana",
        price: "$145",
        change: "+15.2%",
        description: "Technical indicators show oversold conditions. Strong developer activity and NFT market recovery driving momentum.",
        isChart: true,
        votingYes: 45
      },
           {
         id: 4,
         title: "AERO Token Launch",
         image: "https://www.geckoterminal.com/solana/pools/0x940181a94a35a4569e4529a3cdfb74e38fd98631?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=f1f5f9",
         prediction: "AERO will hit $5 this year",
         timeframe: "31.12.2025",
         confidence: 82,
         category: "AERO",
         price: "$28.50",
         change: "+45.2%",
         description: "Base L2 ecosystem growth and DeFi protocol expansion. Strong community and developer adoption driving momentum.",
         isChart: true,
         votingYes: 82
       },
       {
         id: 5,
         title: "BNB Chain Growth",
         image: "https://www.geckoterminal.com/eth/pools/0xb8c77482e45f1f44de1745f52c74426c631bdd52?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=f1f5f9",
         prediction: "BNB will hit $1000 this year",
         timeframe: "31.12.2025",
         confidence: 78,
         category: "BNB",
         price: "$580.30",
         change: "+28.7%",
         description: "Binance ecosystem expansion and DeFi protocol growth. Strong institutional adoption and cross-chain solutions.",
         isChart: true,
         votingYes: 71
       },
      {
        id: 6,
        title: "Satoshi Nakamoto Mystery",
        image: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop",
        prediction: "Satoshi will move Bitcoin from wallet",
        timeframe: "31.12.2025",
        confidence: 15,
        category: "Bitcoin",
        price: "$98,450",
        change: "+0.0%",
        description: "The biggest mystery in crypto: Will Satoshi Nakamoto ever move the 1.1M BTC from the original wallet? If true, it could shake the entire market.",
        votingYes: 12
      }
  ];

  const cardItems = items && items.length ? items : defaultItems;

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

    const side = isYes ? 'YES' : 'NO';

    console.log(`🎯 Staking ${amount} ETH on ${side} for prediction ${predictionId}`);

    // Execute real transaction with the smart contract
    writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'placeStake',
      args: [BigInt(predictionId), isYes],
      value: ethers.parseEther(amount.toString()),
    });
  };

  const handleClaimReward = (predictionId: number) => {
    console.log(`💰 Claiming reward for prediction ${predictionId}`);

    // Execute real claim reward transaction
    writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'claimReward',
      args: [BigInt(predictionId)],
    }, {
      onSuccess: () => {
        console.log(`✅ Reward claimed successfully for prediction ${predictionId}`);
        // Auto-refresh data after successful transaction
        setTimeout(() => {
          // Trigger data refresh by updating mock data or calling parent functions
          window.location.reload(); // Simple refresh for now
        }, 3000);
      },
      onError: (error) => {
        console.error('❌ Claim reward transaction failed:', error);
        alert('❌ Claim failed. Please try again.');
      }
    });
  };

  const handleResolvePrediction = (predictionId: number, outcome: boolean) => {
    console.log(`✅ Resolving prediction ${predictionId} as ${outcome ? 'YES' : 'NO'}`);

    // Execute real resolve prediction transaction
    writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'resolvePrediction',
      args: [BigInt(predictionId), outcome],
    }, {
      onSuccess: () => {
        console.log(`✅ Prediction ${predictionId} resolved successfully`);
        setTimeout(() => window.location.reload(), 3000);
      },
      onError: (error) => {
        console.error('❌ Resolve prediction failed:', error);
        alert('❌ Resolution failed. Please try again.');
      }
    });
  };

  const handleCancelPrediction = (predictionId: number, reason: string) => {
    console.log(`🚫 Cancelling prediction ${predictionId} with reason: ${reason}`);

    // Execute real cancel prediction transaction
    writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'cancelPrediction',
      args: [BigInt(predictionId), reason],
    }, {
      onSuccess: () => {
        console.log(`✅ Prediction ${predictionId} cancelled successfully`);
        setTimeout(() => window.location.reload(), 3000);
      },
      onError: (error) => {
        console.error('❌ Cancel prediction failed:', error);
        alert('❌ Cancellation failed. Please try again.');
      }
    });
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
      onSuccess: () => {
        console.log(`✅ Prediction ${predictionId} approved successfully`);
        setTimeout(() => window.location.reload(), 3000);
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
        setTimeout(() => window.location.reload(), 3000);
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
    setStakeModal(prev => ({ ...prev, stakeAmount: amount }));
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

    // Call the stake handler from dashboard
    handleStakeBet(predictionId, isYes, amount);

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

  // Open stake modal after swipe
  const openStakeModal = useCallback((direction: string, predictionId: number) => {
    const isYes = direction === 'right';
    console.log(`Opening stake modal for prediction ${predictionId} - ${isYes ? 'YES' : 'NO'}`);

    setStakeModal({
      isOpen: true,
      predictionId,
      isYes,
      stakeAmount: '0.001'
    });
  }, []);

  const onSwipe = (direction: string, swipedId: number) => {
    console.log(`You swiped ${direction} on card ${swipedId}`);
    setSwipeDirection(null);
    setSwipeProgress(0);
    
    // Open stake modal instead of transaction
    openStakeModal(direction, swipedId);
    
    // Move to next card
    setCurrentIndex(prev => {
      const next = prev + 1;
      return next >= cardItems.length ? 0 : next;
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
  
  // Set loading state for chart cards
  React.useEffect(() => {
    if (currentCard.isChart) {
      setLoadingStates(prev => ({ ...prev, [currentCard.id]: true }));
    }
  }, [currentCard.id, currentCard.isChart]);

  // Global error handler for network/fetch errors
  useEffect(() => {
    const handleUnhandledError = (event: ErrorEvent) => {
      // Filtruj tylko fetch/network errors
      if (event.message.includes('fetch') || event.message.includes('network') ||
          event.message.includes('CORS') || event.message.includes('Failed to fetch')) {
        console.warn('Network error intercepted:', event.message);
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
        console.warn('Unhandled promise rejection (network):', event.reason);
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
          predictions={mockPredictions}
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
          predictions={mockPredictions}
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
          predictions={mockPredictions}
          onApprovePrediction={handleApprovePrediction}
          onRejectPrediction={handleRejectPrediction}
        />
      </div>
    );
  }

  // Default: Tinder Mode
  return (
    <div className="tinder-container">
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
                     console.log(`Successfully loaded image: ${currentCard.image}`);
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
                   </div>
                 </div>
               )}
             </div>
                         <div className="card-content">
               <h3 className="card-title">{currentCard.title}</h3>
               <p className="prediction-text">{currentCard.prediction}</p>
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

             {/* Prediction Details Below Card */}
       <div className="prediction-details">
         <div className="details-header">
           <h4>Prediction Analysis</h4>
           <span className="card-number">{currentIndex + 1} / {cardItems.length}</span>
         </div>
         <p className="prediction-description">{currentCard.description}</p>
         <div className="prediction-stats">
           <div className="stat">
             <span className="stat-label">Category</span>
             <span className="stat-value">{currentCard.category}</span>
           </div>
           <div className="stat">
             <span className="stat-label">Timeframe</span>
             <span className="stat-value">{currentCard.timeframe}</span>
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
           
           {/* Market Sentiment */}
           <div className="chart-item">
             <div className="chart-title">Market Sentiment</div>
             <div className="chart-value">
               {currentCard.change.startsWith('+') ? 'Bullish' : 'Bearish'}
             </div>
             <div className="mini-chart">
               <div className="chart-line"></div>
               <div className="chart-dots">
                 {[10, 30, 50, 70, 90].map((pos, i) => (
                   <div 
                     key={i}
                     className="chart-dot"
                     style={{ 
                       left: `${pos}%`, 
                       top: `${[25, 45, 35, 65, 55][i]}%`,
                       opacity: [0.7, 0.8, 0.6, 0.9, 0.75][i]
                     }}
                   ></div>
                 ))}
               </div>
             </div>
             <div className="chart-subtitle">Trend Analysis</div>
           </div>
           
           {/* Risk Assessment */}
           <div className="chart-item">
             <div className="chart-title">Risk Level</div>
             <div className="chart-value">
               {currentCard.confidence > 80 ? 'Low' : currentCard.confidence > 60 ? 'Medium' : 'High'}
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
           
           {/* Price Target */}
           <div className="chart-item">
             <div className="chart-title">Price Target</div>
             <div className="chart-value">{currentCard.price}</div>
             <div className="mini-chart">
               <div className="chart-line"></div>
               <div className="chart-dots">
                 {[15, 35, 55, 75, 95].map((pos, i) => (
                   <div 
                     key={i}
                     className="chart-dot"
                     style={{ 
                       left: `${pos}%`, 
                       top: `${[40, 30, 50, 25, 45][i]}%`,
                       opacity: [0.6, 0.8, 0.7, 0.9, 0.65][i]
                     }}
                   ></div>
                 ))}
               </div>
             </div>
             <div className="chart-subtitle">Target Price</div>
           </div>
                             </div>
        </div>

      {/* Stake Modal */}
      {stakeModal.isOpen && (
        <div className="stake-modal-overlay" onClick={handleCloseStakeModal}>
          <div className="stake-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stake-modal-header">
              <h3>💰 Place Your Stake</h3>
              <button className="modal-close-btn" onClick={handleCloseStakeModal}>✕</button>
            </div>

            <div className="stake-modal-content">
              <div className="stake-prediction-info">
                <div className="stake-prediction-title">
                  Prediction #{stakeModal.predictionId}
                </div>
                <div className="stake-choice">
                  <span className={`choice-indicator ${stakeModal.isYes ? 'yes' : 'no'}`}>
                    {stakeModal.isYes ? '👍 YES' : '👎 NO'}
                  </span>
                </div>
              </div>

              <div className="stake-amount-section">
                <label htmlFor="stake-amount">Stake Amount (ETH)</label>
                <div className="stake-input-container">
                  <input
                    id="stake-amount"
                    type="number"
                    step="0.001"
                    min="0.001"
                    max="100"
                    value={stakeModal.stakeAmount}
                    onChange={(e) => handleStakeAmountChange(e.target.value)}
                    className="stake-input"
                    placeholder="0.001"
                  />
                  <span className="eth-label">ETH</span>
                </div>
                <div className="stake-limits">
                  Min: 0.001 ETH | Max: 100 ETH
                </div>
              </div>

              <div className="stake-quick-amounts">
                <button onClick={() => handleStakeAmountChange('0.001')}>0.001</button>
                <button onClick={() => handleStakeAmountChange('0.01')}>0.01</button>
                <button onClick={() => handleStakeAmountChange('0.1')}>0.1</button>
                <button onClick={() => handleStakeAmountChange('1.0')}>1.0</button>
              </div>

              <div className="stake-actions">
                <button className="btn-cancel" onClick={handleCloseStakeModal} disabled={isTransactionLoading}>
                  Cancel
                </button>
                <button
                  className={`btn-confirm ${isTransactionLoading ? 'loading' : ''}`}
                  onClick={handleConfirmStake}
                  disabled={isTransactionLoading}
                >
                  {isTransactionLoading ? (
                    <>
                      <div className="loading-spinner"></div>
                      Processing...
                    </>
                  ) : (
                    'Confirm Stake'
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
  }

import React, { useState, useCallback, useEffect } from 'react';
import TinderCard from 'react-tinder-card';
import { useAccount, useWriteContract } from "wagmi";
import { ethers } from 'ethers';
import { CONTRACTS, getV2Contract } from '../../../lib/contract';
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
  
  // Use hybrid predictions hook instead of mock data
  const { predictions: hybridPredictions, loading: predictionsLoading, error: predictionsError, refresh: refreshPredictions } = useHybridPredictions();
  
  // Transform hybrid predictions to match the expected format
  const transformedPredictions = hybridPredictions.map((pred) => ({
    id: Number(pred.id),
    question: pred.question,
    category: pred.category,
    yesTotalAmount: pred.yesTotalAmount,
    noTotalAmount: pred.noTotalAmount,
    deadline: pred.deadline,
    resolved: pred.resolved,
    outcome: pred.outcome ?? false,
    cancelled: pred.cancelled,
    participants: pred.participants.length,
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
  }));
  
  // Use transformed predictions for both dashboards and tinder cards
  const predictions = transformedPredictions;
  
  // Transform predictions to TinderCard format
  const defaultItems: PredictionData[] = predictions.map(pred => {
    const totalPool = pred.yesTotalAmount + pred.noTotalAmount;
    const yesPercentage = totalPool > 0 ? (pred.yesTotalAmount / totalPool) * 100 : 0;
    const noPercentage = totalPool > 0 ? (pred.noTotalAmount / totalPool) * 100 : 0;

    return {
    id: pred.id,
    title: pred.question,
    image: pred.imageUrl,
    prediction: pred.question,
    timeframe: new Date(pred.deadline * 1000).toLocaleDateString(),
    confidence: Math.round(yesPercentage),
    category: pred.category,
    price: `$${(pred.yesTotalAmount + pred.noTotalAmount).toFixed(2)}`,
    change: yesPercentage > noPercentage ? `+${yesPercentage.toFixed(1)}%` : `-${noPercentage.toFixed(1)}%`,
    description: pred.description,
    isChart: pred.includeChart || false,
    votingYes: Math.round(yesPercentage)
    };
  });

  const cardItems = items && items.length ? items : defaultItems;

  // Dashboard handlers
  const handleStakeBet = (predictionId: number, isYes: boolean, amount: number) => {
    if (amount < 0.001) {
      alert('❌ Minimum stake is 0.001 ETH');
      return;
    }

    if (!address) {
      alert('❌ Please connect your wallet first');
      return;
    }

    setIsTransactionLoading(true);

    try {
      writeContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
        functionName: 'placeStake',
        args: [BigInt(predictionId), isYes],
        value: ethers.parseEther(amount.toString()),
      }, {
        onSuccess: async (hash) => {
          console.log('✅ Stake transaction successful:', hash);
          showNotification('success', '✅ Stake placed successfully!', '');
          setStakeModal({ ...stakeModal, isOpen: false });
          
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
              console.log('✅ Prediction auto-synced after stake');
              // Trigger immediate refresh of predictions
              if (refreshPredictions) {
                refreshPredictions();
              }
            } else {
              console.warn('⚠️ Auto-sync failed after stake');
            }
          } catch (syncError) {
            console.error('❌ Failed to auto-sync after stake:', syncError);
          }
        },
        onError: (error) => {
          console.error('Failed to place stake:', error);
          showNotification('error', '❌ Failed to place stake', '');
        }
      });
    } catch (error) {
      console.error('Failed to place stake:', error);
      showNotification('error', '❌ Failed to place stake', '');
    } finally {
      setIsTransactionLoading(false);
    }
  };

  const handleClaimReward = (predictionId: number) => {
    if (!address) {
      alert('❌ Please connect your wallet first');
      return;
    }

    setIsTransactionLoading(true);

    try {
      writeContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
        functionName: 'claimReward',
        args: [BigInt(predictionId)],
      });

      showNotification('success', '✅ Reward claimed successfully!', '');
    } catch (error) {
      console.error('Failed to claim reward:', error);
      showNotification('error', '❌ Failed to claim reward', '');
    } finally {
      setIsTransactionLoading(false);
    }
  };

  const handleResolvePrediction = (predictionId: string | number, outcome: boolean) => {
    if (!address) {
      alert('❌ Please connect your wallet first');
      return;
    }

    setIsTransactionLoading(true);

    try {
      writeContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
        functionName: 'resolvePrediction',
        args: [BigInt(predictionId), outcome],
      });

      showNotification('success', '✅ Prediction resolved successfully!', '');
    } catch (error) {
      console.error('Failed to resolve prediction:', error);
      showNotification('error', '❌ Failed to resolve prediction', '');
    } finally {
      setIsTransactionLoading(false);
    }
  };

  const handleCancelPrediction = (predictionId: string | number, reason: string) => {
    if (!address) {
      alert('❌ Please connect your wallet first');
      return;
    }

    setIsTransactionLoading(true);

    try {
      writeContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
        functionName: 'cancelPrediction',
        args: [BigInt(predictionId), reason],
      });

      showNotification('success', '✅ Prediction cancelled successfully!', '');
    } catch (error) {
      console.error('Failed to cancel prediction:', error);
      showNotification('error', '❌ Failed to cancel prediction', '');
    } finally {
      setIsTransactionLoading(false);
    }
  };

  const handleCreatePrediction = (predictionData: any) => {
    if (!address) {
      alert('❌ Please connect your wallet first');
      return;
    }

    setIsTransactionLoading(true);

    try {
      writeContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
        functionName: 'createPrediction',
        args: [
          predictionData.question,
          predictionData.description,
          predictionData.category,
          predictionData.imageUrl,
          BigInt(predictionData.durationInHours)
        ],
        value: ethers.parseEther('0.01'), // Creation fee
      });

      showNotification('success', '✅ Prediction created successfully!', '');
    } catch (error) {
      console.error('Failed to create prediction:', error);
      showNotification('error', '❌ Failed to create prediction', '');
    } finally {
      setIsTransactionLoading(false);
    }
  };

  const handleManageApprovers = (approverAddress: string, isApproved: boolean) => {
    if (!address) {
      alert('❌ Please connect your wallet first');
      return;
    }

    setIsTransactionLoading(true);

    try {
      writeContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
        functionName: 'setApprover',
        args: [approverAddress as `0x${string}`, isApproved],
      });

      showNotification('success', `✅ Approver ${isApproved ? 'added' : 'removed'} successfully!`, '');
    } catch (error) {
      console.error('Failed to manage approvers:', error);
      showNotification('error', '❌ Failed to manage approvers', '');
    } finally {
      setIsTransactionLoading(false);
    }
  };

  const handleWithdrawFees = () => {
    if (!address) {
      alert('❌ Please connect your wallet first');
      return;
    }

    setIsTransactionLoading(true);

    try {
      writeContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
        functionName: 'withdrawFees',
        args: []
      });

      showNotification('success', '✅ Fees withdrawn successfully!', '');
    } catch (error) {
      console.error('Failed to withdraw fees:', error);
      showNotification('error', '❌ Failed to withdraw fees', '');
    } finally {
      setIsTransactionLoading(false);
    }
  };

  const handlePauseContract = (pause: boolean) => {
    if (!address) {
      alert('❌ Please connect your wallet first');
      return;
    }

    setIsTransactionLoading(true);

    try {
      writeContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
        functionName: pause ? 'pause' : 'unpause',
        args: []
      });

      showNotification('success', `✅ Contract ${pause ? 'paused' : 'unpaused'} successfully!`, '');
    } catch (error) {
      console.error('Failed to pause/unpause contract:', error);
      showNotification('error', '❌ Failed to pause/unpause contract', '');
    } finally {
      setIsTransactionLoading(false);
    }
  };

  const handleApprovePrediction = (predictionId: number) => {
    if (!address) {
      alert('❌ Please connect your wallet first');
      return;
    }

    setIsTransactionLoading(true);

    try {
      writeContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
        functionName: 'approvePrediction',
        args: [BigInt(predictionId)],
      });

      showNotification('success', '✅ Prediction approved successfully!', '');
    } catch (error) {
      console.error('Failed to approve prediction:', error);
      showNotification('error', '❌ Failed to approve prediction', '');
    } finally {
      setIsTransactionLoading(false);
    }
  };

  const handleRejectPrediction = (predictionId: number, reason: string) => {
    if (!address) {
      alert('❌ Please connect your wallet first');
      return;
    }

    setIsTransactionLoading(true);

    try {
      writeContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
        functionName: 'rejectPrediction',
        args: [BigInt(predictionId), reason],
      });

      showNotification('success', '✅ Prediction rejected successfully!', '');
    } catch (error) {
      console.error('Failed to reject prediction:', error);
      showNotification('error', '❌ Failed to reject prediction', '');
    } finally {
      setIsTransactionLoading(false);
    }
  };

  // Tinder card logic
  const currentCard = cardItems[currentIndex];

  const onSwipe = (direction: string, cardId: number) => {
    console.log(`Swiped ${direction} on card ${cardId}`);
    setSwipeDirection(direction as 'left' | 'right');
    
    // Handle stake based on swipe direction
    if (direction === 'right') {
      // Swipe right = YES vote
      setStakeModal({
        isOpen: true,
        predictionId: cardId,
        isYes: true,
        stakeAmount: '0.001'
      });
    } else if (direction === 'left') {
      // Swipe left = NO vote
      setStakeModal({
        isOpen: true,
        predictionId: cardId,
        isYes: false,
        stakeAmount: '0.001'
      });
    }
  };

  const onCardLeftScreen = (cardId: number) => {
    console.log(`Card ${cardId} left screen`);
    setCurrentIndex(prevIndex => Math.min(prevIndex + 1, cardItems.length - 1));
    setSwipeDirection(null);
    setSwipeProgress(0);
  };

  const onSwipeRequirementFulfilled = (direction: string) => {
    console.log(`Swipe requirement fulfilled for ${direction}`);
  };

  const onSwipeRequirementUnfulfilled = () => {
    console.log('Swipe requirement unfulfilled');
  };

  const getCardStyle = () => {
    if (swipeDirection === 'left') {
      return {
        transform: `translateX(-${swipeProgress}px) rotate(-${swipeProgress * 0.1}deg)`,
        opacity: 1 - swipeProgress / 200
      };
    } else if (swipeDirection === 'right') {
      return {
        transform: `translateX(${swipeProgress}px) rotate(${swipeProgress * 0.1}deg)`,
        opacity: 1 - swipeProgress / 200
      };
    }
    return {};
  };

  const handleIframeLoad = (cardId: number) => {
    setLoadingStates(prev => ({ ...prev, [cardId]: false }));
  };

  const handleIframeError = (cardId: number) => {
    setLoadingStates(prev => ({ ...prev, [cardId]: false }));
  };

  // Loading state
  if (predictionsLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading predictions...</p>
      </div>
    );
  }

  // Error state
  if (predictionsError) {
    return (
      <div className="error-container">
        <p>❌ Error loading predictions: {predictionsError}</p>
        <button onClick={refreshPredictions}>Retry</button>
      </div>
    );
  }

  // No predictions
  if (predictions.length === 0) {
    return (
      <div className="no-predictions">
        <p>No predictions available</p>
        <p>Create the first prediction to get started!</p>
      </div>
    );
  }

  // Dashboard routing
  if (activeDashboard === 'user') {
    return (
      <div>
        <UserDashboard
          predictions={predictions}
          onClaimReward={handleClaimReward}
        />
      </div>
    );
  }

  if (activeDashboard === 'admin') {
    return (
      <div>
        <AdminDashboard
          predictions={predictions}
          onResolvePrediction={handleResolvePrediction}
          onCancelPrediction={handleCancelPrediction}
          onCreatePrediction={() => handleCreatePrediction({} as any)}
          onManageApprovers={() => handleManageApprovers('' as any, false)}
          onWithdrawFees={handleWithdrawFees}
          onPauseContract={() => handlePauseContract(false)}
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
    //   address: CONTRACTS.V2.address as `0x${string}`,
    //   abi: CONTRACTS.V2.abi,
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
          predictions={predictions}
          onApprovePrediction={handleApprovePrediction}
          onRejectPrediction={handleRejectPrediction}
        />
      </div>
    );
  }

  // Default: Tinder Mode
  return (
    <div className="tinder-container">
      {/* Refresh Button */}
      <div className="refresh-controls" style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000 }}>
        <button 
          onClick={refreshPredictions}
          className="refresh-btn"
          style={{
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          🔄 Refresh
        </button>
      </div>
      
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
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                  onLoad={() => {
                    console.log(`Successfully loaded image: ${currentCard.image}`);
                  }}
                />
              )}
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
              <p className="card-prediction">{currentCard.prediction}</p>
              <p className="card-timeframe">Deadline: {currentCard.timeframe}</p>
              <p className="card-description">{currentCard.description}</p>
              
              <div className="card-stats">
                <div className="stat">
                  <span className="stat-label">Confidence:</span>
                  <span className="stat-value">{currentCard.confidence}%</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Voting YES:</span>
                  <span className="stat-value">{currentCard.votingYes}%</span>
                </div>
              </div>

              <div className="card-actions">
                <button 
                  className="action-btn yes-btn"
                  onClick={() => onSwipe('right', currentCard.id)}
                  disabled={isTransactionLoading}
                >
                  👍 YES
                </button>
                <button 
                  className="action-btn no-btn"
                  onClick={() => onSwipe('left', currentCard.id)}
                  disabled={isTransactionLoading}
                >
                  👎 NO
                </button>
              </div>
            </div>
          </div>
        </TinderCard>
      </div>

      {/* Stake Modal */}
      {stakeModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Place Your Stake</h3>
            <p>You're voting <strong>{stakeModal.isYes ? 'YES' : 'NO'}</strong> on:</p>
            <p className="prediction-question">{currentCard.title}</p>
            
            <div className="stake-input">
              <label>Stake Amount (ETH):</label>
              <input
                type="number"
                value={stakeModal.stakeAmount}
                onChange={(e) => setStakeModal({...stakeModal, stakeAmount: e.target.value})}
                min="0.001"
                max="100"
                step="0.001"
              />
            </div>

            <div className="modal-actions">
              <button 
                onClick={() => handleStakeBet(
                  stakeModal.predictionId, 
                  stakeModal.isYes, 
                  parseFloat(stakeModal.stakeAmount)
                )}
                disabled={isTransactionLoading}
                className="stake-btn"
              >
                {isTransactionLoading ? 'Processing...' : 'Place Stake'}
              </button>
              <button 
                onClick={() => setStakeModal({...stakeModal, isOpen: false})}
                className="cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification System */}
      <NotificationSystem />
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../lib/contract';
import { ethers } from 'ethers';
import { useRedisPredictions } from '../../../lib/hooks/useRedisPredictions';
import { RedisPrediction, RedisUserStake, UserTransaction } from '../../../lib/types/redis';
import { generateBasescanUrl, generateTransactionId } from '../../../lib/utils/redis-utils';
import './EnhancedUserDashboard.css';

interface PredictionWithStakes extends RedisPrediction {
  userStake?: {
    predictionId: string;
    yesAmount: number;
    noAmount: number;
    claimed: boolean;
    potentialPayout: number;
    potentialProfit: number;
    canClaim: boolean;
    isWinner: boolean;
  };
  status: 'active' | 'resolved' | 'expired' | 'cancelled';
}

export function EnhancedUserDashboard() {
  const { address } = useAccount();
  const { writeContract } = useWriteContract();
  const [userPredictions, setUserPredictions] = useState<PredictionWithStakes[]>([]);
  const [loadingStakes, setLoadingStakes] = useState(false);
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [userTransactions, setUserTransactions] = useState<UserTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'claim' | 'success' | 'error'>('claim');
  const [modalData, setModalData] = useState<{txHash?: string, basescanUrl?: string, message?: string}>({});

  // Convert wei to ETH
  const weiToEth = (wei: number): number => {
    return wei / Math.pow(10, 18);
  };

  // Format ETH for display
  const formatEth = (wei: number): string => {
    const eth = weiToEth(wei);
    if (eth === 0) return '0.0000';
    return eth.toFixed(6); // Always use decimal format with 6 decimal places
  };

  // Modal functions
  const showClaimModal = (txHash: string, basescanUrl: string) => {
    setModalType('claim');
    setModalData({ txHash, basescanUrl });
    setShowModal(true);
    
    // Auto-close after 3 seconds
    setTimeout(() => {
      setShowModal(false);
    }, 3000);
  };

  const showSuccessModal = (txHash: string, basescanUrl: string) => {
    setModalType('success');
    setModalData({ txHash, basescanUrl });
    setShowModal(true);
    
    // Auto-close after 3 seconds and refresh data
    setTimeout(() => {
      setShowModal(false);
      // Refresh data one more time to ensure everything is up to date
      fetchUserStakes();
      fetchUserTransactions();
      console.log('🔄 Final data refresh after modal close');
    }, 3000);
  };

  const showErrorModal = (message: string) => {
    setModalType('error');
    setModalData({ message });
    setShowModal(true);
    
    // Auto-close after 3 seconds
    setTimeout(() => {
      setShowModal(false);
    }, 3000);
  };

  const closeModal = () => {
    setShowModal(false);
  };
  
  // Redis predictions hook
  const { predictions: allPredictions, loading: predictionsLoading, error: predictionsError } = useRedisPredictions();

  // Fetch user transactions
  const fetchUserTransactions = useCallback(async () => {
    if (!address) return;
    
    setLoadingTransactions(true);
    try {
      const response = await fetch(`/api/user-transactions?userId=${address.toLowerCase()}`);
      const result = await response.json();
      const transactions = result.success ? result.data : [];
      setUserTransactions(transactions);
      console.log(`📊 Loaded ${transactions.length} user transactions`);
    } catch (error) {
      console.error('Failed to fetch user transactions:', error);
    } finally {
      setLoadingTransactions(false);
    }
  }, [address]);

  // Fetch user stakes for all predictions - simplified to use only Redis
  const fetchUserStakes = useCallback(async () => {
    if (!address) {
      console.log('❌ No address connected, skipping fetchUserStakes');
      return;
    }
    
    // Don't fetch if predictions are still loading
    if (predictionsLoading) {
      console.log('⏳ Predictions still loading, skipping fetchUserStakes');
      return;
    }
    
    setLoadingStakes(true);
    try {
      console.log(`🔍 Fetching user stakes for ${address}`);
      
      // Use the Redis predictions from the hook instead of fetching from API
      const predictions = allPredictions || [];
      console.log(`📊 Found ${predictions.length} total predictions`);
      
      if (predictions.length === 0) {
        console.log('⚠️ No predictions found in Redis');
        setUserPredictions([]);
        return;
      }
      
      const userPredictionsWithStakes: PredictionWithStakes[] = [];
      
      for (const prediction of predictions) {
        try {
          const stakeInfo = await fetch(`/api/stakes?predictionId=${prediction.id}&userId=${address.toLowerCase()}`);
          const stakeData = await stakeInfo.json();
          
          if (stakeData.success && stakeData.data.length > 0) {
            const userStake = stakeData.data[0];
            if (userStake.yesAmount > 0 || userStake.noAmount > 0) {
              console.log(`💰 Found stake for prediction ${prediction.id}:`, userStake);
              
              let potentialPayout = 0;
              let potentialProfit = 0;
              let canClaim = false;
              let isWinner = false;
              const userStakeAmount = userStake.yesAmount + userStake.noAmount;

              // Calculate payout for resolved predictions
              if (prediction.resolved && !userStake.claimed) {
                const winnersPool = prediction.outcome ? prediction.yesTotalAmount : prediction.noTotalAmount;
                const losersPool = prediction.outcome ? prediction.noTotalAmount : prediction.yesTotalAmount;
                const platformFee = losersPool * 0.01; // 1% platform fee
                const netLosersPool = losersPool - platformFee;

                if (prediction.outcome && userStake.yesAmount > 0) {
                  // User bet YES and won
                  isWinner = true;
                  potentialPayout = userStakeAmount + (userStake.yesAmount / winnersPool) * netLosersPool;
                  potentialProfit = potentialPayout - userStakeAmount;
                  canClaim = true;
                } else if (!prediction.outcome && userStake.noAmount > 0) {
                  // User bet NO and won
                  isWinner = true;
                  potentialPayout = userStakeAmount + (userStake.noAmount / winnersPool) * netLosersPool;
                  potentialProfit = potentialPayout - userStakeAmount;
                  canClaim = true;
                } else {
                  // User lost
                  potentialPayout = 0;
                  potentialProfit = -userStakeAmount;
                  canClaim = false;
                }
              } else if (prediction.cancelled && !userStake.claimed) {
                // Full refund for cancelled predictions
                potentialPayout = userStakeAmount;
                potentialProfit = 0;
                canClaim = true;
              } else if (prediction.resolved && userStake.claimed) {
                // Already claimed - show as claimed with calculated payout
                const winnersPool = prediction.outcome ? prediction.yesTotalAmount : prediction.noTotalAmount;
                const losersPool = prediction.outcome ? prediction.noTotalAmount : prediction.yesTotalAmount;
                const platformFee = losersPool * 0.01; // 1% platform fee
                const netLosersPool = losersPool - platformFee;

                if (prediction.outcome && userStake.yesAmount > 0) {
                  // User bet YES and won
                  isWinner = true;
                  potentialPayout = userStakeAmount + (userStake.yesAmount / winnersPool) * netLosersPool;
                  potentialProfit = potentialPayout - userStakeAmount;
                  canClaim = false; // Already claimed
                } else if (!prediction.outcome && userStake.noAmount > 0) {
                  // User bet NO and won
                  isWinner = true;
                  potentialPayout = userStakeAmount + (userStake.noAmount / winnersPool) * netLosersPool;
                  potentialProfit = potentialPayout - userStakeAmount;
                  canClaim = false; // Already claimed
                } else {
                  // User lost
                  potentialPayout = 0;
                  potentialProfit = -userStakeAmount;
                  canClaim = false;
                }
              }

              userPredictionsWithStakes.push({
                ...prediction,
                userStake: {
                  predictionId: prediction.id,
                  yesAmount: userStake.yesAmount || 0,
                  noAmount: userStake.noAmount || 0,
                  claimed: userStake.claimed || false,
                  potentialPayout,
                  potentialProfit,
                  canClaim,
                  isWinner
                },
                status: prediction.cancelled ? 'cancelled' :
                        prediction.resolved ? 'resolved' :
                        prediction.deadline < Date.now() / 1000 ? 'expired' : 'active'
              });
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch stake for prediction ${prediction.id}:`, error);
        }
      }
      
      console.log(`📊 Found ${userPredictionsWithStakes.length} predictions with stakes for user ${address}`);
      setUserPredictions(userPredictionsWithStakes);
    } catch (error) {
      console.error('Failed to fetch user stakes:', error);
    } finally {
      setLoadingStakes(false);
    }
  }, [address, allPredictions, predictionsLoading]);

  // Auto-refresh every 60 seconds (less frequent to avoid spam)
  useEffect(() => {
    const interval = setInterval(fetchUserStakes, 60000);
    return () => clearInterval(interval);
  }, [fetchUserStakes]);

  // Initial fetch
  useEffect(() => {
    fetchUserStakes();
    fetchUserTransactions();
  }, [fetchUserStakes, fetchUserTransactions]);

  // Fetch user stakes when predictions are loaded
  useEffect(() => {
    if (allPredictions && allPredictions.length > 0 && address) {
      console.log('🔄 Predictions loaded, fetching user stakes...');
      fetchUserStakes();
    }
  }, [allPredictions, address, fetchUserStakes]);

  // Handle claim reward
  const handleClaimReward = async (predictionId: string) => {
    if (!address) {
      alert('❌ Please connect your wallet first');
      return;
    }

    setIsTransactionLoading(true);
    try {
      // Check if this is a blockchain prediction (starts with pred_)
      if (predictionId.startsWith('pred_')) {
        // Extract numeric ID for blockchain transaction
        const numericId = parseInt(predictionId.replace('pred_', ''));
        
        if (isNaN(numericId)) {
          alert('❌ Invalid prediction ID');
          return;
        }

        console.log(`🎯 Attempting to claim reward for prediction ${numericId}...`);

        // Find prediction details for transaction record
        const prediction = allPredictions.find(p => p.id === predictionId);
        if (!prediction) {
          alert('❌ Prediction not found');
          return;
        }

        // Call blockchain claim transaction with callbacks
        writeContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'claimReward',
          args: [BigInt(numericId)],
        }, {
          onSuccess: async (txHash: string) => {
            console.log('🎯 Claim transaction sent:', txHash);

            // Save transaction to Redis
            const transaction: UserTransaction = {
              id: generateTransactionId(),
              type: 'claim',
              predictionId: predictionId,
              predictionQuestion: prediction.question,
              txHash: txHash,
              basescanUrl: generateBasescanUrl(txHash),
              timestamp: Date.now(),
              status: 'pending'
            };

            await fetch('/api/user-transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: address.toLowerCase(),
                transaction
              })
            });
            
            // Immediately refresh transaction history to show the new transaction
            fetchUserTransactions();

            // Show custom modal instead of alert
            showClaimModal(txHash, transaction.basescanUrl);
            
            // Wait for transaction confirmation with better logic
            const receipt = await new Promise((resolve, reject) => {
              let attempts = 0;
              const maxAttempts = 30; // 30 attempts = 60 seconds max wait
              
              const checkReceipt = async () => {
                try {
                  attempts++;
                  console.log(`🔍 Checking transaction status (attempt ${attempts}/${maxAttempts}): ${txHash}`);
                  
                  const response = await fetch(`https://api.basescan.org/api?module=transaction&action=gettxreceiptstatus&txhash=${txHash}`);
                  const data = await response.json();
                  
                  console.log(`📊 Transaction status response:`, data);
                  
                  if (data.status === '1') {
                    console.log('✅ Transaction confirmed successfully');
                    resolve({ status: 'success' });
                  } else if (data.status === '0' && attempts > 5) {
                    // Only fail after 5 attempts to give transaction time to be mined
                    console.log('❌ Transaction failed after multiple attempts');
                    reject(new Error('Transaction failed'));
                  } else if (attempts >= maxAttempts) {
                    console.log('⏰ Transaction confirmation timeout');
                    reject(new Error('Transaction confirmation timeout'));
                  } else {
                    console.log('⏳ Transaction still pending, checking again in 2 seconds...');
                    setTimeout(checkReceipt, 2000); // Check again in 2 seconds
                  }
                } catch (error) {
                  console.error('❌ Error checking transaction status:', error);
                  if (attempts >= maxAttempts) {
                    reject(error);
                  } else {
                    setTimeout(checkReceipt, 2000);
                  }
                }
              };
              
              // Start checking after a short delay to give transaction time to be broadcast
              setTimeout(checkReceipt, 3000);
            });

            if ((receipt as any).status === 'success') {
              // Update transaction status in Redis
              await fetch('/api/user-transactions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: address.toLowerCase(),
                  txHash,
                  status: 'success',
                  blockNumber: (receipt as any).blockNumber,
                  gasUsed: (receipt as any).gasUsed
                })
              });
              
              // Mark stake as claimed in Redis
              try {
                const updateStakeResponse = await fetch('/api/stakes', {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    userId: address.toLowerCase(),
                    predictionId: predictionId,
                    updates: { claimed: true }
                  }),
                });
                
                if (updateStakeResponse.ok) {
                  console.log('✅ Stake marked as claimed in Redis');
                } else {
                  console.error('❌ Failed to mark stake as claimed');
                }
              } catch (stakeUpdateError) {
                console.error('❌ Error updating stake as claimed:', stakeUpdateError);
              }
              
              // Show success modal
              showSuccessModal(txHash, transaction.basescanUrl);
              
              // Sync blockchain data to Redis
              try {
                await fetch('/api/sync');
                console.log('✅ Blockchain data synced to Redis');
              } catch (syncError) {
                console.error('❌ Failed to sync blockchain data:', syncError);
              }
              
              // Refresh user data with delay to ensure sync is complete
              setTimeout(() => {
                fetchUserStakes();
                fetchUserTransactions();
                console.log('🔄 User data refreshed after successful claim');
              }, 2000);
            } else {
              // Update transaction status in Redis
              await fetch('/api/user-transactions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: address.toLowerCase(),
                  txHash,
                  status: 'failed'
                })
              });
              showErrorModal('Claim transaction failed');
            }
          },
          onError: (error) => {
            console.error('❌ Claim transaction failed:', error);
            showErrorModal(`Failed to claim reward: ${error.message || error}`);
          }
        });
      } else {
        // For pure Redis predictions, update Redis only
        const stakeInfo = await fetch(`/api/stakes?predictionId=${predictionId}&userId=${address.toLowerCase()}`);
        const stakeData = await stakeInfo.json();
        
        if (stakeData.success && stakeData.data.length > 0) {
          const userStake = stakeData.data[0];
          
          // Update the stake as claimed
          const updateResponse = await fetch('/api/stakes', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: address.toLowerCase(),
              predictionId: predictionId,
              updates: { claimed: true }
            }),
          });
          
          if (updateResponse.ok) {
            console.log('✅ Stake marked as claimed successfully');
            // Refresh user stakes after successful claim
            setTimeout(() => {
              fetchUserStakes();
            }, 1000);
          } else {
            console.error('Failed to mark stake as claimed');
          }
        }
      }
    } catch (error) {
      console.error('Failed to claim reward:', error);
      alert(`❌ Failed to claim reward: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsTransactionLoading(false);
    }
  };

  // Group predictions by status
  const activePredictions = userPredictions.filter(p => p.status === 'active');
  const resolvedPredictions = userPredictions.filter(p => p.status === 'resolved');
  const expiredPredictions = userPredictions.filter(p => p.status === 'expired');
  const cancelledPredictions = userPredictions.filter(p => p.status === 'cancelled');

  // Calculate totals
  const totalStaked = userPredictions.reduce((sum, p) => sum + (p.userStake?.yesAmount || 0) + (p.userStake?.noAmount || 0), 0);
  const totalPotentialPayout = userPredictions.reduce((sum, p) => sum + (p.userStake?.potentialPayout || 0), 0);
  const totalPotentialProfit = userPredictions.reduce((sum, p) => sum + (p.userStake?.potentialProfit || 0), 0);
  const canClaimCount = userPredictions.filter(p => p.userStake?.canClaim && !p.userStake?.claimed).length;

  if (!address) {
    return (
      <div className="enhanced-user-dashboard">
        <div className="error-container">
          <h3>🔗 Connect Your Wallet</h3>
          <p>Please connect your wallet to view your prediction dashboard.</p>
          <p>You need to be connected to see your stakes and claim rewards.</p>
        </div>
      </div>
    );
  }

  if (loadingStakes || predictionsLoading) {
    return (
      <div className="enhanced-user-dashboard">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading your predictions...</p>
          <p>Connected wallet: {address}</p>
        </div>
      </div>
    );
  }

  if (predictionsError) {
    return (
      <div className="enhanced-user-dashboard">
        <div className="error-container">
          <h3>❌ Error Loading Predictions</h3>
          <p>Error: {predictionsError}</p>
          <p>Connected wallet: {address}</p>
          <button onClick={fetchUserStakes}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="enhanced-user-dashboard">
      <div className="dashboard-header">
        <h2>📊 My Prediction Dashboard</h2>
        <div className="refresh-controls">
          <button onClick={fetchUserStakes} className="refresh-btn">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="stat-card">
          <h3>Total Staked</h3>
          <p>{formatEth(totalStaked)} ETH</p>
        </div>
        <div className="stat-card">
          <h3>Potential Payout</h3>
          <p>{formatEth(totalPotentialPayout)} ETH</p>
        </div>
        <div className="stat-card">
          <h3>Potential Profit</h3>
          <p className={totalPotentialProfit >= 0 ? 'profit' : 'loss'}>
            {totalPotentialProfit >= 0 ? '+' : ''}{formatEth(totalPotentialProfit)} ETH
          </p>
        </div>
        <div className="stat-card">
          <h3>Ready to Claim</h3>
          <p>{canClaimCount} predictions</p>
        </div>
      </div>

      {/* Ready to Claim Section */}
      {userPredictions.filter(p => p.userStake?.canClaim && !p.userStake?.claimed).length > 0 && (
        <div className="section">
          <h3>🎉 Ready to Claim</h3>
          <div className="predictions-grid">
            {userPredictions
              .filter(p => p.userStake?.canClaim && !p.userStake?.claimed)
              .map((prediction) => (
                <div key={prediction.id} className="prediction-card claimable">
                  <div className="card-header">
                    <h4>{prediction.question}</h4>
                    <span className="status-badge resolved">
                      {prediction.cancelled ? 'CANCELLED' : 'RESOLVED'}
                    </span>
                  </div>
                  <div className="card-content">
                    <p><strong>Your Stake:</strong> {formatEth((prediction.userStake?.yesAmount || 0) + (prediction.userStake?.noAmount || 0))} ETH</p>
                    <p><strong>Payout:</strong> {formatEth(prediction.userStake?.potentialPayout || 0)} ETH</p>
                    <p><strong>Profit:</strong> 
                      <span className={(prediction.userStake?.potentialProfit || 0) >= 0 ? 'profit' : 'loss'}>
                        {(prediction.userStake?.potentialProfit || 0) >= 0 ? '+' : ''}{formatEth(prediction.userStake?.potentialProfit || 0)} ETH
                      </span>
                    </p>
                    <p><strong>Outcome:</strong> {prediction.outcome ? 'YES' : 'NO'}</p>
                  </div>
                  <div className="card-actions">
                    <button 
                      onClick={() => handleClaimReward(prediction.id)}
                      disabled={isTransactionLoading}
                      className="claim-btn"
                    >
                      {isTransactionLoading ? 'Processing...' : '💰 Claim Reward'}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Active Predictions */}
      {activePredictions.length > 0 && (
        <div className="section">
          <h3>⏳ Active Predictions</h3>
          <div className="predictions-grid">
            {activePredictions.map((prediction) => (
              <div key={prediction.id} className="prediction-card active">
                <div className="card-header">
                  <h4>{prediction.question}</h4>
                  <span className="status-badge active">ACTIVE</span>
                </div>
                <div className="card-content">
                  <p><strong>Your Stake:</strong> {formatEth((prediction.userStake?.yesAmount || 0) + (prediction.userStake?.noAmount || 0))} ETH</p>
                  <p><strong>Deadline:</strong> {new Date(prediction.deadline * 1000).toLocaleString()}</p>
                  <p><strong>Time Left:</strong> {Math.max(0, Math.floor((prediction.deadline - Date.now() / 1000) / 3600))} hours</p>
                </div>
                <div className="card-actions">
                  <button 
                    disabled
                    className="claim-btn disabled"
                    title="Prediction is still active - wait for resolution"
                  >
                    ⏳ Claim Reward (Active)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expired Predictions (waiting for resolution) */}
      {expiredPredictions.length > 0 && (
        <div className="section">
          <h3>⏰ Expired Predictions (Waiting for Resolution)</h3>
          <div className="predictions-grid">
            {expiredPredictions.map((prediction) => (
              <div key={prediction.id} className="prediction-card expired">
                <div className="card-header">
                  <h4>{prediction.question}</h4>
                  <span className="status-badge expired">EXPIRED</span>
                </div>
                <div className="card-content">
                  <p><strong>Your Stake:</strong> {formatEth((prediction.userStake?.yesAmount || 0) + (prediction.userStake?.noAmount || 0))} ETH</p>
                  <p><strong>Deadline:</strong> {new Date(prediction.deadline * 1000).toLocaleString()}</p>
                  <p><strong>Status:</strong> Waiting for admin resolution</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resolved Predictions (already claimed) */}
      {resolvedPredictions.filter(p => p.userStake?.claimed).length > 0 && (
        <div className="section">
          <h3>✅ Resolved Predictions (Claimed)</h3>
          <div className="predictions-grid">
            {resolvedPredictions
              .filter(p => p.userStake?.claimed)
              .map((prediction) => (
                <div key={prediction.id} className="prediction-card claimed">
                  <div className="card-header">
                    <h4>{prediction.question}</h4>
                    <span className="status-badge claimed">CLAIMED</span>
                  </div>
                  <div className="card-content">
                    <p><strong>Your Stake:</strong> {formatEth((prediction.userStake?.yesAmount || 0) + (prediction.userStake?.noAmount || 0))} ETH</p>
                    <p><strong>Payout:</strong> {formatEth(prediction.userStake?.potentialPayout || 0)} ETH</p>
                    <p><strong>Profit:</strong> 
                      <span className={(prediction.userStake?.potentialProfit || 0) >= 0 ? 'profit' : 'loss'}>
                        {(prediction.userStake?.potentialProfit || 0) >= 0 ? '+' : ''}{formatEth(prediction.userStake?.potentialProfit || 0)} ETH
                      </span>
                    </p>
                    <p><strong>Outcome:</strong> {prediction.outcome ? 'YES' : 'NO'}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Cancelled Predictions */}
      {cancelledPredictions.length > 0 && (
        <div className="section">
          <h3>❌ Cancelled Predictions</h3>
          <div className="predictions-grid">
            {cancelledPredictions.map((prediction) => (
              <div key={prediction.id} className="prediction-card cancelled">
                <div className="card-header">
                  <h4>{prediction.question}</h4>
                  <span className="status-badge cancelled">CANCELLED</span>
                </div>
                <div className="card-content">
                  <p><strong>Your Stake:</strong> {formatEth((prediction.userStake?.yesAmount || 0) + (prediction.userStake?.noAmount || 0))} ETH</p>
                  <p><strong>Refund:</strong> {formatEth(prediction.userStake?.potentialPayout || 0)} ETH</p>
                  <p><strong>Status:</strong> {prediction.userStake?.claimed ? 'Refunded' : 'Ready to claim refund'}</p>
                </div>
                {!prediction.userStake?.claimed && (
                  <div className="card-actions">
                    <button 
                      onClick={() => handleClaimReward(prediction.id)}
                      disabled={isTransactionLoading}
                      className="claim-btn"
                    >
                      {isTransactionLoading ? 'Processing...' : '💰 Claim Refund'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No predictions message */}
      {userPredictions.length === 0 && (
        <div className="no-predictions">
          <h3>📝 No Predictions Found</h3>
          <p>You haven't participated in any predictions yet.</p>
          <p>Start by swiping on some predictions to place your stakes!</p>
        </div>
      )}

      {/* Transaction History */}
      <div className="section">
        <h3>📊 Transaction History</h3>
        {loadingTransactions ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading transaction history...</p>
          </div>
        ) : userTransactions.length > 0 ? (
          <div className="transactions-list">
                         {userTransactions.map((transaction) => {
               // Determine the actual status to display
               let displayStatus = transaction.status;
               if (transaction.txHash && transaction.txHash !== 'undefined' && transaction.txHash.length > 10) {
                 // If we have a valid transaction hash, assume it's successful
                 displayStatus = 'success';
               }
               
               return (
                 <div key={transaction.id} className="transaction-card">
                   <div className="transaction-header">
                     <div className="transaction-type">
                       <span className={`type-badge ${transaction.type}`}>
                         {transaction.type === 'claim' && '💰'}
                         {transaction.type === 'stake' && '🎯'}
                         {transaction.type === 'resolve' && '✅'}
                         {transaction.type === 'cancel' && '🚫'}
                         {transaction.type.toUpperCase()}
                       </span>
                       <span className={`status-badge ${displayStatus}`}>
                         {displayStatus === 'pending' && '⏳'}
                         {displayStatus === 'success' && '✅'}
                         {displayStatus === 'failed' && '❌'}
                         {displayStatus.toUpperCase()}
                       </span>
                     </div>
                     <div className="transaction-time">
                       {new Date(transaction.timestamp).toLocaleString()}
                     </div>
                   </div>
                <div className="transaction-details">
                  <p><strong>Prediction:</strong> {transaction.predictionQuestion}</p>
                  <p><strong>Transaction Hash:</strong> 
                    {transaction.txHash ? (
                      <a 
                        href={transaction.basescanUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="basescan-link"
                      >
                        {transaction.txHash.substring(0, 10)}...{transaction.txHash.substring(transaction.txHash.length - 8)}
                      </a>
                    ) : (
                      <span>Pending...</span>
                    )}
                  </p>
                  {transaction.amount && (
                    <p><strong>Amount:</strong> {formatEth(transaction.amount)} ETH</p>
                  )}
                  {transaction.blockNumber && (
                    <p><strong>Block:</strong> {transaction.blockNumber}</p>
                  )}
                </div>
              </div>
               );
             })}
          </div>
        ) : (
          <div className="no-transactions">
            <p>No transactions found. Your transaction history will appear here.</p>
          </div>
        )}
      </div>

      {/* Custom Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {modalType === 'claim' && '🎯 CLAIM TRANSACTION SENT!'}
                {modalType === 'success' && '✅ CLAIM SUCCESSFUL!'}
                {modalType === 'error' && '❌ ERROR'}
              </h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            
            <div className="modal-body">
              {modalType === 'claim' && (
                <>
                  <div className="transaction-info">
                    <p><strong>Transaction Hash:</strong> {modalData.txHash}</p>
                    <p><strong>Status:</strong> Waiting for confirmation...</p>
                  </div>
                  <div className="modal-actions">
                    <a 
                      href={modalData.basescanUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="basescan-btn"
                    >
                      🔗 View on Basescan
                    </a>
                  </div>
                </>
              )}
              
              {modalType === 'success' && (
                <>
                  <div className="transaction-info">
                    <p><strong>Transaction Hash:</strong> {modalData.txHash}</p>
                    <p><strong>Status:</strong> ✅ Confirmed on blockchain!</p>
                    <p><strong>Note:</strong> Dashboard is refreshing...</p>
                  </div>
                  <div className="modal-actions">
                    <a 
                      href={modalData.basescanUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="basescan-btn"
                    >
                      🔗 View on Basescan
                    </a>
                    <button 
                      onClick={() => {
                        fetchUserStakes();
                        fetchUserTransactions();
                        closeModal();
                      }}
                      className="refresh-btn"
                    >
                      🔄 Refresh Dashboard
                    </button>
                  </div>
                </>
              )}
              
              {modalType === 'error' && (
                <>
                  <div className="error-info">
                    <p>{modalData.message}</p>
                  </div>
                  <div className="modal-actions">
                    <button className="retry-btn" onClick={closeModal}>
                      OK
                    </button>
                  </div>
                </>
              )}
            </div>
            
            <div className="modal-footer">
              <p className="auto-close-notice">This modal will close automatically in 3 seconds</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

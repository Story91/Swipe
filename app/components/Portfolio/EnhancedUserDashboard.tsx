"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../lib/contract';
import { ethers } from 'ethers';
import { useRedisPredictions } from '../../../lib/hooks/useRedisPredictions';
import { RedisPrediction, RedisUserStake, UserTransaction } from '../../../lib/types/redis';
import { generateBasescanUrl, generateTransactionId } from '../../../lib/utils/redis-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  
  // Filter state
  const [selectedFilter, setSelectedFilter] = useState<string>('ready-to-claim');
  
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
                  isWinner = false;
                  potentialPayout = 0;
                  potentialProfit = -userStakeAmount;
                  canClaim = false;
                }
              } else if (prediction.cancelled && !userStake.claimed) {
                // Full refund for cancelled predictions
                potentialPayout = userStakeAmount;
                potentialProfit = 0;
                canClaim = true;
              } else if (!prediction.resolved && !prediction.cancelled && prediction.deadline > Date.now() / 1000) {
                // Active prediction - calculate potential payout based on current pool
                const yesPool = prediction.yesTotalAmount || 0;
                const noPool = prediction.noTotalAmount || 0;
                
                if (userStake.yesAmount > 0) {
                  // User bet YES - calculate potential payout if YES wins
                  if (yesPool > 0) {
                    const platformFee = noPool * 0.01; // 1% platform fee from losers
                    const netNoPool = noPool - platformFee;
                    potentialPayout = userStakeAmount + (userStake.yesAmount / yesPool) * netNoPool;
                    potentialProfit = potentialPayout - userStakeAmount;
                  }
                } else if (userStake.noAmount > 0) {
                  // User bet NO - calculate potential payout if NO wins
                  if (noPool > 0) {
                    const platformFee = yesPool * 0.01; // 1% platform fee from losers
                    const netYesPool = yesPool - platformFee;
                    potentialPayout = userStakeAmount + (userStake.noAmount / noPool) * netYesPool;
                    potentialProfit = potentialPayout - userStakeAmount;
                  }
                }
                canClaim = false; // Can't claim until resolved
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
                  isWinner = false;
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

  // No auto-refresh - data loads once on page load

  // Initial fetch - only fetch transactions initially
  useEffect(() => {
    fetchUserTransactions();
  }, [fetchUserTransactions]);

  // Fetch user stakes when predictions are loaded
  useEffect(() => {
    if (allPredictions && allPredictions.length > 0 && address) {
      console.log('🔄 Predictions loaded, fetching user stakes...');
      fetchUserStakes();
    }
  }, [allPredictions, address]);

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
  
  // Group all user predictions by win/loss (including claimed ones)
  const wonPredictions = userPredictions.filter(p => p.userStake?.isWinner && p.status === 'resolved');
  const lostPredictions = userPredictions.filter(p => !p.userStake?.isWinner && (p.userStake?.potentialProfit || 0) < 0 && p.status === 'resolved');
  
  // Filter predictions based on selected filter
  const getFilteredPredictions = () => {
    switch (selectedFilter) {
      case 'ready-to-claim':
        return userPredictions.filter(p => p.userStake?.canClaim && !p.userStake?.claimed);
      case 'active':
        return activePredictions;
      case 'won':
        return wonPredictions;
      case 'lost':
        return lostPredictions;
      case 'expired':
        return expiredPredictions;
      case 'cancelled':
        return cancelledPredictions;
      case 'claimed':
        return resolvedPredictions.filter(p => p.userStake?.claimed);
      case 'all':
        return userPredictions;
      default:
        return userPredictions.filter(p => p.userStake?.canClaim && !p.userStake?.claimed);
    }
  };
  
  const filteredPredictions = getFilteredPredictions();

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
          <div className="loading-logo">
            <img src="/splash.png" alt="Loading..." className="spinning-logo" />
          </div>
          <p>Loading your predictions...</p>
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

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="stat-card">
          <h3>Total<br/>Staked</h3>
          <p className="stat-value-total">{formatEth(totalStaked)} ETH</p>
        </div>
        <div className="stat-card">
          <h3>Potential<br/>Payout</h3>
          <p className="stat-value-payout">{formatEth(totalPotentialPayout)} ETH</p>
        </div>
        <div className="stat-card">
          <h3>Potential<br/>Profit</h3>
          <p className={`stat-value-profit ${totalPotentialProfit >= 0 ? 'profit' : 'loss'}`}>
            {totalPotentialProfit >= 0 ? '+' : ''}{formatEth(totalPotentialProfit)} ETH
          </p>
        </div>
        <div className="stat-card">
          <h3>Ready to<br/>Claim</h3>
          <p className="stat-value-claim">{canClaimCount} predictions</p>
        </div>
      </div>

      {/* Filter */}
      <div className="filter-section">
        <div className="filter-container">
          <label htmlFor="prediction-filter" className="filter-label">
            Filter Predictions:
          </label>
          <Select value={selectedFilter} onValueChange={setSelectedFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ready-to-claim">🎉 Ready to Claim</SelectItem>
              <SelectItem value="active">⏳ Active</SelectItem>
              <SelectItem value="won">🏆 Won</SelectItem>
              <SelectItem value="lost">💔 Lost</SelectItem>
              <SelectItem value="expired">⏰ Expired</SelectItem>
              <SelectItem value="cancelled">❌ Cancelled</SelectItem>
              <SelectItem value="claimed">✅ Claimed</SelectItem>
              <SelectItem value="all">📊 All Predictions</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filtered Predictions Section */}
      {filteredPredictions.length > 0 && (
        <div className="section">
          <h3>
            {selectedFilter === 'ready-to-claim' && '🎉 Ready to Claim'}
            {selectedFilter === 'active' && '⏳ Active Predictions'}
            {selectedFilter === 'won' && '🏆 Won Predictions'}
            {selectedFilter === 'lost' && '💔 Lost Predictions'}
            {selectedFilter === 'expired' && '⏰ Expired Predictions (Waiting for Resolution)'}
            {selectedFilter === 'cancelled' && '❌ Cancelled Predictions'}
            {selectedFilter === 'claimed' && '✅ Claimed Predictions'}
            {selectedFilter === 'all' && '📊 All Predictions'}
          </h3>
          <div className="predictions-grid">
            {filteredPredictions.map((prediction) => {
              // Determine card class and status badge based on prediction status
              let cardClass = 'prediction-card';
              let statusBadge = '';
              let statusText = '';
              
              if (prediction.userStake?.canClaim && !prediction.userStake?.claimed) {
                cardClass += ' claimable';
                statusBadge = prediction.cancelled ? 'cancelled' : 'resolved';
                statusText = prediction.cancelled ? 'CANCELLED' : 'RESOLVED';
              } else if (prediction.status === 'active') {
                cardClass += ' active';
                statusBadge = 'active';
                statusText = 'ACTIVE';
              } else if (prediction.userStake?.isWinner) {
                cardClass += ' won';
                statusBadge = 'won';
                statusText = 'WON';
              } else if (!prediction.userStake?.isWinner && (prediction.userStake?.potentialProfit || 0) < 0) {
                cardClass += ' lost';
                statusBadge = 'lost';
                statusText = 'LOST';
              } else if (prediction.status === 'expired') {
                cardClass += ' expired';
                statusBadge = 'expired';
                statusText = 'EXPIRED';
              } else if (prediction.status === 'cancelled') {
                cardClass += ' cancelled';
                statusBadge = 'cancelled';
                statusText = 'CANCELLED';
              } else if (prediction.userStake?.claimed) {
                cardClass += ' claimed';
                statusBadge = 'claimed';
                statusText = 'CLAIMED';
              }

              return (
                <div key={prediction.id} className={cardClass}>
                  <div className="card-header">
                    <h4>{prediction.question}</h4>
                    <span className={`status-badge ${statusBadge}`}>{statusText}</span>
                  </div>
                  <div className="card-content">
                    <p><strong>Your Stake:</strong> {formatEth((prediction.userStake?.yesAmount || 0) + (prediction.userStake?.noAmount || 0))} ETH</p>
                    
                    {prediction.status === 'active' ? (
                      <>
                        <p><strong>Your Choice:</strong> {(prediction.userStake?.yesAmount || 0) > 0 ? 'YES' : 'NO'}</p>
                        <p><strong>Potential Payout:</strong> {formatEth(prediction.userStake?.potentialPayout || 0)} ETH</p>
                        <p><strong>Potential Profit:</strong> 
                          <span className={(prediction.userStake?.potentialProfit || 0) >= 0 ? 'profit' : 'loss'}>
                            {(prediction.userStake?.potentialProfit || 0) >= 0 ? '+' : ''}{formatEth(prediction.userStake?.potentialProfit || 0)} ETH
                          </span>
                        </p>
                        <p><strong>Deadline:</strong> {new Date(prediction.deadline * 1000).toLocaleString()}</p>
                        <p><strong>Time Left:</strong> {Math.max(0, Math.floor((prediction.deadline - Date.now() / 1000) / 3600))} hours</p>
                      </>
                    ) : prediction.status === 'expired' ? (
                      <>
                        <p><strong>Deadline:</strong> {new Date(prediction.deadline * 1000).toLocaleString()}</p>
                        <p><strong>Status:</strong> Waiting for admin resolution</p>
                      </>
                    ) : prediction.status === 'cancelled' ? (
                      <>
                        <p><strong>Refund:</strong> {formatEth(prediction.userStake?.potentialPayout || 0)} ETH</p>
                        <p><strong>Status:</strong> {prediction.userStake?.claimed ? 'Refunded' : 'Ready to claim refund'}</p>
                      </>
                    ) : (
                      <>
                        <p><strong>Payout:</strong> {formatEth(prediction.userStake?.potentialPayout || 0)} ETH</p>
                        <p><strong>Profit:</strong> 
                          <span className={(prediction.userStake?.potentialProfit || 0) >= 0 ? 'profit' : 'loss'}>
                            {(prediction.userStake?.potentialProfit || 0) >= 0 ? '+' : ''}{formatEth(prediction.userStake?.potentialProfit || 0)} ETH
                          </span>
                        </p>
                        <p><strong>Outcome:</strong> {prediction.outcome ? 'YES' : 'NO'}</p>
                        {prediction.userStake?.claimed && <p><strong>Status:</strong> Claimed</p>}
                        {!prediction.userStake?.claimed && prediction.userStake?.isWinner && <p><strong>Status:</strong> Ready to claim</p>}
                        {!prediction.userStake?.isWinner && (prediction.userStake?.potentialProfit || 0) < 0 && <p><strong>Status:</strong> Lost - no payout</p>}
                      </>
                    )}
                  </div>
                  
                  {/* Show claim button only for claimable predictions */}
                  {(prediction.userStake?.canClaim && !prediction.userStake?.claimed) && (
                    <div className="card-actions">
                      <button 
                        onClick={() => handleClaimReward(prediction.id)}
                        disabled={isTransactionLoading}
                        className="claim-btn"
                      >
                        {isTransactionLoading ? 'Processing...' : '💰 Claim Reward'}
                      </button>
                    </div>
                  )}
                  
                  {/* Show disabled button for active predictions */}
                  {prediction.status === 'active' && (
                    <div className="card-actions">
                      <button 
                        disabled
                        className="claim-btn disabled"
                        title="Prediction is still active - wait for resolution"
                      >
                        ⏳ Claim Reward (Active)
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
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

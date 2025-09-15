"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS, getV1Contract, getV2Contract, getContractForPrediction } from '../../../lib/contract';
import { ethers } from 'ethers';
import { useRedisPredictions } from '../../../lib/hooks/useRedisPredictions';
import { RedisPrediction, RedisUserStake, UserTransaction } from '../../../lib/types/redis';
import { generateBasescanUrl, generateTransactionId } from '../../../lib/utils/redis-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LegacyCard } from './LegacyCard';
import './EnhancedUserDashboard.css';

interface PredictionWithStakes extends RedisPrediction {
  userStakes?: {
    ETH?: {
    predictionId: string;
    yesAmount: number;
    noAmount: number;
    claimed: boolean;
    potentialPayout: number;
    potentialProfit: number;
    canClaim: boolean;
    isWinner: boolean;
    };
    SWIPE?: {
      predictionId: string;
      yesAmount: number;
      noAmount: number;
      claimed: boolean;
      potentialPayout: number;
      potentialProfit: number;
      canClaim: boolean;
      isWinner: boolean;
    };
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
      console.log(`🔍 Current userPredictions state:`, userPredictions);
      
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
          console.log(`🔍 Processing prediction ${prediction.id}...`);
          
          // Check if this is a V1 prediction
          const isV1 = prediction.id.startsWith('pred_v1_');
          
          // For V1 predictions, show all (even without user stakes)
          // For V2 predictions, only show if user has stakes
          if (isV1) {
            console.log(`📋 V1 prediction - checking for user stakes: ${prediction.id}`);
            
            // Check if user has stakes in this V1 prediction
            const stakeInfo = await fetch(`/api/stakes?predictionId=${prediction.id}&userId=${address.toLowerCase()}`);
            const stakeData = await stakeInfo.json();
            
            let userStakes = {};
            
            if (stakeData.success && stakeData.data.length > 0) {
              console.log(`💰 Found ${stakeData.data.length} V1 stakes for prediction ${prediction.id}:`, stakeData.data);
              
              // Process V1 stakes (they are always ETH)
              for (const userStake of stakeData.data) {
                if (userStake.yesAmount > 0 || userStake.noAmount > 0) {
                  console.log(`💰 Processing V1 ETH stake:`, userStake);
                  
                  // In V1, user can only stake on one side, so determine which side
                  const isYesStake = userStake.yesAmount > 0;
                  const isNoStake = userStake.noAmount > 0;
                  
                  // This should never happen in V1, but just in case
                  if (isYesStake && isNoStake) {
                    console.warn(`⚠️ V1 user has stakes on both sides - this shouldn't happen!`, userStake);
                    // Use the larger stake
                    const useYes = userStake.yesAmount >= userStake.noAmount;
                    console.log(`⚠️ Using ${useYes ? 'YES' : 'NO'} stake: ${useYes ? userStake.yesAmount : userStake.noAmount}`);
                  }
                  
                  // Determine which side user staked on (should be only one in V1)
                  const userStakedYes = userStake.yesAmount > 0;
                  const userStakedNo = userStake.noAmount > 0;
                  
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
                    
                    if (prediction.outcome && userStakedYes) {
                      // User bet YES and won
                      isWinner = true;
                      potentialPayout = userStake.yesAmount + (userStake.yesAmount / winnersPool) * netLosersPool;
                      potentialProfit = potentialPayout - userStake.yesAmount;
                      canClaim = true;
                    } else if (!prediction.outcome && userStakedNo) {
                      // User bet NO and won
                      isWinner = true;
                      potentialPayout = userStake.noAmount + (userStake.noAmount / winnersPool) * netLosersPool;
                      potentialProfit = potentialPayout - userStake.noAmount;
                      canClaim = true;
                    } else {
                      // User lost - they staked on the losing side
                      isWinner = false;
                      potentialPayout = 0;
                      potentialProfit = -(userStakedYes ? userStake.yesAmount : userStake.noAmount);
                      canClaim = false;
                    }
                  } else if (prediction.cancelled && !userStake.claimed) {
                    // Full refund for cancelled predictions
                    potentialPayout = userStakedYes ? userStake.yesAmount : userStake.noAmount;
                    potentialProfit = 0;
                    canClaim = true;
                  } else if (!prediction.resolved && !prediction.cancelled && prediction.deadline > Date.now() / 1000) {
                    // Active prediction - calculate potential payout based on current pool
                    const yesPool = prediction.yesTotalAmount || 0;
                    const noPool = prediction.noTotalAmount || 0;
                    
                    if (userStakedYes) {
                      // User bet YES - calculate potential payout if YES wins
                      if (yesPool > 0) {
                        const platformFee = noPool * 0.01; // 1% platform fee from losers
                        const netNoPool = noPool - platformFee;
                        potentialPayout = userStake.yesAmount + (userStake.yesAmount / yesPool) * netNoPool;
                        potentialProfit = potentialPayout - userStake.yesAmount;
                      }
                    } else if (userStakedNo) {
                      // User bet NO - calculate potential payout if NO wins
                      if (noPool > 0) {
                        const platformFee = yesPool * 0.01; // 1% platform fee from losers
                        const netYesPool = yesPool - platformFee;
                        potentialPayout = userStake.noAmount + (userStake.noAmount / noPool) * netYesPool;
                        potentialProfit = potentialPayout - userStake.noAmount;
                      }
                    }
                    canClaim = false; // Can't claim until resolved
                  } else if (prediction.resolved && userStake.claimed) {
                    // Already claimed - show as claimed with calculated payout
                    const winnersPool = prediction.outcome ? prediction.yesTotalAmount : prediction.noTotalAmount;
                    const losersPool = prediction.outcome ? prediction.noTotalAmount : prediction.yesTotalAmount;
                    const platformFee = losersPool * 0.01; // 1% platform fee
                    const netLosersPool = losersPool - platformFee;

                    if (prediction.outcome && userStakedYes) {
                      // User bet YES and won
                      isWinner = true;
                      potentialPayout = userStake.yesAmount + (userStake.yesAmount / winnersPool) * netLosersPool;
                      potentialProfit = potentialPayout - userStake.yesAmount;
                      canClaim = false; // Already claimed
                    } else if (!prediction.outcome && userStakedNo) {
                      // User bet NO and won
                      isWinner = true;
                      potentialPayout = userStake.noAmount + (userStake.noAmount / winnersPool) * netLosersPool;
                      potentialProfit = potentialPayout - userStake.noAmount;
                      canClaim = false; // Already claimed
                    } else {
                      // User lost
                      isWinner = false;
                      potentialPayout = 0;
                      potentialProfit = -(userStakedYes ? userStake.yesAmount : userStake.noAmount);
                      canClaim = false;
                    }
                  }

                  userStakes = {
                    ETH: {
                      predictionId: userStake.predictionId,
                      yesAmount: userStakedYes ? userStake.yesAmount : 0,
                      noAmount: userStakedNo ? userStake.noAmount : 0,
                      claimed: userStake.claimed,
                      potentialPayout,
                      potentialProfit,
                      canClaim,
                      isWinner
                    }
                  };
                }
              }
            }
            
            // Create V1 prediction with or without stakes
            const predictionWithStakes: PredictionWithStakes = {
              ...prediction,
              userStakes,
              status: prediction.resolved ? 'resolved' : 
                     prediction.cancelled ? 'cancelled' :
                     prediction.deadline <= Date.now() / 1000 ? 'expired' : 'active'
            };

            userPredictionsWithStakes.push(predictionWithStakes);
            continue; // Skip V2 processing for V1 predictions
          }
          
          // For V2 predictions, only show if user has stakes
          console.log(`🔍 Fetching stake for V2 prediction ${prediction.id} and user ${address.toLowerCase()}`);
          const stakeInfo = await fetch(`/api/stakes?predictionId=${prediction.id}&userId=${address.toLowerCase()}`);
          const stakeData = await stakeInfo.json();
          
          console.log(`🔍 API response for prediction ${prediction.id}:`, stakeData);
          
          // Only process V2 predictions if user has stakes
          if (stakeData.success && stakeData.data.length > 0) {
            console.log(`💰 Found ${stakeData.data.length} stakes for prediction ${prediction.id}:`, stakeData.data);
            
            // Group stakes by token type
            const stakesByToken: { [key: string]: any } = {};
            
            for (const userStake of stakeData.data) {
            if (userStake.yesAmount > 0 || userStake.noAmount > 0) {
                const tokenType = userStake.tokenType || 'ETH'; // Default to ETH for V1 stakes
                console.log(`💰 Processing ${tokenType} stake:`, userStake);
                console.log(`💰 TokenType from API:`, userStake.tokenType);
              
              let potentialPayout = 0;
              let potentialProfit = 0;
              let canClaim = false;
              let isWinner = false;
              const userStakeAmount = userStake.yesAmount + userStake.noAmount;

              // Get the correct pools based on token type
              const isSwipeStake = tokenType === 'SWIPE';
              const yesPool = isSwipeStake ? (prediction.swipeYesTotalAmount || 0) : (prediction.yesTotalAmount || 0);
              const noPool = isSwipeStake ? (prediction.swipeNoTotalAmount || 0) : (prediction.noTotalAmount || 0);

              // Calculate payout for resolved predictions
              if (prediction.resolved && !userStake.claimed) {
                const winnersPool = prediction.outcome ? yesPool : noPool;
                const losersPool = prediction.outcome ? noPool : yesPool;
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
                const winnersPool = prediction.outcome ? yesPool : noPool;
                const losersPool = prediction.outcome ? noPool : yesPool;
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

                stakesByToken[tokenType] = {
                  predictionId: userStake.predictionId,
                  yesAmount: userStake.yesAmount,
                  noAmount: userStake.noAmount,
                  claimed: userStake.claimed,
                potentialPayout,
                potentialProfit,
                canClaim,
                isWinner
              };
              console.log(`💰 Saved ${tokenType} stake to stakesByToken:`, stakesByToken[tokenType]);
              }
            }
            
            console.log(`💰 Final stakesByToken for prediction ${prediction.id}:`, stakesByToken);
            
            // Only add prediction if there are stakes
            if (Object.keys(stakesByToken).length > 0) {
              const predictionWithStakes: PredictionWithStakes = {
                ...prediction,
                userStakes: stakesByToken,
                status: prediction.resolved ? 'resolved' : 
                       prediction.cancelled ? 'cancelled' :
                       prediction.deadline <= Date.now() / 1000 ? 'expired' : 'active'
              };

              userPredictionsWithStakes.push(predictionWithStakes);
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch stake for prediction ${prediction.id}:`, error);
        }
      }
      
      console.log(`📊 Found ${userPredictionsWithStakes.length} predictions with stakes for user ${address}`);
      console.log(`📊 User predictions data:`, userPredictionsWithStakes);
      
      // Check if any predictions have claimed status
      const claimedPredictions = userPredictionsWithStakes.filter(p => {
        const ethStake = p.userStakes?.ETH;
        const swipeStake = p.userStakes?.SWIPE;
        return ethStake?.claimed || swipeStake?.claimed;
      });
      console.log(`📊 Claimed predictions:`, claimedPredictions);
      
      setUserPredictions(userPredictionsWithStakes);
    } catch (error) {
      console.error('Failed to fetch user stakes:', error);
    } finally {
      setLoadingStakes(false);
    }
  }, [address, allPredictions, predictionsLoading, userPredictions]);

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
  const handleClaimReward = async (predictionId: string, tokenType?: 'ETH' | 'SWIPE') => {
    if (!address) {
      alert('❌ Please connect your wallet first');
      return;
    }

    setIsTransactionLoading(true);
    try {
      // Check if this is a blockchain prediction (starts with pred_)
      if (predictionId.startsWith('pred_')) {
        // Extract numeric ID for blockchain transaction
        let numericId: number;
        
        if (predictionId.startsWith('pred_v1_')) {
          // V1 prediction: pred_v1_9 -> 9
          numericId = parseInt(predictionId.replace('pred_v1_', ''));
        } else if (predictionId.startsWith('pred_v2_')) {
          // V2 prediction: pred_v2_9 -> 9
          numericId = parseInt(predictionId.replace('pred_v2_', ''));
        } else {
          // Legacy prediction: pred_9 -> 9
          numericId = parseInt(predictionId.replace('pred_', ''));
        }
        
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

        // Determine which contract to use based on prediction ID
        const isV1 = predictionId.startsWith('pred_v1_');
        const contract = isV1 ? CONTRACTS.V1 : CONTRACTS.V2;
        
        console.log(`🎯 Using ${isV1 ? 'V1' : 'V2'} contract for claim`);

        // Determine function name based on token type
        const functionName = tokenType === 'SWIPE' ? 'claimRewardWithToken' : 'claimReward';
        console.log(`🎯 Claiming ${tokenType || 'ETH'} reward using function: ${functionName}`);

        // Call blockchain claim transaction with callbacks
        writeContract({
          address: contract.address as `0x${string}`,
          abi: contract.abi,
          functionName: functionName,
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
                  
                  const response = await fetch(`/api/check-transaction?txHash=${txHash}`);
                  const data = await response.json();
                  
                  console.log(`📊 Transaction status response:`, data);
                  
                  if (data.success && data.data.status === 'success') {
                    console.log('✅ Transaction confirmed successfully');
                    resolve({ status: 'success' });
                  } else if (data.success && data.data.status === 'failed' && attempts > 5) {
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
                console.log(`🔄 Marking stake as claimed for prediction ${predictionId}...`);
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
                  const responseData = await updateStakeResponse.json();
                  console.log('✅ Redis update response:', responseData);
                } else {
                  console.error('❌ Failed to mark stake as claimed');
                  const errorData = await updateStakeResponse.json();
                  console.error('❌ Error response:', errorData);
                }
              } catch (stakeUpdateError) {
                console.error('❌ Error updating stake as claimed:', stakeUpdateError);
              }
              
              // Show success modal
              showSuccessModal(txHash, transaction.basescanUrl);
              
              // Auto-sync the specific prediction after claim
              try {
                const syncResponse = await fetch('/api/blockchain/events', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    eventType: 'reward_claimed',
                    predictionId: predictionId.replace('pred_v2_', '').replace('pred_v1_', ''),
                    contractVersion: predictionId.startsWith('pred_v1_') ? 'V1' : 'V2'
                  })
                });
                
                if (syncResponse.ok) {
                  console.log('✅ Prediction auto-synced after claim');
                } else {
                  console.warn('⚠️ Auto-sync failed after claim');
                }
              } catch (syncError) {
                console.error('❌ Failed to auto-sync after claim:', syncError);
              }
              
              // Refresh user data immediately after successful claim
              console.log('🔄 Refreshing data after successful claim...');
              console.log('🔄 About to call fetchUserStakes...');
              
              // Add a small delay to ensure Redis is updated
              setTimeout(() => {
                console.log('🔄 Calling fetchUserStakes after delay...');
                fetchUserStakes();
                fetchUserTransactions();
                console.log('🔄 fetchUserStakes called');
              }, 1000);
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
  const wonPredictions = userPredictions.filter(p => {
    const ethStake = p.userStakes?.ETH;
    const swipeStake = p.userStakes?.SWIPE;
    return (ethStake?.isWinner || swipeStake?.isWinner) && p.status === 'resolved';
  });
  const lostPredictions = userPredictions.filter(p => {
    const ethStake = p.userStakes?.ETH;
    const swipeStake = p.userStakes?.SWIPE;
    const ethLost = ethStake && !ethStake.isWinner && (ethStake.potentialProfit || 0) < 0;
    const swipeLost = swipeStake && !swipeStake.isWinner && (swipeStake.potentialProfit || 0) < 0;
    return (ethLost || swipeLost) && p.status === 'resolved';
  });
  
  // Filter predictions based on selected filter
  const getFilteredPredictions = () => {
    switch (selectedFilter) {
      case 'ready-to-claim':
        return userPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          return (ethStake?.canClaim && !ethStake?.claimed) || (swipeStake?.canClaim && !swipeStake?.claimed);
        });
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
        return resolvedPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          return ethStake?.claimed || swipeStake?.claimed;
        });
      case 'all':
        return userPredictions;
      default:
        return userPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          return (ethStake?.canClaim && !ethStake?.claimed) || (swipeStake?.canClaim && !swipeStake?.claimed);
        });
    }
  };
  
  const filteredPredictions = getFilteredPredictions();

  // Calculate totals - separate ETH and SWIPE
  const ethTotalStaked = userPredictions.reduce((sum, p) => {
    const ethStake = p.userStakes?.ETH;
    const ethAmount = (ethStake?.yesAmount || 0) + (ethStake?.noAmount || 0);
    return sum + ethAmount;
  }, 0);
  
  const swipeTotalStaked = userPredictions.reduce((sum, p) => {
    const swipeStake = p.userStakes?.SWIPE;
    const swipeAmount = (swipeStake?.yesAmount || 0) + (swipeStake?.noAmount || 0);
    return sum + swipeAmount;
  }, 0);
  
  const ethTotalPotentialPayout = userPredictions.reduce((sum, p) => {
    const ethStake = p.userStakes?.ETH;
    return sum + (ethStake?.potentialPayout || 0);
  }, 0);
  
  const swipeTotalPotentialPayout = userPredictions.reduce((sum, p) => {
    const swipeStake = p.userStakes?.SWIPE;
    return sum + (swipeStake?.potentialPayout || 0);
  }, 0);
  
  const ethTotalPotentialProfit = userPredictions.reduce((sum, p) => {
    const ethStake = p.userStakes?.ETH;
    return sum + (ethStake?.potentialProfit || 0);
  }, 0);
  
  const swipeTotalPotentialProfit = userPredictions.reduce((sum, p) => {
    const swipeStake = p.userStakes?.SWIPE;
    return sum + (swipeStake?.potentialProfit || 0);
  }, 0);
  
  const canClaimCount = userPredictions.filter(p => {
    const ethStake = p.userStakes?.ETH;
    const swipeStake = p.userStakes?.SWIPE;
    return (ethStake?.canClaim && !ethStake?.claimed) || (swipeStake?.canClaim && !swipeStake?.claimed);
  }).length;

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
        {/* ETH Stats */}
        <div className="stat-card eth-card">
          <h3>ETH Total<br/>Staked</h3>
          <p className="stat-value-total">{formatEth(ethTotalStaked)} ETH</p>
        </div>
        <div className="stat-card eth-card">
          <h3>ETH Potential<br/>Payout</h3>
          <p className="stat-value-payout">{formatEth(ethTotalPotentialPayout)} ETH</p>
        </div>
        <div className="stat-card eth-card">
          <h3>ETH Potential<br/>Profit</h3>
          <p className={`stat-value-profit ${ethTotalPotentialProfit >= 0 ? 'profit' : 'loss'}`}>
            {ethTotalPotentialProfit >= 0 ? '+' : ''}{formatEth(ethTotalPotentialProfit)} ETH
          </p>
        </div>
        
        {/* SWIPE Stats */}
        <div className="stat-card swipe-card">
          <h3>SWIPE Total<br/>Staked</h3>
          <p className="stat-value-total">{formatEth(swipeTotalStaked)} SWIPE</p>
        </div>
        <div className="stat-card swipe-card">
          <h3>SWIPE Potential<br/>Payout</h3>
          <p className="stat-value-payout">{formatEth(swipeTotalPotentialPayout)} SWIPE</p>
        </div>
        <div className="stat-card swipe-card">
          <h3>SWIPE Potential<br/>Profit</h3>
          <p className={`stat-value-profit ${swipeTotalPotentialProfit >= 0 ? 'profit' : 'loss'}`}>
            {swipeTotalPotentialProfit >= 0 ? '+' : ''}{formatEth(swipeTotalPotentialProfit)} SWIPE
          </p>
        </div>
        
        {/* General Stats */}
        <div className="stat-card general-card">
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
              // Check if this is a V1 prediction
              const isV1 = prediction.id.startsWith('pred_v1_');
              
              if (isV1) {
                // Use LegacyCard for V1 predictions
                return (
                  <LegacyCard
                    key={prediction.id}
                    prediction={prediction}
                    onClaimReward={handleClaimReward}
                    isTransactionLoading={isTransactionLoading}
                  />
                );
              } else {
                // Use LegacyCard for all V2 predictions
                return (
                  <LegacyCard
                    key={prediction.id}
                    prediction={prediction}
                    onClaimReward={handleClaimReward}
                    isTransactionLoading={isTransactionLoading}
                  />
                );
              }
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

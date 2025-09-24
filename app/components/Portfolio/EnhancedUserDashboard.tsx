"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACTS, getV1Contract, getV2Contract, getContractForPrediction } from '../../../lib/contract';
import { ethers } from 'ethers';
import { useHybridPredictions } from '../../../lib/hooks/useHybridPredictions';
import { RedisPrediction, RedisUserStake, UserTransaction } from '../../../lib/types/redis';
import { generateBasescanUrl, generateTransactionId } from '../../../lib/utils/redis-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LegacyCard } from './LegacyCard';
import './EnhancedUserDashboard.css';

interface PredictionWithStakes {
  // Core data
  id: string;
  question: string;
  description: string;
  category: string;
  imageUrl: string;
  deadline: number;
  creator: string;
  verified: boolean;
  needsApproval: boolean;
  resolved: boolean;
  outcome?: boolean;
  cancelled: boolean;
  yesTotalAmount: number;
  noTotalAmount: number;
  swipeYesTotalAmount: number;
  swipeNoTotalAmount: number;
  totalStakes: number;
  
  // Enhanced data
  includeChart?: boolean;
  selectedCrypto?: string;
  endDate?: string;
  endTime?: string;
  participants: string[];
  createdAt: number;
  approved: boolean;
  
  // User stakes
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
  
  // Local state for tracking claimed stakes
  const [claimedStakes, setClaimedStakes] = useState<Set<string>>(new Set());
  
  // Cache state
  const [cacheLoaded, setCacheLoaded] = useState(false);
  
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

  // Mark stake as claimed locally
  const markStakeAsClaimed = (predictionId: string, tokenType: 'ETH' | 'SWIPE') => {
    const stakeKey = `${predictionId}-${tokenType}`;
    setClaimedStakes(prev => new Set([...prev, stakeKey]));
    
    // Also update the local state immediately
    setUserPredictions(prev => prev.map(pred => {
      if (pred.id === predictionId) {
        const updatedPred = { ...pred };
        
        // Handle multi-token stakes (V2)
        if (updatedPred.userStakes?.[tokenType]) {
          updatedPred.userStakes[tokenType] = {
            ...updatedPred.userStakes[tokenType],
            claimed: true
          };
        }
        
        // Also handle single stake format (V1) - check if it's a direct stake
        if (updatedPred.userStakes && !updatedPred.userStakes.ETH && !updatedPred.userStakes.SWIPE) {
          // This is a V1 single stake - convert to ETH format
          if (tokenType === 'ETH') {
            // For V1 stakes, we need to preserve the original data and add ETH wrapper
            const originalStake = updatedPred.userStakes as any;
            updatedPred.userStakes = {
              ETH: {
                predictionId: originalStake.predictionId || predictionId,
                yesAmount: originalStake.yesAmount || 0,
                noAmount: originalStake.noAmount || 0,
                claimed: true,
                potentialPayout: originalStake.potentialPayout || 0,
                potentialProfit: originalStake.potentialProfit || 0,
                canClaim: originalStake.canClaim || false,
                isWinner: originalStake.isWinner || false
              }
            };
          }
        }
        
        return updatedPred;
      }
      return pred;
    }));
  };

  // Format ETH for display
  const formatEth = (wei: number): string => {
    const eth = weiToEth(wei);
    if (eth === 0) return '0.0000';
    return eth.toFixed(6); // Always use decimal format with 6 decimal places
  };

  // Cache management functions
  const saveToCache = (data: any, key: string) => {
    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
        version: '1.0'
      };
      localStorage.setItem(`dexter_cache_${key}`, JSON.stringify(cacheData));
      console.log(`💾 Cached ${key} data`);
    } catch (error) {
      console.warn('⚠️ Failed to save to cache:', error);
    }
  };

  const loadFromCache = (key: string, maxAge: number = 30 * 1000) => { // 30 seconds default (reduced from 5 minutes)
    try {
      const cached = localStorage.getItem(`dexter_cache_${key}`);
      if (!cached) return null;
      
      const { data, timestamp, version } = JSON.parse(cached);
      
      // Check if cache is still valid
      if (Date.now() - timestamp > maxAge) {
        console.log(`⏰ Cache expired for ${key}`);
        localStorage.removeItem(`dexter_cache_${key}`);
        return null;
      }
      
      console.log(`📦 Loaded ${key} from cache`);
      return data;
    } catch (error) {
      console.warn('⚠️ Failed to load from cache:', error);
      return null;
    }
  };

  const clearCache = () => {
    try {
      const keys = Object.keys(localStorage).filter(key => key.startsWith('dexter_cache_'));
      keys.forEach(key => localStorage.removeItem(key));
      console.log('🗑️ Cache cleared');
    } catch (error) {
      console.warn('⚠️ Failed to clear cache:', error);
    }
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
      fetchUserStakes(true); // Force refresh after claim
      fetchUserTransactions(true); // Force refresh after claim
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
  
  // Hybrid predictions hook (includes both Redis and blockchain data)
  const { predictions: allPredictions, loading: predictionsLoading, error: predictionsError, refresh: refreshPredictions, fetchAllPredictions } = useHybridPredictions();

  // Fetch user transactions with cache
  const fetchUserTransactions = useCallback(async (forceRefresh: boolean = false) => {
    if (!address) return;
    
    // Try to load from cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedTransactions = loadFromCache(`user_transactions_${address.toLowerCase()}`, 2 * 60 * 1000); // 2 minutes cache
      if (cachedTransactions) {
        console.log('📦 Using cached user transactions');
        setUserTransactions(cachedTransactions);
        return;
      }
    }
    
    setLoadingTransactions(true);
    try {
      console.log('🔄 Fetching user transactions from server...');
      const response = await fetch(`/api/user-transactions?userId=${address.toLowerCase()}`);
      const result = await response.json();
      const transactions = result.success ? result.data : [];
      setUserTransactions(transactions);
      console.log(`📊 Loaded ${transactions.length} user transactions`);
      
      // Save to cache
      saveToCache(transactions, `user_transactions_${address.toLowerCase()}`);
    } catch (error) {
      console.error('Failed to fetch user transactions:', error);
    } finally {
      setLoadingTransactions(false);
    }
  }, [address]);

  // Fetch user stakes for predictions - optimized with lazy loading
  const fetchUserStakes = useCallback(async (forceRefresh: boolean = false, filterType: string = 'ready-to-claim') => {
    if (!address) {
      console.log('❌ No address connected, skipping fetchUserStakes');
      return;
    }
    
    // Try to load from cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedData = loadFromCache(`user_predictions_${address.toLowerCase()}`, 10 * 1000); // 10 seconds cache (reduced from 30)
      if (cachedData) {
        console.log('📦 Using cached user predictions');
        setUserPredictions(cachedData);
        setCacheLoaded(true);
        return;
      }
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
      
      // Filter predictions based on filterType for lazy loading
      let filteredPredictions = predictions;
      if (filterType === 'ready-to-claim') {
        // Only load resolved predictions for ready-to-claim filter
        filteredPredictions = predictions.filter(p => p.resolved);
        console.log(`🚀 Lazy loading: Loading only ${filteredPredictions.length} resolved predictions for ready-to-claim`);
      } else if (filterType === 'active') {
        // Only load active predictions
        filteredPredictions = predictions.filter(p => !p.resolved && !p.cancelled && p.deadline > Date.now() / 1000);
        console.log(`🚀 Lazy loading: Loading only ${filteredPredictions.length} active predictions`);
      } else if (filterType === 'won') {
        // Only load resolved predictions for won filter
        filteredPredictions = predictions.filter(p => p.resolved);
        console.log(`🚀 Lazy loading: Loading only ${filteredPredictions.length} resolved predictions for won filter`);
      } else if (filterType === 'lost') {
        // Only load resolved predictions for lost filter
        filteredPredictions = predictions.filter(p => p.resolved);
        console.log(`🚀 Lazy loading: Loading only ${filteredPredictions.length} resolved predictions for lost filter`);
      } else if (filterType === 'expired') {
        // Only load expired predictions
        filteredPredictions = predictions.filter(p => !p.resolved && !p.cancelled && p.deadline <= Date.now() / 1000);
        console.log(`🚀 Lazy loading: Loading only ${filteredPredictions.length} expired predictions`);
      } else if (filterType === 'cancelled') {
        // Only load cancelled predictions
        filteredPredictions = predictions.filter(p => p.cancelled);
        console.log(`🚀 Lazy loading: Loading only ${filteredPredictions.length} cancelled predictions`);
      } else if (filterType === 'claimed') {
        // Only load resolved predictions for claimed filter
        filteredPredictions = predictions.filter(p => p.resolved);
        console.log(`🚀 Lazy loading: Loading only ${filteredPredictions.length} resolved predictions for claimed filter`);
      }
      
      console.log(`🔍 Processing ${filteredPredictions.length} predictions for filter: ${filterType}`);
      
      const userPredictionsWithStakes: PredictionWithStakes[] = [];
      
      // Log all resolved predictions
      const resolvedPredictions = filteredPredictions.filter(p => p.resolved);
      console.log(`📊 Found ${resolvedPredictions.length} resolved predictions:`, resolvedPredictions.map(p => ({ 
        id: p.id, 
        resolved: p.resolved, 
        outcome: p.outcome,
        question: p.question,
        deadline: p.deadline,
        createdAt: p.createdAt
      })));
      
      // Log recent predictions (last 24 hours)
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const recentPredictions = resolvedPredictions.filter(p => 
        p.deadline && (p.deadline * 1000) > oneDayAgo
      );
      console.log(`🆕 Recent resolved predictions (24h): ${recentPredictions.length}`, recentPredictions.map(p => ({ 
        id: p.id, 
        question: p.question,
        deadline: new Date(p.deadline * 1000).toLocaleString()
      })));
      
      for (const prediction of filteredPredictions) {
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
                  if (prediction.resolved) {
                    const winnersPool = prediction.outcome ? prediction.yesTotalAmount : prediction.noTotalAmount;
                    const losersPool = prediction.outcome ? prediction.noTotalAmount : prediction.yesTotalAmount;
                    const platformFee = losersPool * 0.01; // 1% platform fee
                    const netLosersPool = losersPool - platformFee;
                    
                    if (prediction.outcome && userStakedYes) {
                      // User bet YES and won
                      isWinner = true;
                      potentialPayout = userStake.yesAmount + (userStake.yesAmount / winnersPool) * netLosersPool;
                      potentialProfit = potentialPayout - userStake.yesAmount;
                      canClaim = !userStake.claimed; // Can claim if not already claimed
                    } else if (!prediction.outcome && userStakedNo) {
                      // User bet NO and won
                      isWinner = true;
                      potentialPayout = userStake.noAmount + (userStake.noAmount / winnersPool) * netLosersPool;
                      potentialProfit = potentialPayout - userStake.noAmount;
                      canClaim = !userStake.claimed; // Can claim if not already claimed
                    } else {
                      // User lost - they staked on the losing side
                      isWinner = false;
                      potentialPayout = 0;
                      potentialProfit = -(userStakedYes ? userStake.yesAmount : userStake.noAmount);
                      canClaim = false; // Cannot claim if lost
                    }
                  } else if (prediction.cancelled) {
                    // Full refund for cancelled predictions
                    potentialPayout = userStakedYes ? userStake.yesAmount : userStake.noAmount;
                    potentialProfit = 0;
                    canClaim = !userStake.claimed; // Can claim refund if not already claimed
                    isWinner = false; // Cancelled is not a win
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
                    isWinner = false; // No winner yet
                  } else {
                    // Expired but not resolved - no payout
                    potentialPayout = 0;
                    potentialProfit = -(userStakedYes ? userStake.yesAmount : userStake.noAmount);
                    canClaim = false;
                    isWinner = false;
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
          console.log(`🔍 Prediction ${prediction.id} resolved status:`, prediction.resolved);
          console.log(`🔍 Prediction ${prediction.id} outcome:`, prediction.outcome);
          
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
              if (prediction.resolved) {
                const winnersPool = prediction.outcome ? yesPool : noPool;
                const losersPool = prediction.outcome ? noPool : yesPool;
                const platformFee = losersPool * 0.01; // 1% platform fee
                const netLosersPool = losersPool - platformFee;

                if (prediction.outcome && userStake.yesAmount > 0) {
                  // User bet YES and won
                  isWinner = true;
                  potentialPayout = userStakeAmount + (userStake.yesAmount / winnersPool) * netLosersPool;
                  potentialProfit = potentialPayout - userStakeAmount;
                  canClaim = !userStake.claimed; // Can claim if not already claimed
                } else if (!prediction.outcome && userStake.noAmount > 0) {
                  // User bet NO and won
                  isWinner = true;
                  potentialPayout = userStakeAmount + (userStake.noAmount / winnersPool) * netLosersPool;
                  potentialProfit = potentialPayout - userStakeAmount;
                  canClaim = !userStake.claimed; // Can claim if not already claimed
                } else {
                  // User lost
                  isWinner = false;
                  potentialPayout = 0;
                  potentialProfit = -userStakeAmount;
                  canClaim = false; // Cannot claim if lost
                }
              } else if (prediction.cancelled) {
                // Full refund for cancelled predictions
                potentialPayout = userStakeAmount;
                potentialProfit = 0;
                canClaim = !userStake.claimed; // Can claim refund if not already claimed
                isWinner = false; // Cancelled is not a win
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
                isWinner = false; // No winner yet
              } else {
                // Expired but not resolved - no payout
                potentialPayout = 0;
                potentialProfit = -userStakeAmount;
                canClaim = false;
                isWinner = false;
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
            } else {
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
      
      // Save to cache
      saveToCache(userPredictionsWithStakes, `user_predictions_${address.toLowerCase()}`);
      setCacheLoaded(true);
    } catch (error) {
      console.error('Failed to fetch user stakes:', error);
    } finally {
      setLoadingStakes(false);
    }
  }, [address, allPredictions, predictionsLoading, userPredictions]);

  // Auto-refresh user data every 30 seconds to catch new resolved predictions
  useEffect(() => {
    if (!address) return;
    
    const interval = setInterval(() => {
      console.log('🔄 Auto-refreshing user data...');
      fetchUserStakes(true); // Force refresh
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [address, fetchUserStakes]);

  // Calculate statistics without loading all predictions
  const calculateStats = useCallback(async () => {
    if (!address || !allPredictions || allPredictions.length === 0) return;
    
    try {
      console.log('📊 Calculating statistics...');
      
      // Count total predictions by status
      const totalPredictions = allPredictions.length;
      const activeCount = allPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline > Date.now() / 1000).length;
      const resolvedCount = allPredictions.filter(p => p.resolved).length;
      const cancelledCount = allPredictions.filter(p => p.cancelled).length;
      const expiredCount = allPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline <= Date.now() / 1000).length;
      
      // Calculate total pool size
      const totalPool = allPredictions.reduce((sum, p) => {
        const ethPool = (p.yesTotalAmount || 0) + (p.noTotalAmount || 0);
        const swipePool = (p.swipeYesTotalAmount || 0) + (p.swipeNoTotalAmount || 0);
        return sum + ethPool + swipePool;
      }, 0);
      
      console.log('📊 Statistics calculated:', {
        totalPredictions,
        activeCount,
        resolvedCount,
        cancelledCount,
        expiredCount,
        totalPool: totalPool / Math.pow(10, 18) // Convert to ETH
      });
      
      // Store stats in state (you might want to add stats state)
      // For now, just log them
      
    } catch (error) {
      console.error('❌ Failed to calculate statistics:', error);
    }
  }, [address, allPredictions]);
  
  // Check for new claim transactions and sync if needed (only once per session)
  const checkAndSyncClaims = useCallback(async () => {
    if (!address || userTransactions.length === 0) return;
    
    // Check if we already synced recently (avoid multiple syncs)
    const lastSyncKey = `last_claim_sync_${address.toLowerCase()}`;
    const lastSyncTime = localStorage.getItem(lastSyncKey);
    const oneHourAgo = Date.now() - (60 * 60 * 1000); // 1 hour
    
    if (lastSyncTime && parseInt(lastSyncTime) > oneHourAgo) {
      console.log('⏭️ Skipping claim sync - already synced recently');
      return;
    }
    
    // Find the most recent claim transaction
    const recentClaimTx = userTransactions
      .filter(tx => tx.type === 'claim' && tx.status === 'success')
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    
    if (!recentClaimTx) return;
    
    // Check if this claim transaction is recent (within last 30 minutes)
    const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
    if (recentClaimTx.timestamp < thirtyMinutesAgo) return;
    
    console.log('🔄 Found recent claim transaction, triggering sync...', recentClaimTx);
    
    try {
      const syncResponse = await fetch('/api/sync/claims', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const syncResult = await syncResponse.json();
      console.log('✅ Auto-sync claims result:', syncResult);
      
      if (syncResult.success) {
        // Mark that we synced recently
        localStorage.setItem(lastSyncKey, Date.now().toString());
        
        // Refresh user data after sync
        fetchUserStakes(true, selectedFilter);
      }
    } catch (error) {
      console.error('❌ Failed to auto-sync claims:', error);
    }
  }, [address, userTransactions, fetchUserStakes, selectedFilter]);
  
  // Initial fetch - only fetch transactions initially
  useEffect(() => {
    fetchUserTransactions();
  }, [fetchUserTransactions]);
  
  // Check for claim transactions after loading transactions (only once on initial load)
  useEffect(() => {
    if (userTransactions.length > 0 && address) {
      // Only check on initial load, not on every transaction update
      const hasCheckedKey = `has_checked_claims_${address.toLowerCase()}`;
      const hasChecked = sessionStorage.getItem(hasCheckedKey);
      
      if (!hasChecked) {
        sessionStorage.setItem(hasCheckedKey, 'true');
        checkAndSyncClaims();
      }
    }
  }, [userTransactions, checkAndSyncClaims, address]);

  // Fetch ALL predictions for user dashboard (not just active ones)
  useEffect(() => {
    if (address && fetchAllPredictions) {
      console.log('🔄 User dashboard: fetching ALL predictions...');
      fetchAllPredictions(); // Fetch all predictions for user dashboard
    }
  }, [address]); // Remove fetchAllPredictions from dependencies to avoid conflicts

  // Fetch user stakes when predictions are loaded - only ready-to-claim initially
  useEffect(() => {
    if (allPredictions && allPredictions.length > 0 && address) {
      console.log('🔄 Predictions loaded, calculating stats and fetching ready-to-claim...');
      calculateStats(); // Calculate statistics first
      fetchUserStakes(false, 'ready-to-claim'); // Only load ready-to-claim initially
    }
  }, [allPredictions, address, calculateStats]);
  
  // No auto-refresh - only manual refresh when needed
  // useEffect(() => {
  //   if (!address) return;
  //   
  //   const interval = setInterval(() => {
  //     console.log('🔄 Auto-refreshing user data...');
  //     fetchUserStakes(true, selectedFilter); // Force refresh to get latest data
  //   }, 60000); // 1 minute
  //   
  //   return () => clearInterval(interval);
  // }, [address, fetchUserStakes, selectedFilter]);
  
  // Handle filter change with lazy loading
  const handleFilterChange = useCallback(async (newFilter: string) => {
    console.log(`🔄 Filter changed from ${selectedFilter} to ${newFilter}`);
    setSelectedFilter(newFilter);
    
    // Clear cache to ensure fresh data
    clearCache();
    
    // Clear current predictions and load new ones with lazy loading
    setUserPredictions([]);
    setLoadingStakes(true);
    
    // Load predictions for the new filter with force refresh
    await fetchUserStakes(true, newFilter);
  }, [selectedFilter, fetchUserStakes]);

  // Handle claim reward
  const handleClaimReward = async (predictionId: string, tokenType?: 'ETH' | 'SWIPE') => {
    if (!address) {
      alert('❌ Please connect your wallet first');
      return;
    }

    // Validate that this prediction can actually be claimed
    const prediction = userPredictions.find(p => p.id === predictionId);
    if (!prediction) {
      alert('❌ Prediction not found');
      return;
    }

    const stake = prediction.userStakes?.[tokenType || 'ETH'];
    if (!stake) {
      alert('❌ No stake found for this prediction');
      return;
    }

    // Check if already claimed
    const stakeKey = `${predictionId}-${tokenType || 'ETH'}`;
    const isLocallyClaimed = claimedStakes.has(stakeKey);
    if (stake.claimed || isLocallyClaimed) {
      alert('❌ This reward has already been claimed');
      return;
    }

    // Check if can claim
    if (!stake.canClaim) {
      alert('❌ Cannot claim this reward - you lost this prediction');
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

            // Mark stake as claimed immediately in local state
            markStakeAsClaimed(predictionId, tokenType || 'ETH');
            
            // Clear cache to ensure fresh data is loaded
            clearCache();
            
            // Update transaction status to success in Redis
            console.log('🔄 Updating transaction status to success...');
            try {
              await fetch('/api/user-transactions', {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  userId: address,
                  txHash: txHash,
                  status: 'success'
                }),
              });
              console.log('✅ Transaction status updated to success');
            } catch (error) {
              console.error('❌ Failed to update transaction status:', error);
            }
            
            // Trigger claims sync to update Redis from blockchain (single attempt, async)
            console.log('🔄 Triggering claims sync to update Redis...');
            
            // Do sync in background without blocking UI
            setTimeout(async () => {
              try {
                const syncResponse = await fetch('/api/sync/claims', {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                });
                const syncResult = await syncResponse.json();
                console.log('✅ Claims sync result:', syncResult);
                
                // If sync was successful, refresh user data
                if (syncResult.success) {
                  console.log('🔄 Refreshing user data after successful sync...');
                  fetchUserStakes(true, selectedFilter);
                }
              } catch (error) {
                console.error('❌ Claims sync failed:', error);
              }
            }, 2000); // Wait 2 seconds for transaction to be confirmed

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

            // Update stake as claimed in Redis
            await fetch('/api/stakes', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: address.toLowerCase(),
                predictionId: predictionId,
                updates: { claimed: true }
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
                fetchUserStakes(true); // Force refresh to get latest data from Redis
                fetchUserTransactions(true); // Force refresh transactions too
                console.log('🔄 fetchUserStakes called with force refresh');
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
              fetchUserStakes(true); // Force refresh after claim
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
        // Show only predictions that can be claimed (won + not claimed)
        return userPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          
          // Check local claimed state first
          const ethClaimed = claimedStakes.has(`${p.id}-ETH`) || ethStake?.claimed;
          const swipeClaimed = claimedStakes.has(`${p.id}-SWIPE`) || swipeStake?.claimed;
          
          // Must be resolved, user must have won, and not already claimed
          const ethCanClaim = ethStake && ethStake.isWinner && ethStake.canClaim && !ethClaimed;
          const swipeCanClaim = swipeStake && swipeStake.isWinner && swipeStake.canClaim && !swipeClaimed;
          
          return ethCanClaim || swipeCanClaim;
        });
      case 'active':
        // Show all active predictions from allPredictions (not just user predictions)
        return allPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline > Date.now() / 1000);
      case 'won':
        // Show only predictions where user won (regardless of claimed status)
        return allPredictions.filter(p => {
          // Check if user has stakes in this prediction
          const userPrediction = userPredictions.find(up => up.id === p.id);
          if (!userPrediction) return false;
          
          const ethStake = userPrediction.userStakes?.ETH;
          const swipeStake = userPrediction.userStakes?.SWIPE;
          return (ethStake?.isWinner) || (swipeStake?.isWinner);
        });
      case 'lost':
        // Show only predictions where user lost
        return allPredictions.filter(p => {
          // Check if user has stakes in this prediction
          const userPrediction = userPredictions.find(up => up.id === p.id);
          if (!userPrediction) return false;
          
          const ethStake = userPrediction.userStakes?.ETH;
          const swipeStake = userPrediction.userStakes?.SWIPE;
          return (ethStake && !ethStake.isWinner && p.status === 'resolved') || 
                 (swipeStake && !swipeStake.isWinner && p.status === 'resolved');
        });
      case 'expired':
        // Show all expired predictions (deadline passed but not resolved)
        return allPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline <= Date.now() / 1000);
      case 'cancelled':
        // Show all cancelled predictions
        return allPredictions.filter(p => p.cancelled);
      case 'claimed':
        // Show only predictions that have been claimed
        return allPredictions.filter(p => {
          // Check if user has stakes in this prediction
          const userPrediction = userPredictions.find(up => up.id === p.id);
          if (!userPrediction) return false;
          
          const ethStake = userPrediction.userStakes?.ETH;
          const swipeStake = userPrediction.userStakes?.SWIPE;
          
          // Check local claimed state first
          const ethClaimed = claimedStakes.has(`${p.id}-ETH`) || ethStake?.claimed;
          const swipeClaimed = claimedStakes.has(`${p.id}-SWIPE`) || swipeStake?.claimed;
          
          return ethClaimed || swipeClaimed;
        });
      case 'all':
        // Show all predictions (both user predictions and all predictions)
        return allPredictions;
      default:
        // Default to ready-to-claim
        return userPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          
          // Check local claimed state first
          const ethClaimed = claimedStakes.has(`${p.id}-ETH`) || ethStake?.claimed;
          const swipeClaimed = claimedStakes.has(`${p.id}-SWIPE`) || swipeStake?.claimed;
          
          const ethCanClaim = ethStake && ethStake.isWinner && ethStake.canClaim && !ethClaimed;
          const swipeCanClaim = swipeStake && swipeStake.isWinner && swipeStake.canClaim && !swipeClaimed;
          
          return ethCanClaim || swipeCanClaim;
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
    
    // Check local claimed state first
    const ethClaimed = claimedStakes.has(`${p.id}-ETH`) || ethStake?.claimed;
    const swipeClaimed = claimedStakes.has(`${p.id}-SWIPE`) || swipeStake?.claimed;
    
    // Must be resolved, user must have won, and not already claimed
    const ethCanClaim = ethStake && ethStake.isWinner && ethStake.canClaim && !ethClaimed;
    const swipeCanClaim = swipeStake && swipeStake.isWinner && swipeStake.canClaim && !swipeClaimed;
    
    return ethCanClaim || swipeCanClaim;
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
          <button onClick={() => fetchUserStakes(true)}>Retry</button>
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
          <Select value={selectedFilter} onValueChange={handleFilterChange}>
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

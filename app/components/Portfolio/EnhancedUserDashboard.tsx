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
  const [allUserPredictions, setAllUserPredictions] = useState<PredictionWithStakes[]>([]);
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
  const { predictions: allPredictions, loading: predictionsLoading, error: predictionsError, refresh: refreshPredictions, fetchAllPredictions: fetchAllPredictionsComplete, allPredictionsLoaded } = useHybridPredictions();

  // Fetch user transactions with cache
  const fetchUserTransactions = useCallback(async (forceRefresh: boolean = false) => {
    if (!address) return;
    
    // Always fetch fresh from Redis - no cache
    
    setLoadingTransactions(true);
    try {
      console.log('🔄 Fetching user transactions from server...');
      const response = await fetch(`/api/user-transactions?userId=${address.toLowerCase()}`);
      const result = await response.json();
      const transactions = result.success ? result.data : [];
      setUserTransactions(transactions);
      console.log(`📊 Loaded ${transactions.length} user transactions`);
      
      // No cache - always fresh from Redis
    } catch (error) {
      console.error('Failed to fetch user transactions:', error);
    } finally {
      setLoadingTransactions(false);
    }
  }, [address]);

         // No more cache - always fetch fresh from Redis

         // Incremental update function - add new transaction to existing data instead of refetching all
         const addNewTransaction = useCallback((newTransaction: UserTransaction) => {
           console.log('📈 Adding new transaction incrementally:', newTransaction);
           
           setUserTransactions(prev => {
             const updated = [...prev, newTransaction];
             // No cache - always fresh from Redis
             return updated;
           });
    
    // If it's a claim transaction, update the corresponding stake in allUserPredictions
    if (newTransaction.type === 'claim') {
      setAllUserPredictions(prev => {
        const updated = prev.map(prediction => {
          if (prediction.id === newTransaction.predictionId) {
            const updatedPrediction = { ...prediction };
            
            // Update the claimed status - assume ETH for now (can be enhanced later)
            if (updatedPrediction.userStakes?.ETH) {
              updatedPrediction.userStakes.ETH.claimed = true;
            }
            if (updatedPrediction.userStakes?.SWIPE) {
              updatedPrediction.userStakes.SWIPE.claimed = true;
            }
            
            return updatedPrediction;
          }
          return prediction;
        });
        
                 // No cache - always fresh from Redis
                 return updated;
      });
    }
  }, [address]);

         // Fetch ALL user predictions (for statistics) - always fresh from Redis
         const fetchAllUserPredictions = useCallback(async (forceRefresh: boolean = false) => {
           if (!address) {
             console.log('❌ No address connected, skipping fetchAllUserPredictions');
             return;
           }
           
           console.log('🔍 DEBUG: fetchAllUserPredictions called with:', {
             forceRefresh,
             address,
             predictionsLoading,
             loadingStakes,
             allPredictionsLength: allPredictions?.length || 0
           });
           
           // Always fetch fresh from Redis - no cache
    
    // Don't fetch if predictions are still loading
    if (predictionsLoading) {
      console.log('⏳ Predictions still loading, skipping fetchAllUserPredictions');
      return;
    }
    
    // Don't fetch if already loading
    if (loadingStakes) {
      console.log('⏳ Already loading stakes, skipping fetchAllUserPredictions');
      return;
    }
    
    setLoadingStakes(true);
    try {
      console.log(`🔍 Fetching ALL user stakes for ${address} in single API call`);
      
      // OPTIMIZATION: Get all user stakes in one API call instead of individual calls
      const allStakesResponse = await fetch(`/api/stakes?getAllUserStakes=true&userId=${address.toLowerCase()}`);
      const allStakesData = await allStakesResponse.json();
      
      console.log('🔍 DEBUG: All stakes response:', allStakesData);
      
      if (!allStakesData.success) {
        console.log('⚠️ No stakes found for user');
        setAllUserPredictions([]);
        return;
      }
      
      const userStakes = allStakesData.data || [];
      console.log(`💰 Found ${userStakes.length} total stakes for user ${address}`);
      
      // Use the Redis predictions from the hook
      const predictions = allPredictions || [];
      console.log(`📊 Found ${predictions.length} total predictions`);
      
      if (predictions.length === 0) {
        console.log('⚠️ No predictions found in Redis');
        setAllUserPredictions([]);
        return;
      }
      
      // OPTIMIZATION: Fetch stakes for each prediction in parallel instead of sequential
      console.log(`🚀 Processing ${userStakes.length} stakes for ${predictions.length} predictions`);
      
      // Group stakes by prediction ID for faster lookup
      const stakesByPrediction: { [key: string]: any[] } = {};
      userStakes.forEach((stake: any) => {
        if (!stakesByPrediction[stake.predictionId]) {
          stakesByPrediction[stake.predictionId] = [];
        }
        stakesByPrediction[stake.predictionId].push(stake);
      });
      
      console.log(`💰 Found stakes for ${Object.keys(stakesByPrediction).length} predictions:`, Object.keys(stakesByPrediction));
      
      const allUserPredictionsWithStakes: PredictionWithStakes[] = [];
      
      for (const prediction of predictions) {
        try {
          // Get stakes for this prediction (if any)
          const predictionStakes = stakesByPrediction[prediction.id] || [];
          
          if (predictionStakes.length === 0) {
            continue; // Skip predictions without user stakes
          }
            
            // Group stakes by token type
            const stakesByToken: { [key: string]: any } = {};
            
          for (const userStake of predictionStakes) {
            // Ensure amounts are numbers (in case they come as strings from Redis)
            const yesAmount = Number(userStake.yesAmount) || 0;
            const noAmount = Number(userStake.noAmount) || 0;
            
            if (yesAmount > 0 || noAmount > 0) {
                const tokenType = userStake.tokenType || 'ETH'; // Default to ETH for V1 stakes
              
              let potentialPayout = 0;
              let potentialProfit = 0;
              let canClaim = false;
              let isWinner = false;
              const userStakeAmount = yesAmount + noAmount;

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

                if (prediction.outcome && yesAmount > 0) {
                  // User bet YES and won
                  isWinner = true;
                  potentialPayout = userStakeAmount + (yesAmount / winnersPool) * netLosersPool;
                  potentialProfit = potentialPayout - userStakeAmount;
                  canClaim = !userStake.claimed; // Can claim if not already claimed
                } else if (!prediction.outcome && noAmount > 0) {
                  // User bet NO and won
                  isWinner = true;
                  potentialPayout = userStakeAmount + (noAmount / winnersPool) * netLosersPool;
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
                
                if (yesAmount > 0) {
                  // User bet YES - calculate potential payout if YES wins
                  if (yesPool > 0) {
                    const platformFee = noPool * 0.01; // 1% platform fee from losers
                    const netNoPool = noPool - platformFee;
                    potentialPayout = userStakeAmount + (yesAmount / yesPool) * netNoPool;
                    potentialProfit = potentialPayout - userStakeAmount;
                  }
                } else if (noAmount > 0) {
                  // User bet NO - calculate potential payout if NO wins
                  if (noPool > 0) {
                    const platformFee = yesPool * 0.01; // 1% platform fee from losers
                    const netYesPool = yesPool - platformFee;
                    potentialPayout = userStakeAmount + (noAmount / noPool) * netYesPool;
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
                  yesAmount: yesAmount,
                  noAmount: noAmount,
                  claimed: userStake.claimed,
                potentialPayout,
                potentialProfit,
                canClaim,
                isWinner
              };
              }
            }
            
            
            // Only add prediction if there are stakes
            if (Object.keys(stakesByToken).length > 0) {
              const predictionWithStakes: PredictionWithStakes = {
                ...prediction,
                userStakes: stakesByToken,
                status: prediction.resolved ? 'resolved' : 
                       prediction.cancelled ? 'cancelled' :
                       prediction.deadline <= Date.now() / 1000 ? 'expired' : 'active'
              };

            allUserPredictionsWithStakes.push(predictionWithStakes);
            } else {
          }
        } catch (error) {
          console.warn(`Failed to process prediction ${prediction.id}:`, error);
        }
      }
      
      console.log(`📊 Found ${allUserPredictionsWithStakes.length} ALL user predictions with stakes for user ${address}`);
      console.log(`📊 All user predictions data:`, allUserPredictionsWithStakes);
      
      
      setAllUserPredictions(allUserPredictionsWithStakes);
      
      // No cache - always fresh from Redis
    } catch (error) {
      console.error('Failed to fetch all user predictions:', error);
    } finally {
      setLoadingStakes(false);
    }
  }, [address, allPredictions, predictionsLoading]);

  // Fetch user stakes for predictions - now filters allUserPredictions
  const fetchUserStakes = useCallback(async (forceRefresh: boolean = false, filterType: string = 'ready-to-claim') => {
    if (!address) {
      console.log('❌ No address connected, skipping fetchUserStakes');
      return;
    }
    
    // If allUserPredictions is empty, fetch it first
    if (allUserPredictions.length === 0) {
      console.log('🔄 No allUserPredictions found, fetching first...');
      await fetchAllUserPredictions(forceRefresh);
      return;
    }
    
    console.log(`🔍 Filtering ${allUserPredictions.length} allUserPredictions for filter: ${filterType}`);
    
    // Filter allUserPredictions based on filterType
    let filteredPredictions = allUserPredictions;
    
    switch (filterType) {
      case 'ready-to-claim':
        // Show only predictions that can be claimed (won + not claimed)
        filteredPredictions = allUserPredictions.filter(p => {
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
        break;
        
      case 'active':
        // Show all active predictions from allPredictions (not just user predictions)
        filteredPredictions = allPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline > Date.now() / 1000);
        break;
        
      case 'won':
        // Show only predictions where user won (regardless of claimed status)
        filteredPredictions = allUserPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          return (ethStake?.isWinner) || (swipeStake?.isWinner);
        });
        break;
        
      case 'lost':
        // Show only predictions where user lost
        filteredPredictions = allUserPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          return (ethStake && !ethStake.isWinner && p.status === 'resolved') || 
                 (swipeStake && !swipeStake.isWinner && p.status === 'resolved');
        });
        break;
        
      case 'expired':
        // Show all expired predictions (deadline passed but not resolved)
        filteredPredictions = allPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline <= Date.now() / 1000);
        break;
        
      case 'cancelled':
        // Show all cancelled predictions
        filteredPredictions = allPredictions.filter(p => p.cancelled);
        break;
        
      case 'claimed':
        // Show only predictions that have been claimed
        filteredPredictions = allUserPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          
          // Check local claimed state first
          const ethClaimed = claimedStakes.has(`${p.id}-ETH`) || ethStake?.claimed;
          const swipeClaimed = claimedStakes.has(`${p.id}-SWIPE`) || swipeStake?.claimed;
          
          return ethClaimed || swipeClaimed;
        });
        break;
        
      case 'all':
        // Show all predictions (both user predictions and all predictions)
        filteredPredictions = allPredictions;
        break;
        
      default:
        // Default to ready-to-claim
        filteredPredictions = allUserPredictions.filter(p => {
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
    
    console.log(`📊 Filtered ${filteredPredictions.length} predictions for filter: ${filterType}`);
    setUserPredictions(filteredPredictions);
  }, [address, allUserPredictions, allPredictions, claimedStakes, fetchAllUserPredictions]);

  // No auto-refresh - only manual refresh when needed
  // Auto-refresh was causing infinite loops and performance issues

  // Auto-sync after claim transactions (with delay like TinderCard)
  useEffect(() => {
    if (userTransactions.length > 0 && address) {
      // Check for recent claim transactions
      const recentClaimTx = userTransactions
        .filter(tx => tx.type === 'claim' && tx.status === 'success')
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      
      if (recentClaimTx) {
        // Check if this claim transaction is recent (within last 5 minutes)
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        if (recentClaimTx.timestamp > fiveMinutesAgo) {
          console.log('🔄 Found recent claim transaction, auto-syncing with delay...');
          
          // Auto-sync with delay (like TinderCard)
          setTimeout(async () => {
            try {
              console.log('⏳ Waiting for blockchain propagation after claim...');
              await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
              
              console.log('🔄 Auto-syncing prediction after claim...');
              const syncResponse = await fetch('/api/blockchain/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  eventType: 'reward_claimed',
                  predictionId: recentClaimTx.predictionId?.replace('pred_v2_', ''),
                  contractVersion: 'V2'
                })
              });
              
              if (syncResponse.ok) {
                console.log('✅ Prediction auto-synced after claim');
                // Refresh data to show updated values
                setTimeout(() => {
                  fetchAllUserPredictions(true); // Force refresh to get latest data
                }, 1000);
              } else {
                console.warn('⚠️ Auto-sync failed after claim');
              }
            } catch (error) {
              console.error('❌ Failed to auto-sync after claim:', error);
            }
          }, 2000); // Initial 2 second delay
        }
      }
    }
  }, [userTransactions, address, fetchAllUserPredictions]);

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
      const syncResponse = await fetch('/api/sync/v2/claims', {
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
    if (address && fetchAllPredictionsComplete) {
      console.log('🔄 User dashboard: fetching ALL predictions...');
      fetchAllPredictionsComplete(); // Fetch all predictions for user dashboard
    }
  }, [address, fetchAllPredictionsComplete]); // Add fetchAllPredictionsComplete back to dependencies

  // Fetch all predictions first, then user predictions
  useEffect(() => {
    if (address && allPredictions.length === 0 && !predictionsLoading) {
      console.log('🔄 No predictions loaded, fetching all predictions first...');
      fetchAllPredictionsComplete(); // Fetch ALL predictions (not just active)
    }
  }, [address, allPredictions.length, predictionsLoading, fetchAllPredictionsComplete]);

  // Fetch all user predictions when ALL predictions are loaded (not just active)
  // Wait for allPredictionsLoaded flag to ensure we have all predictions including resolved ones
  useEffect(() => {
    if (allPredictions && allPredictions.length > 0 && address && allUserPredictions.length === 0 && !predictionsLoading && allPredictionsLoaded) {
      console.log('🔄 ALL predictions loaded, fetching all user predictions...');
      console.log(`📊 allPredictions count: ${allPredictions.length} (allPredictionsLoaded: ${allPredictionsLoaded})`);
      calculateStats(); // Calculate statistics first
      fetchAllUserPredictions(false); // Fetch all user predictions for statistics
    }
  }, [allPredictions, address, calculateStats, fetchAllUserPredictions, allUserPredictions.length, predictionsLoading, allPredictionsLoaded]);
  
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
    
    // If allUserPredictions is empty, fetch it first
    if (allUserPredictions.length === 0) {
      console.log('🔄 No allUserPredictions found, fetching first...');
      await fetchAllUserPredictions(true);
    }
    
    // Filter allUserPredictions based on new filter
    await fetchUserStakes(false, newFilter);
  }, [selectedFilter, allUserPredictions.length, fetchAllUserPredictions, fetchUserStakes]);

  // Handle claim reward
  const handleClaimReward = async (predictionId: string, tokenType?: 'ETH' | 'SWIPE') => {
    if (!address) {
      alert('❌ Please connect your wallet first');
      return;
    }

    // Ensure allUserPredictions is populated before attempting to claim
    if (allUserPredictions.length === 0) {
      console.log('🔄 No allUserPredictions found, fetching first...');
      await fetchAllUserPredictions(true);
    }

    // Validate that this prediction can actually be claimed
    // Use allUserPredictions instead of userPredictions to avoid filtering issues
    const prediction = allUserPredictions.find(p => p.id === predictionId);
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

        // All predictions use V2 contract (pred_v1_ are synced V1 predictions on V2)
        const contract = CONTRACTS.V2;
        
        console.log(`🎯 Using V2 contract for claim (all predictions are on V2)`);

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
            
            // Do targeted sync in background without blocking UI
            setTimeout(async () => {
              try {
                console.log('🔄 Auto-syncing prediction after claim...');
                const syncResponse = await fetch('/api/blockchain/events', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    eventType: 'reward_claimed',
                    predictionId: numericId,
                    contractVersion: 'V2'
                  }),
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

            // Add transaction incrementally instead of refetching all
            addNewTransaction(transaction);

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
              
              // Auto-sync the specific prediction after claim with delay (like TinderCard)
              setTimeout(async () => {
              try {
                  console.log('⏳ Waiting for blockchain propagation after claim...');
                  await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
                  
                  console.log('🔄 Auto-syncing prediction after claim...');
                const syncResponse = await fetch('/api/blockchain/events', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    eventType: 'reward_claimed',
                    predictionId: predictionId.replace('pred_v2_', '').replace('pred_v1_', ''),
                    contractVersion: 'V2' // All predictions are on V2 contract
                  })
                });
                
                if (syncResponse.ok) {
                  console.log('✅ Prediction auto-synced after claim');
                    // Refresh data to show updated values
                    setTimeout(() => {
                      fetchAllUserPredictions(true); // Force refresh to get latest data
                      fetchUserTransactions(true); // Force refresh transactions too
                    }, 1000);
                } else {
                  console.warn('⚠️ Auto-sync failed after claim');
                }
              } catch (syncError) {
                console.error('❌ Failed to auto-sync after claim:', syncError);
              }
              }, 2000); // Initial 2 second delay
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
  
  // Filter predictions based on selected filter (now uses allUserPredictions for user-specific filters)
  const getFilteredPredictions = () => {
    switch (selectedFilter) {
      case 'ready-to-claim':
        // Show only predictions that can be claimed (won + not claimed)
        return allUserPredictions.filter(p => {
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
        return allUserPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          return (ethStake?.isWinner) || (swipeStake?.isWinner);
        });
      case 'lost':
        // Show only predictions where user lost
        return allUserPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
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
        return allUserPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          
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
        return allUserPredictions.filter(p => {
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

  // Calculate totals - separate ETH and SWIPE (from ALL user predictions for full statistics)
  const ethTotalStaked = allUserPredictions.reduce((sum, p) => {
    const ethStake = p.userStakes?.ETH;
    const ethAmount = (ethStake?.yesAmount || 0) + (ethStake?.noAmount || 0);
    return sum + ethAmount;
  }, 0);
  
  const swipeTotalStaked = allUserPredictions.reduce((sum, p) => {
    const swipeStake = p.userStakes?.SWIPE;
    const swipeAmount = (swipeStake?.yesAmount || 0) + (swipeStake?.noAmount || 0);
    return sum + swipeAmount;
  }, 0);
  
  const ethTotalPotentialPayout = allUserPredictions.reduce((sum, p) => {
    const ethStake = p.userStakes?.ETH;
    return sum + (ethStake?.potentialPayout || 0);
  }, 0);
  
  const swipeTotalPotentialPayout = allUserPredictions.reduce((sum, p) => {
    const swipeStake = p.userStakes?.SWIPE;
    return sum + (swipeStake?.potentialPayout || 0);
  }, 0);
  
  const ethTotalPotentialProfit = allUserPredictions.reduce((sum, p) => {
    const ethStake = p.userStakes?.ETH;
    return sum + (ethStake?.potentialProfit || 0);
  }, 0);
  
  const swipeTotalPotentialProfit = allUserPredictions.reduce((sum, p) => {
    const swipeStake = p.userStakes?.SWIPE;
    return sum + (swipeStake?.potentialProfit || 0);
  }, 0);
  
  const canClaimCount = allUserPredictions.filter(p => {
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
                         {userTransactions.map((transaction, index) => {
              // Determine the actual status to display
              let displayStatus = transaction.status;
              if (transaction.txHash && transaction.txHash !== 'undefined' && transaction.txHash.length > 10) {
                // If we have a valid transaction hash, assume it's successful
                displayStatus = 'success';
              }
              
              // Create unique key combining index, id, and hash to avoid React duplicate key warnings
              const uniqueKey = `${transaction.id}_${index}_${transaction.txHash || transaction.timestamp || ''}`;
              
              return (
                <div key={uniqueKey} className="transaction-card">
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

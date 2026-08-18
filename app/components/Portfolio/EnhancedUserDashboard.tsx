"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useActiveChain } from '@/lib/chains/activeChain';
import { tokenSymbol, COLLATERAL_LEG } from '@/lib/userStake';
import { getMarketContract, txUrl } from '@/lib/chains/market';
import { getChainConfig } from '@/lib/chains';
import {
  ARCHIVED_CHAIN_ID,
  archivedClaimBlocked,
} from '@/lib/chains/archived';
import { parseMarketId, CURRENT_GENERATION } from '@/lib/marketId';
import { CONTRACTS, getV1Contract, getV2Contract, getContractForPrediction, USDC_DUALPOOL_CONTRACT_ADDRESS, USDC_DUALPOOL_ABI } from '../../../lib/contract';
import { ethers } from 'ethers';
import { useHybridPredictions } from '../../../lib/hooks/useHybridPredictions';
import { RedisPrediction, RedisUserStake, UserTransaction } from '../../../lib/types/redis';
import { generateBasescanUrl, generateTransactionId } from '../../../lib/utils/redis-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { LegacyCard } from './LegacyCard';
import GradientText from '@/components/GradientText';
import { useComposeCast, useOpenUrl } from '@coinbase/onchainkit/minikit';
import sdk from '@farcaster/miniapp-sdk';
import { Share2 } from 'lucide-react';
import { PNLTable } from './WinLossPNL/PNLTable';
import './EnhancedUserDashboard.css';
import { buildClaimShareText, getRandomPortfolioIntro, getRandomPortfolioOutro } from '../../../lib/constants/share-texts';

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
    USDC?: {
      predictionId: string;
      yesAmount: number;      // raw 6 decimals
      noAmount: number;       // raw 6 decimals
      claimed: boolean;
      potentialPayout: number;
      potentialProfit: number;
      canClaim: boolean;
      isWinner: boolean;
    };
  };
  // USDC pool data
  usdcPoolEnabled?: boolean;
  usdcYesTotalAmount?: number;
  usdcNoTotalAmount?: number;
  usdcResolved?: boolean;
  usdcCancelled?: boolean;
  usdcOutcome?: boolean;
  // Resolved, but with an empty winning side, so it pays refunds rather than
  // winnings. A separate flag from cancelled because the contract treats them
  // separately and they take different claim calls.
  usdcRefundable?: boolean;
  status: 'active' | 'resolved' | 'expired' | 'cancelled';
}

export function EnhancedUserDashboard() {
  const { address } = useAccount();
  const { writeContract } = useWriteContract();
  // Claims must reach the contract that holds the market, and the explorer link
  // stored in history must name the chain it happened on.
  const { chainKey: claimChainKey } = useActiveChain();
  /**
   * What this network settles in, for every collateral figure on the screen.
   *
   * The stake leg is stored under the key 'USDC' on every chain, including
   * Robinhood where the token is Paxos USDG, so printing the leg name tells a
   * Robinhood user they hold the wrong stablecoin.
   */
  const collateralSymbol = tokenSymbol(COLLATERAL_LEG, claimChainKey);
  const { composeCast: minikitComposeCast } = useComposeCast();
  const minikitOpenUrl = useOpenUrl();
  
  // Universal openUrl function - works on both MiniKit (Base app) and Farcaster SDK (Warpcast)
  const openUrl = useCallback(async (url: string) => {
    // Try MiniKit first (Base app)
    try {
      if (minikitOpenUrl) {
        console.log('📱 Using MiniKit openUrl...');
        minikitOpenUrl(url);
        return;
      }
    } catch (error) {
      console.log('MiniKit openUrl failed, trying Farcaster SDK...', error);
    }
    
    // Fallback to Farcaster SDK (Warpcast and other clients)
    try {
      console.log('📱 Using Farcaster SDK openUrl...');
      await sdk.actions.openUrl(url);
    } catch (error) {
      console.error('Both openUrl methods failed, using window.open:', error);
      window.open(url, '_blank');
    }
  }, [minikitOpenUrl]);
  
  // Universal share function - works on both MiniKit (Base app) and Farcaster SDK (Warpcast)
  const composeCast = useCallback(async (params: { text: string; embeds?: string[] }) => {
    // Try MiniKit first (Base app)
    try {
      if (minikitComposeCast) {
        console.log('📱 Using MiniKit composeCast for claim share...');
        const embedsParam = params.embeds?.slice(0, 2) as [] | [string] | [string, string] | undefined;
        await minikitComposeCast({ text: params.text, embeds: embedsParam });
        return;
      }
    } catch (error) {
      console.log('MiniKit composeCast failed, trying Farcaster SDK...', error);
    }
    
    // Fallback to Farcaster SDK (Warpcast and other clients)
    try {
      console.log('📱 Using Farcaster SDK composeCast for claim share...');
      await sdk.actions.composeCast({
        text: params.text,
        embeds: params.embeds?.map(url => ({ url })) as any
      });
    } catch (error) {
      console.error('Both composeCast methods failed:', error);
      throw error;
    }
  }, [minikitComposeCast]);
  const [userPredictions, setUserPredictions] = useState<PredictionWithStakes[]>([]);
  const [allUserPredictions, setAllUserPredictions] = useState<PredictionWithStakes[]>([]);
  const [loadingStakes, setLoadingStakes] = useState(false);
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [userTransactions, setUserTransactions] = useState<UserTransaction[]>([]);
  /** Set when a refresh failed, so an empty list is never read as "none". */
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  /** The same, for the positions list. */
  const [stakesError, setStakesError] = useState<string | null>(null);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  
  // Local state for tracking claimed stakes
  const [claimedStakes, setClaimedStakes] = useState<Set<string>>(new Set());
  
  // Cache state
  const [cacheLoaded, setCacheLoaded] = useState(false);
  
  // Filter state
  const [selectedFilter, setSelectedFilter] = useState<string>('ready-to-claim');
  
  // Dashboard view state (main, pnl)
  const [activeView, setActiveView] = useState<'main' | 'pnl'>('main');
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const [shareStep, setShareStep] = useState<'type' | 'platform'>('type');
  const [selectedShareType, setSelectedShareType] = useState<'profit-only' | 'full'>('profit-only');
  const [modalType, setModalType] = useState<'claim' | 'success' | 'error'>('claim');
  const [modalData, setModalData] = useState<{txHash?: string, basescanUrl?: string, message?: string, predictionId?: string, tokenType?: 'ETH' | 'SWIPE', amount?: number}>({});
  
  // Claimed prediction for share
  const [claimedPrediction, setClaimedPrediction] = useState<PredictionWithStakes | null>(null);

  // Transaction pagination state
  const [transactionPage, setTransactionPage] = useState(1);
  const transactionsPerPage = 10;
  
  // Predictions pagination state
  const [predictionsPage, setPredictionsPage] = useState(1);
  const predictionsPerPage = 10;

  // Convert wei to ETH
  const weiToEth = (wei: number): number => {
    return wei / Math.pow(10, 18);
  };

  // Mark stake as claimed locally - only for specific token type
  const markStakeAsClaimed = (predictionId: string, tokenType: 'ETH' | 'SWIPE' | 'USDC') => {
    const stakeKey = `${predictionId}-${tokenType}`;
    setClaimedStakes(prev => new Set([...prev, stakeKey]));
    
    // Helper function to update prediction with claimed token
    const updatePrediction = (pred: PredictionWithStakes): PredictionWithStakes => {
      if (pred.id !== predictionId) return pred;
      
      const updatedPred = { ...pred };
      
      // Handle multi-token stakes (V2)
      if (updatedPred.userStakes?.[tokenType]) {
        updatedPred.userStakes = {
          ...updatedPred.userStakes,
          [tokenType]: {
            ...updatedPred.userStakes[tokenType],
            claimed: true,
            canClaim: false
          }
        };
      }
      
      // Also handle single stake format (V1) - check if it's a direct stake
      if (updatedPred.userStakes && !updatedPred.userStakes.ETH && !updatedPred.userStakes.SWIPE && !updatedPred.userStakes.USDC) {
        // This is a V1 single stake - convert to ETH format
        if (tokenType === 'ETH') {
          const originalStake = updatedPred.userStakes as any;
          updatedPred.userStakes = {
            ETH: {
              predictionId: originalStake.predictionId || predictionId,
              yesAmount: originalStake.yesAmount || 0,
              noAmount: originalStake.noAmount || 0,
              claimed: true,
              canClaim: false,
              potentialPayout: originalStake.potentialPayout || 0,
              potentialProfit: originalStake.potentialProfit || 0,
              isWinner: originalStake.isWinner || false
            }
          };
        }
      }
      
      return updatedPred;
    };
    
    // Update both userPredictions and allUserPredictions
    setUserPredictions(prev => prev.map(updatePrediction));
    setAllUserPredictions(prev => prev.map(updatePrediction));
  };

  // Format ETH for display
  const formatEth = (wei: number): string => {
    const eth = weiToEth(wei);
    if (eth === 0) return '0.0000';
    return eth.toFixed(6); // Always use decimal format with 6 decimal places
  };

  // Format SWIPE for display with K/M suffixes
  const formatSwipe = (wei: number): string => {
    const swipe = weiToEth(wei);
    if (swipe === 0) return '0';
    
    const absSwipe = Math.abs(swipe);
    const sign = swipe < 0 ? '-' : '';
    
    if (absSwipe >= 1000000) {
      // Millions
      return `${sign}${(absSwipe / 1000000).toFixed(2)}M`;
    } else if (absSwipe >= 1000) {
      // Thousands
      return `${sign}${(absSwipe / 1000).toFixed(2)}K`;
    } else if (absSwipe >= 1) {
      // Regular numbers
      return `${sign}${absSwipe.toFixed(2)}`;
    } else {
      // Small numbers
      return `${sign}${absSwipe.toFixed(4)}`;
    }
  };

  // Format USDC for display (6 decimals)
  const formatUsdc = (raw: number): string => {
    const usdc = raw / 1e6;
    if (usdc === 0) return '$0.00';
    
    const absUsdc = Math.abs(usdc);
    const sign = usdc < 0 ? '-' : '';
    
    if (absUsdc >= 1000000) {
      return `${sign}$${(absUsdc / 1000000).toFixed(2)}M`;
    } else if (absUsdc >= 1000) {
      return `${sign}$${(absUsdc / 1000).toFixed(2)}K`;
    } else if (absUsdc >= 1) {
      return `${sign}$${absUsdc.toFixed(2)}`;
    } else {
      return `${sign}$${absUsdc.toFixed(4)}`;
    }
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
    // No auto-close - user must close manually
  };

  const showSuccessModal = (txHash: string, basescanUrl: string, predictionId?: string, tokenType?: 'ETH' | 'SWIPE', amount?: number) => {
    setModalType('success');
    setModalData({ txHash, basescanUrl, predictionId, tokenType, amount });
    setShowModal(true);
    
    // Find the claimed prediction for share
    if (predictionId) {
      const prediction = allUserPredictions.find(p => p.id === predictionId);
      if (prediction) {
        setClaimedPrediction(prediction);
      }
    }
    
    // Refresh data in background
    fetchUserStakes(true);
    fetchUserTransactions(true);
    console.log('🔄 Final data refresh after claim success');
    // No auto-close - user must close manually
  };

  const showErrorModal = (message: string) => {
    setModalType('error');
    setModalData({ message });
    setShowModal(true);
    // No auto-close - user must close manually
  };

  const closeModal = () => {
    setShowModal(false);
    setClaimedPrediction(null);
  };
  
  // Share claimed prediction
  const shareClaimedPrediction = async () => {
    if (!claimedPrediction || !modalData.tokenType) return;
    
    const stake = claimedPrediction.userStakes?.[modalData.tokenType];
    const payout = stake?.potentialPayout || 0;
    const profit = stake?.potentialProfit || 0;
    const tokenSymbol = modalData.tokenType === 'ETH' ? 'ETH' : 'SWIPE';
    
    // Format amounts - always round to millions for SWIPE
    const formatAmount = (wei: number) => {
      const amount = wei / Math.pow(10, 18);
      if (modalData.tokenType === 'SWIPE') {
        // Always show in millions for SWIPE (e.g., 25.1M instead of 25100.00K)
        if (amount >= 1000000) {
          const millions = amount / 1000000;
          return millions >= 10 ? `${millions.toFixed(1)}M` : `${millions.toFixed(2)}M`;
        }
        if (amount >= 1000) {
          const thousands = amount / 1000;
          return `${thousands.toFixed(0)}K`;
        }
        return amount.toFixed(0);
      }
      // ETH - show 6 decimals
      return amount.toFixed(6);
    };
    
    const profitFormatted = formatAmount(profit);
    const payoutFormatted = formatAmount(payout);
    
    // Build share text with random variants from share-texts.ts
    const text = buildClaimShareText(
      payoutFormatted,
      profitFormatted,
      tokenSymbol,
      claimedPrediction.question,
      claimedPrediction.outcome || false
    );
    
    // Use composeCast SDK instead of window.open
    try {
      await composeCast({
        text: text,
        embeds: ['https://theswipe.app']
      });
    } catch (error) {
      console.error('Failed to share claimed prediction:', error);
      // Fallback to window.open if SDK fails
      const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text + ' https://theswipe.app')}`;
      window.open(warpcastUrl, '_blank');
    }
  };
  
  // Hybrid predictions hook (includes both Redis and blockchain data)
  const { predictions: allPredictions, loading: predictionsLoading, error: predictionsError, refresh: refreshPredictions, fetchAllPredictions: fetchAllPredictionsComplete, allPredictionsLoaded } = useHybridPredictions();

  // Fetch user transactions with cache
  const fetchUserTransactions = useCallback(async (forceRefresh: boolean = false) => {
    if (!address) return;
    
    // Always fetch fresh from Redis - no cache
    
    setLoadingTransactions(true);
    try {
      // The chain travels with the read, the same way the stakes read below
      // sends it. Redis holds one history per chain now, and a request without
      // a chain is a request for Base's, whatever the switcher is showing.
      const response = await fetch(
        `/api/user-transactions?userId=${address.toLowerCase()}&chain=${claimChainKey}`
      );
      const result = await response.json();

      /**
       * A failed load must not empty the list.
       *
       * This read `result.success ? result.data : []` and then set that, so any
       * answer that was not a success replaced the history with nothing. The
       * component remounts every time you leave the dashboard and come back, so
       * one flaky response was enough to make months of transactions vanish,
       * and the empty state then told the user they had never placed a bet.
       *
       * Failing to fetch history is not the same fact as having none. Keep what
       * is on screen, record that the refresh failed, and let the render say so.
       */
      if (!result?.success || !Array.isArray(result.data)) {
        setTransactionsError('Could not refresh your history just now.');
        return;
      }

      setTransactionsError(null);
      setUserTransactions(result.data);
    } catch (error) {
      console.error('Failed to fetch user transactions:', error);
      setTransactionsError('Could not reach the server for your history.');
    } finally {
      setLoadingTransactions(false);
    }
  }, [address, claimChainKey]);

  /*
    "Read from chain" was removed rather than repaired.

    It POSTed to /api/user-transactions/sync-blockchain, which has never
    existed: app/api/user-transactions holds route.ts and nothing else. The 404
    came back as an HTML page, response.json() threw on it, and the catch
    alerted "Failed to sync from blockchain". So the one control offering to
    recover a missing history was guaranteed to fail, for everyone, every time.

    Building the route is not a small fix. positions(id, user) is state, and
    state carries no timestamp and no transaction hash, so a history cannot be
    rebuilt from it, only a list of current positions. A real history has to
    come from event logs across the whole of both chains, which is rate limited
    and is its own piece of work rather than a button.

    The live path is unaffected: every bet and every claim posts to
    /api/user-transactions as it happens.
  */

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
           if (!address) return;
           
           // Don't fetch if predictions are still loading or already loading stakes
           if (predictionsLoading || loadingStakes) return;
    
    setLoadingStakes(true);
    try {
      // OPTIMIZATION: Get all user stakes in one API call instead of individual calls
      // Positions are per chain, so the read has to name one. Without it the
      // server defaults to Base and a Robinhood user is shown Base's stakes.
      const allStakesResponse = await fetch(
        `/api/stakes?getAllUserStakes=true&userId=${address.toLowerCase()}&chain=${claimChainKey}`
      );
      const allStakesData = await allStakesResponse.json();

      /**
       * Two early returns used to empty the list on their way out, and between
       * them they are why history vanishes when you leave this screen and come
       * back.
       *
       * The component unmounts on a dashboard switch and remounts fresh, so
       * `allPredictions` is empty for the first render or two while its own
       * fetch is in flight. This function ran in that window, saw zero
       * predictions, and wrote an empty array over everything the user had.
       * Not loaded yet and none are different facts, and only one of them is
       * worth rendering.
       *
       * The other return did the same for a failed stakes read, so a single
       * flaky response wiped the board.
       */
      if (!allStakesData?.success) {
        setStakesError('Could not load your positions just now.');
        return;
      }

      const userStakes = allStakesData.data || [];
      const predictions = allPredictions || [];

      // Nothing to join against yet. Leave what is on screen and wait for the
      // predictions to arrive; this callback re-runs when they do.
      if (predictions.length === 0) return;

      setStakesError(null);
      
      // Group stakes by prediction ID for faster lookup
      const stakesByPrediction: { [key: string]: any[] } = {};
      userStakes.forEach((stake: any) => {
        if (!stakesByPrediction[stake.predictionId]) {
          stakesByPrediction[stake.predictionId] = [];
        }
        stakesByPrediction[stake.predictionId].push(stake);
      });
      
      const allUserPredictionsWithStakes: PredictionWithStakes[] = [];
      
      // Create provider once for all USDC checks (optimization)
      let usdcProvider: ethers.JsonRpcProvider | null = null;
      let usdcContract: ethers.Contract | null = null;
      
      // Batch USDC position checks for V2 predictions
      const v2PredictionsToCheck: { prediction: any; numericId: number; stakesByToken: any }[] = [];
      /** Markets on the live contract, which answers a different function. */
      const livePredictionsToCheck: { prediction: any; numericId: number; stakesByToken: any }[] = [];
      
      for (const prediction of predictions) {
        try {
          // Get stakes for this prediction (if any)
          const predictionStakes = stakesByPrediction[prediction.id] || [];
          
          // Skip if no ETH/SWIPE stakes AND no USDC pool enabled
          // We only check USDC for predictions that have usdcPoolEnabled flag set
          if (predictionStakes.length === 0 && !prediction.usdcPoolEnabled) {
            continue;
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
            
            
            // Check for USDC position - ONLY if:
            // 1. User has ETH/SWIPE stake (interested in this prediction) OR
            // 2. Prediction has usdcPoolEnabled AND has actual USDC pool (yesPool + noPool > 0)
            // This avoids checking old predictions with stale usdcPoolEnabled flag
            const hasUserStake = Object.keys(stakesByToken).length > 0;
            const hasActiveUsdcPool = prediction.usdcPoolEnabled && 
              ((prediction.usdcYesTotalAmount || 0) + (prediction.usdcNoTotalAmount || 0)) > 0;
            
            if (hasUserStake || hasActiveUsdcPool) {
              /**
               * Parse the id, do not strip prefixes off it.
               *
               * This stripped only pred_v2_ and pred_v1_, so every pred_v4_N id
               * came out of parseInt as NaN and was dropped before the position
               * was ever read. The whole of the current contract was invisible
               * on this screen: a user who staked and won saw no position, no
               * payout and no claim button.
               *
               * And the two generations do not live on the same contract, so
               * they cannot share one batch. The archived pool answers
               * getPosition; the live market answers positions.
               */
              const ref = parseMarketId(prediction.id);
              if (ref) {
                if (ref.generation === CURRENT_GENERATION) {
                  livePredictionsToCheck.push({ prediction, numericId: ref.numericId, stakesByToken });
                } else if (ref.generation === 'v1' || ref.generation === 'v2' || ref.generation === 'legacy') {
                  v2PredictionsToCheck.push({ prediction, numericId: ref.numericId, stakesByToken });
                }
              }
            }
            
            // Only add prediction if there are ETH/SWIPE stakes (USDC will be added after batch check)
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
      
      // BATCH CHECK: Fetch all USDC positions in parallel (much faster than sequential)
      console.log(`📊 V2 predictions to check for USDC: ${v2PredictionsToCheck.length}`);
      if (v2PredictionsToCheck.length > 0 || livePredictionsToCheck.length > 0) {
        try {
          console.log(`🔄 Batch checking ${v2PredictionsToCheck.length} V2 predictions for USDC positions...`);
          
          // Create provider once for all checks
          usdcProvider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_BASE_RPC_URL);
          usdcContract = new ethers.Contract(USDC_DUALPOOL_CONTRACT_ADDRESS, USDC_DUALPOOL_ABI, usdcProvider);
          
          // Fetch all positions and prediction data in parallel
          const positionPromises = v2PredictionsToCheck.map(({ numericId }) => 
            Promise.all([
              usdcContract!.getPosition(numericId, address).catch(() => null),
              usdcContract!.getPrediction(numericId).catch(() => null)
            ])
          );
          
          const results = await Promise.all(positionPromises);

          /**
           * The same read again, against the live contract.
           *
           * Two contracts, two function names, one shape. The archived pool
           * answers getPosition and the live market answers positions, and the
           * tuples happen to line up where this loop looks: yes at 0, no at 1,
           * claimed at 4, and resolved, cancelled and outcome at 5, 6 and 7 of
           * the market row. So the results are concatenated and the processing
           * below runs once over both rather than being written twice.
           *
           * Resolved from the selected chain, not from a Base literal, so a
           * Robinhood position is read off Robinhood.
           */
          const liveMarket = getMarketContract(claimChainKey);
          let liveResults: [any, any][] = [];
          if (liveMarket && livePredictionsToCheck.length > 0) {
            const liveProvider = new ethers.JsonRpcProvider(
              getChainConfig(claimChainKey).rpcUrl
            );
            const liveContract = new ethers.Contract(
              liveMarket.address,
              liveMarket.abi as never,
              liveProvider
            );
            liveResults = await Promise.all(
              livePredictionsToCheck.map(({ numericId }) =>
                Promise.all([
                  liveContract.positions(numericId, address).catch(() => null),
                  liveContract.getPrediction(numericId).catch(() => null),
                ])
              )
            ) as [any, any][];
          }

          const toCheck = [...v2PredictionsToCheck, ...livePredictionsToCheck];
          const allResults = [...results, ...liveResults];

          // Process results
          for (let i = 0; i < toCheck.length; i++) {
            const { prediction, numericId, stakesByToken } = toCheck[i];
            const [position, usdcPredictionData] = allResults[i];
            
            if (!position) continue;
            
            const usdcYesAmount = Number(position[0]) || 0;
            const usdcNoAmount = Number(position[1]) || 0;
            const usdcClaimed = position[4] || false;
            
            if (usdcYesAmount > 0 || usdcNoAmount > 0) {
              const usdcStakeAmount = usdcYesAmount + usdcNoAmount;
              let usdcPotentialPayout = 0;
              let usdcPotentialProfit = 0;
              let usdcCanClaim = false;
              let usdcIsWinner = false;
              
              const usdcYesPool = prediction.usdcYesTotalAmount || 0;
              const usdcNoPool = prediction.usdcNoTotalAmount || 0;
              
              const predAny = prediction as any;
              
              // Get USDC prediction data from contract if available (more reliable than Redis)
              let usdcResolved = false;
              let usdcCancelled = false;
              let usdcOutcome: boolean | null = null;
              
              if (usdcPredictionData) {
                // Use contract data (most reliable)
                usdcResolved = usdcPredictionData[5] || false; // resolved
                usdcCancelled = usdcPredictionData[6] || false; // cancelled
                usdcOutcome = usdcResolved ? (usdcPredictionData[7] ?? null) : null; // outcome (only if resolved)
              } else {
                // Fallback to Redis data
                usdcResolved = predAny.usdcPoolEnabled 
                  ? (predAny.usdcResolved !== undefined ? predAny.usdcResolved : false)
                  : prediction.resolved;
                usdcCancelled = predAny.usdcPoolEnabled
                  ? (predAny.usdcCancelled !== undefined ? predAny.usdcCancelled : false)
                  : prediction.cancelled;
                usdcOutcome = predAny.usdcPoolEnabled
                  ? (predAny.usdcOutcome !== undefined ? predAny.usdcOutcome : null)
                  : prediction.outcome;
              }
              
              // If still no outcome but resolved, try prediction.outcome as last fallback
              if (usdcResolved && usdcOutcome === null) {
                usdcOutcome = prediction.outcome ?? null;
              }
              
              if (usdcResolved) {
                const winnersPool = usdcOutcome ? usdcYesPool : usdcNoPool;
                const losersPool = usdcOutcome ? usdcNoPool : usdcYesPool;
                const platformFee = losersPool * 0.015;
                const netLosersPool = losersPool - platformFee;
                
                const winningStake = usdcOutcome ? usdcYesAmount : usdcNoAmount;
                
                if (winningStake > 0 && winnersPool > 0) {
                  usdcIsWinner = true;
                  usdcPotentialPayout = winningStake + (winningStake / winnersPool) * netLosersPool;
                  usdcPotentialProfit = usdcPotentialPayout - usdcStakeAmount;
                  usdcCanClaim = !usdcClaimed;
                } else {
                  usdcIsWinner = false;
                  usdcPotentialPayout = 0;
                  usdcPotentialProfit = -usdcStakeAmount;
                  usdcCanClaim = false;
                }
              } else if (usdcCancelled) {
                usdcPotentialPayout = usdcStakeAmount;
                usdcPotentialProfit = 0;
                usdcCanClaim = !usdcClaimed;
                usdcIsWinner = false;
              } else {
                if (usdcYesAmount > 0 && usdcYesPool > 0) {
                  const fee = usdcNoPool * 0.015;
                  const netNoPool = usdcNoPool - fee;
                  usdcPotentialPayout = usdcStakeAmount + (usdcYesAmount / usdcYesPool) * netNoPool;
                  usdcPotentialProfit = usdcPotentialPayout - usdcStakeAmount;
                } else if (usdcNoAmount > 0 && usdcNoPool > 0) {
                  const fee = usdcYesPool * 0.015;
                  const netYesPool = usdcYesPool - fee;
                  usdcPotentialPayout = usdcStakeAmount + (usdcNoAmount / usdcNoPool) * netYesPool;
                  usdcPotentialProfit = usdcPotentialPayout - usdcStakeAmount;
                }
                usdcCanClaim = false;
                usdcIsWinner = false;
              }
              
              // Add USDC stake to stakesByToken
              stakesByToken['USDC'] = {
                predictionId: prediction.id,
                yesAmount: usdcYesAmount,
                noAmount: usdcNoAmount,
                claimed: usdcClaimed,
                potentialPayout: usdcPotentialPayout,
                potentialProfit: usdcPotentialProfit,
                canClaim: usdcCanClaim,
                isWinner: usdcIsWinner
              };
              
              // Check if this prediction is already in the list
              const existingIdx = allUserPredictionsWithStakes.findIndex(p => p.id === prediction.id);
              if (existingIdx >= 0) {
                // Update existing prediction with USDC stake
                allUserPredictionsWithStakes[existingIdx].userStakes = {
                  ...allUserPredictionsWithStakes[existingIdx].userStakes,
                  USDC: stakesByToken['USDC']
                };
              } else if (Object.keys(stakesByToken).length > 0) {
                // Add new prediction with USDC stake only
                allUserPredictionsWithStakes.push({
                  ...prediction,
                  userStakes: stakesByToken,
                  status: prediction.resolved ? 'resolved' : 
                         prediction.cancelled ? 'cancelled' :
                         prediction.deadline <= Date.now() / 1000 ? 'expired' : 'active'
                });
              }
            }
          }
          
          // Count how many USDC positions were found
          const usdcPositionsFound = allUserPredictionsWithStakes.filter(p => p.userStakes?.USDC).length;
          console.log(`✅ USDC batch check complete. Found ${usdcPositionsFound} USDC positions`);
        } catch (usdcBatchError) {
          console.warn('Failed to batch fetch USDC positions:', usdcBatchError);
        }
      }
      
      // Debug: Log USDC totals
      const totalUsdcStaked = allUserPredictionsWithStakes.reduce((sum, p) => {
        const usdc = p.userStakes?.USDC;
        return sum + ((usdc?.yesAmount || 0) + (usdc?.noAmount || 0));
      }, 0);
      console.log(`📊 Found ${allUserPredictionsWithStakes.length} predictions, USDC total staked: ${totalUsdcStaked}`);
      
      
      setAllUserPredictions(allUserPredictionsWithStakes);
      
      // No cache - always fresh from Redis
    } catch (error) {
      console.error('Failed to fetch all user predictions:', error);
    } finally {
      setLoadingStakes(false);
    }
    // claimChainKey belongs here: the stakes read now names a chain, and
    // without the dep this keeps the chain it captured on first render and
    // shows Base's positions after a switch.
  }, [address, allPredictions, predictionsLoading, claimChainKey]);

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
        // Show only predictions that can be claimed (won + not claimed OR cancelled with unclaimed stakes)
        filteredPredictions = allUserPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          const usdcStake = p.userStakes?.USDC;

          // Check local claimed state first
          const ethClaimed = claimedStakes.has(`${p.id}-ETH`) || ethStake?.claimed;
          const swipeClaimed = claimedStakes.has(`${p.id}-SWIPE`) || swipeStake?.claimed;
          const usdcClaimed = claimedStakes.has(`${p.id}-USDC`) || usdcStake?.claimed;

          // Must be resolved and user must have won, and not already claimed
          const ethCanClaim = ethStake && ethStake.isWinner && ethStake.canClaim && !ethClaimed;
          const swipeCanClaim = swipeStake && swipeStake.isWinner && swipeStake.canClaim && !swipeClaimed;
          const usdcCanClaim = usdcStake && usdcStake.isWinner && usdcStake.canClaim && !usdcClaimed;

          // Also include cancelled predictions where user can claim refund
          const ethCanClaimRefund = p.cancelled && ethStake && !ethClaimed && (ethStake.yesAmount > 0 || ethStake.noAmount > 0);
          const swipeCanClaimRefund = p.cancelled && swipeStake && !swipeClaimed && (swipeStake.yesAmount > 0 || swipeStake.noAmount > 0);
          const usdcCanClaimRefund = (p.cancelled || p.usdcCancelled) && usdcStake && !usdcClaimed && (usdcStake.yesAmount > 0 || usdcStake.noAmount > 0);

          return ethCanClaim || swipeCanClaim || usdcCanClaim || ethCanClaimRefund || swipeCanClaimRefund || usdcCanClaimRefund;
        });
        break;
        
      case 'active':
        // Show only active predictions where user participated
        filteredPredictions = allUserPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline > Date.now() / 1000);
        break;
        
      case 'won':
        // Show only predictions where user won (regardless of claimed status)
        filteredPredictions = allUserPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          const usdcStake = p.userStakes?.USDC;
          return (ethStake?.isWinner) || (swipeStake?.isWinner) || (usdcStake?.isWinner);
        });
        break;
        
      case 'lost':
        // Show only predictions where user lost
        filteredPredictions = allUserPredictions
          .filter(p => {
            const ethStake = p.userStakes?.ETH;
            const swipeStake = p.userStakes?.SWIPE;
            const usdcStake = p.userStakes?.USDC;
            return (ethStake && !ethStake.isWinner && p.status === 'resolved') || 
                   (swipeStake && !swipeStake.isWinner && p.status === 'resolved') ||
                   (usdcStake && !usdcStake.isWinner && (p.status === 'resolved' || p.usdcResolved));
          })
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // Newest first (highest createdAt on top)
        break;
        
      case 'expired':
        // Show only expired predictions where user participated (deadline passed but not resolved)
        filteredPredictions = allUserPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline <= Date.now() / 1000);
        break;
        
      case 'cancelled':
        // Show only cancelled predictions where user participated
        filteredPredictions = allUserPredictions.filter(p => p.cancelled || p.usdcCancelled);
        break;
        
      case 'claimed':
        // Show only predictions that have been claimed
        filteredPredictions = allUserPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          const usdcStake = p.userStakes?.USDC;
          
          // Check local claimed state first
          const ethClaimed = claimedStakes.has(`${p.id}-ETH`) || ethStake?.claimed;
          const swipeClaimed = claimedStakes.has(`${p.id}-SWIPE`) || swipeStake?.claimed;
          const usdcClaimed = claimedStakes.has(`${p.id}-USDC`) || usdcStake?.claimed;
          
          return ethClaimed || swipeClaimed || usdcClaimed;
        });
        break;
        
      case 'all':
        // Show all predictions where user participated
        filteredPredictions = allUserPredictions;
        break;
        
      default:
        // Default to ready-to-claim
        filteredPredictions = allUserPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          const usdcStake = p.userStakes?.USDC;
          
          // Check local claimed state first
          const ethClaimed = claimedStakes.has(`${p.id}-ETH`) || ethStake?.claimed;
          const swipeClaimed = claimedStakes.has(`${p.id}-SWIPE`) || swipeStake?.claimed;
          const usdcClaimed = claimedStakes.has(`${p.id}-USDC`) || usdcStake?.claimed;
          
          const ethCanClaim = ethStake && ethStake.isWinner && ethStake.canClaim && !ethClaimed;
          const swipeCanClaim = swipeStake && swipeStake.isWinner && swipeStake.canClaim && !swipeClaimed;
          const usdcCanClaim = usdcStake && usdcStake.isWinner && usdcStake.canClaim && !usdcClaimed;
          
          return ethCanClaim || swipeCanClaim || usdcCanClaim;
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
  }, [address, fetchAllPredictionsComplete]);

  // Fetch all user predictions when ALL predictions are loaded (not just active)
  // Wait for allPredictionsLoaded flag AND a reasonable number of predictions to ensure we have resolved ones too
  useEffect(() => {
    // We need at least 50 predictions to ensure we have resolved predictions loaded
    // (if only 6 are loaded, that's just active predictions from main page)
    const hasEnoughPredictions = allPredictions && allPredictions.length >= 50;
    
    if (hasEnoughPredictions && address && allUserPredictions.length === 0 && !predictionsLoading && allPredictionsLoaded) {
      calculateStats();
      fetchAllUserPredictions(false);
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
    setPredictionsPage(1); // Reset pagination on filter change
    
    // If allUserPredictions is empty, fetch it first
    if (allUserPredictions.length === 0) {
      console.log('🔄 No allUserPredictions found, fetching first...');
      await fetchAllUserPredictions(true);
    }
    
    // Filter allUserPredictions based on new filter
    await fetchUserStakes(false, newFilter);
  }, [selectedFilter, allUserPredictions.length, fetchAllUserPredictions, fetchUserStakes]);

  // Handle claim reward
  const handleClaimReward = async (predictionId: string, tokenType?: 'ETH' | 'SWIPE' | 'USDC') => {
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
        // One parser, not a ladder of string strips.
        //
        // The ladder handled pred_v1_, pred_v2_ and bare pred_N, and everything
        // else fell into its last arm, where `pred_v3_9`.replace('pred_','')
        // yields 'v3_9' and parseInt yields NaN. So every market on V3 and then
        // on V4 alerted "Invalid prediction ID" and returned, which made the
        // routing below unreachable code and made claiming impossible on the
        // only contracts that take bets. parseMarketId knows every generation
        // and gains new ones without another arm being added here.
        const claimRef = parseMarketId(predictionId);
        if (!claimRef) {
          alert('❌ Invalid prediction ID');
          return;
        }
        const numericId = claimRef.numericId;

        console.log(`🎯 Attempting to claim reward for prediction ${numericId}...`);

        // Handle USDC claims separately - use USDC DualPool contract
        if (tokenType === 'USDC') {
          console.log(`🎯 Using USDC DualPool contract for claim`);
          
          // Three ways a position pays out, not two. Cancelled refunds, and so
          // does a market that resolved with nobody on the winning side, which
          // the contract flags as refundable and which claimWinnings rejects
          // with "Not claimable". /api/sync/usdc has always stored that flag;
          // this line just never read it, so the one case where every backer is
          // owed their stake back was the one case the button could not pay.
          const isRefund =
            prediction.cancelled || prediction.usdcCancelled || prediction.usdcRefundable;
          const functionName = isRefund ? 'claimRefund' : 'claimWinnings';
          console.log(`🎯 Claiming USDC reward using function: ${functionName}`);

          // Two contract generations hold positions at once, and a claim has to
          // go to the one that actually holds this market's money. Sending a
          // claim for a live market to the archived pool reverts, and reads to
          // the user as their winnings being unavailable.
          const liveMarket = getMarketContract(claimChainKey);
          const claimTarget =
            claimRef.generation === CURRENT_GENERATION && liveMarket
              ? { address: liveMarket.address, abi: liveMarket.abi, chainId: liveMarket.chainId }
              : {
                  address: USDC_DUALPOOL_CONTRACT_ADDRESS as `0x${string}`,
                  abi: USDC_DUALPOOL_ABI,
                  chainId: undefined,
                };

          writeContract({
            address: claimTarget.address,
            abi: claimTarget.abi as never,
            functionName: functionName,
            args: [BigInt(numericId)],
            ...(claimTarget.chainId === undefined ? {} : { chainId: claimTarget.chainId }),
          } as never, {
            onSuccess: async (txHash: string) => {
              console.log('🎯 USDC Claim transaction sent:', txHash);
              markStakeAsClaimed(predictionId, 'USDC');
              clearCache();
              
              // Create transaction record for USDC claim
              const usdcStake = stake as { potentialPayout?: number };
              const transaction: UserTransaction = {
                id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'claim' as const,
                predictionId: predictionId,
                predictionQuestion: prediction.question,
                txHash: txHash,
                basescanUrl: txUrl(claimChainKey, txHash),
                timestamp: Date.now(),
                status: 'pending' as const,
                tokenType: 'USDC' as const,
                amount: usdcStake?.potentialPayout || 0
              };
              
              try {
                await fetch('/api/user-transactions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userId: address.toLowerCase(),
                    chain: claimChainKey,
                    transaction
                  }),
                });

                // Add to local state
                addNewTransaction(transaction);
              } catch (e) {
                console.error('Failed to save USDC transaction:', e);
              }
              
              showClaimModal(txHash, txUrl(claimChainKey, txHash));
              
              /**
               * Refresh this market's pools after the claim.
               *
               * This posted to /api/sync, which is not a route: app/api/sync
               * holds prediction, usdc and v2 and no handler of its own, so the
               * call 404d, the catch logged, and the pools on screen stayed at
               * whatever they were before the claim until something else
               * happened to sync them.
               *
               * /api/sync/usdc is the collateral sync, and it wants the market
               * ids and the chain. Same call postTx.ts makes after a bet.
               */
              try {
                await fetch('/api/sync/usdc', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chain: claimChainKey, predictionIds: [predictionId] }),
                });
              } catch (e) {
                console.error('Sync failed:', e);
              }
            },
            onError: (error: any) => {
              console.error('❌ USDC Claim transaction failed:', error);
              showErrorModal(error?.message || 'USDC claim transaction failed');
              setIsTransactionLoading(false);
            },
          });
          return;
        }

        // All predictions use V2 contract (pred_v1_ are synced V1 predictions on V2)
        const contract = CONTRACTS.V2;

        /**
         * The claim has to leave for Base, and only for Base.
         *
         * This send carried no chainId, so viem asserted nothing and the
         * transaction went out on whatever chain the wallet happened to hold.
         * The app's chain and the wallet's chain diverge routinely, because
         * setActiveChain never touches the wallet. On a chain where the V2
         * address holds no code the CALL succeeds and returns empty, the
         * transaction mines with status 1, and onSuccess below fires on the
         * hash rather than on a receipt: markStakeAsClaimed runs, the PUT
         * writes status 'success', and the position reads "Claimed" forever
         * while the money is still sitting on Base.
         *
         * TinderCard fixed exactly this on the same two functions. The
         * constants are shared now so the two cannot drift again.
         */
        const blocked = archivedClaimBlocked(claimChainKey);
        if (blocked) {
          showErrorModal(blocked);
          setIsTransactionLoading(false);
          return;
        }

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
          chainId: ARCHIVED_CHAIN_ID,
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
                  chain: claimChainKey,
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
              basescanUrl: txUrl(claimChainKey, txHash),
              timestamp: Date.now(),
              status: 'pending',
              tokenType: tokenType || 'ETH',
              amount: stake?.potentialPayout || 0
            };

            await fetch('/api/user-transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: address.toLowerCase(),
                chain: claimChainKey,
                transaction
              })
            });

            // Add transaction incrementally instead of refetching all
            addNewTransaction(transaction);

            // Update stake as claimed in Redis - only for the specific token type
            await fetch('/api/stakes', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: address.toLowerCase(),
                predictionId: predictionId,
                tokenType: tokenType || 'ETH',
                updates: { claimed: true }
              })
            });
            
            // Immediately refresh transaction history to show the new transaction
            fetchUserTransactions();

            // Show success modal immediately - no need to wait for confirmation
            // If we have txHash, the transaction was sent successfully
            showSuccessModal(txHash, transaction.basescanUrl, predictionId, tokenType || 'ETH', stake?.potentialPayout || 0);
            
            // Mark stake as claimed in Redis in background (don't block UI)
            fetch('/api/stakes', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: address.toLowerCase(),
                predictionId: predictionId,
                tokenType: tokenType || 'ETH',
                updates: { claimed: true }
              }),
            }).then(response => {
              if (response.ok) {
                console.log('✅ Stake marked as claimed in Redis');
              }
            }).catch(error => {
              console.error('❌ Error updating stake as claimed:', error);
            });
            
            // Update transaction status in background when confirmed
            const checkAndUpdateTransaction = async () => {
              try {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                const response = await fetch(`/api/check-transaction?txHash=${txHash}`);
                const data = await response.json();
                
                if (data.success && data.data.status === 'success') {
                  await fetch('/api/user-transactions', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      userId: address.toLowerCase(),
                      chain: claimChainKey,
                      txHash,
                      status: 'success'
                    })
                  });
                }
              } catch (error) {
                console.error('Background transaction check failed:', error);
              }
            };
            checkAndUpdateTransaction(); // Run in background, don't await
              
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
          
          // Update the stake as claimed - only for the specific token type
          const updateResponse = await fetch('/api/stakes', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: address.toLowerCase(),
              predictionId: predictionId,
              tokenType: tokenType || 'ETH',
              updates: { claimed: true }
            }),
          });
          
          if (updateResponse.ok) {
            console.log(`✅ ${tokenType || 'ETH'} stake marked as claimed successfully`);
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
        // Show only predictions that can be claimed (won + not claimed OR cancelled with unclaimed stakes)
        return allUserPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          const usdcStake = p.userStakes?.USDC;

          // Check local claimed state first
          const ethClaimed = claimedStakes.has(`${p.id}-ETH`) || ethStake?.claimed;
          const swipeClaimed = claimedStakes.has(`${p.id}-SWIPE`) || swipeStake?.claimed;
          const usdcClaimed = claimedStakes.has(`${p.id}-USDC`) || usdcStake?.claimed;

          // Must be resolved and user must have won, and not already claimed
          const ethCanClaim = ethStake && ethStake.isWinner && ethStake.canClaim && !ethClaimed;
          const swipeCanClaim = swipeStake && swipeStake.isWinner && swipeStake.canClaim && !swipeClaimed;
          const usdcCanClaim = usdcStake && usdcStake.isWinner && usdcStake.canClaim && !usdcClaimed;

          // Also include cancelled predictions where user can claim refund
          const ethCanClaimRefund = p.cancelled && ethStake && !ethClaimed && (ethStake.yesAmount > 0 || ethStake.noAmount > 0);
          const swipeCanClaimRefund = p.cancelled && swipeStake && !swipeClaimed && (swipeStake.yesAmount > 0 || swipeStake.noAmount > 0);
          const usdcCanClaimRefund = (p.cancelled || p.usdcCancelled) && usdcStake && !usdcClaimed && (usdcStake.yesAmount > 0 || usdcStake.noAmount > 0);

          return ethCanClaim || swipeCanClaim || usdcCanClaim || ethCanClaimRefund || swipeCanClaimRefund || usdcCanClaimRefund;
        });
      case 'active':
        // Show only active predictions where user participated
        return allUserPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline > Date.now() / 1000);
      case 'won':
        // Show only predictions where user won (regardless of claimed status)
        return allUserPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          const usdcStake = p.userStakes?.USDC;
          return (ethStake?.isWinner) || (swipeStake?.isWinner) || (usdcStake?.isWinner);
        });
      case 'lost':
        // Show only predictions where user lost
        return allUserPredictions
          .filter(p => {
            const ethStake = p.userStakes?.ETH;
            const swipeStake = p.userStakes?.SWIPE;
            const usdcStake = p.userStakes?.USDC;
            return (ethStake && !ethStake.isWinner && p.status === 'resolved') || 
                   (swipeStake && !swipeStake.isWinner && p.status === 'resolved') ||
                   (usdcStake && !usdcStake.isWinner && (p.status === 'resolved' || p.usdcResolved));
          })
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // Newest first (highest createdAt on top)
      case 'expired':
        // Show only expired predictions where user participated (deadline passed but not resolved)
        return allUserPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline <= Date.now() / 1000);
      case 'cancelled':
        // Show only cancelled predictions where user participated
        return allUserPredictions.filter(p => p.cancelled || p.usdcCancelled);
      case 'claimed':
        // Show only predictions that have been claimed
        return allUserPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          const usdcStake = p.userStakes?.USDC;
          
          // Check local claimed state first
          const ethClaimed = claimedStakes.has(`${p.id}-ETH`) || ethStake?.claimed;
          const swipeClaimed = claimedStakes.has(`${p.id}-SWIPE`) || swipeStake?.claimed;
          const usdcClaimed = claimedStakes.has(`${p.id}-USDC`) || usdcStake?.claimed;
          
          return ethClaimed || swipeClaimed || usdcClaimed;
        });
      case 'all':
        // Show all predictions where user participated
        return allUserPredictions;
      default:
        // Default to ready-to-claim
        return allUserPredictions.filter(p => {
          const ethStake = p.userStakes?.ETH;
          const swipeStake = p.userStakes?.SWIPE;
          const usdcStake = p.userStakes?.USDC;
          
          // Check local claimed state first
          const ethClaimed = claimedStakes.has(`${p.id}-ETH`) || ethStake?.claimed;
          const swipeClaimed = claimedStakes.has(`${p.id}-SWIPE`) || swipeStake?.claimed;
          const usdcClaimed = claimedStakes.has(`${p.id}-USDC`) || usdcStake?.claimed;
          
          const ethCanClaim = ethStake && ethStake.isWinner && ethStake.canClaim && !ethClaimed;
          const swipeCanClaim = swipeStake && swipeStake.isWinner && swipeStake.canClaim && !swipeClaimed;
          const usdcCanClaim = usdcStake && usdcStake.isWinner && usdcStake.canClaim && !usdcClaimed;
          
          return ethCanClaim || swipeCanClaim || usdcCanClaim;
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

  // Count predictions in waiting (expired but not resolved)
  const inWaitingCount = allUserPredictions.filter(p => {
    return !p.resolved && !p.cancelled && p.deadline <= Date.now() / 1000;
  }).length;
  
  const swipeTotalStaked = allUserPredictions.reduce((sum, p) => {
    const swipeStake = p.userStakes?.SWIPE;
    const swipeAmount = (swipeStake?.yesAmount || 0) + (swipeStake?.noAmount || 0);
    return sum + swipeAmount;
  }, 0);
  
  // USDC totals (6 decimals)
  const usdcTotalStaked = allUserPredictions.reduce((sum, p) => {
    const usdcStake = p.userStakes?.USDC;
    const usdcAmount = (usdcStake?.yesAmount || 0) + (usdcStake?.noAmount || 0);
    return sum + usdcAmount;
  }, 0);
  
  const ethTotalPotentialPayout = allUserPredictions.reduce((sum, p) => {
    const ethStake = p.userStakes?.ETH;
    return sum + (ethStake?.potentialPayout || 0);
  }, 0);
  
  const swipeTotalPotentialPayout = allUserPredictions.reduce((sum, p) => {
    const swipeStake = p.userStakes?.SWIPE;
    return sum + (swipeStake?.potentialPayout || 0);
  }, 0);
  
  const usdcTotalPotentialPayout = allUserPredictions.reduce((sum, p) => {
    const usdcStake = p.userStakes?.USDC;
    return sum + (usdcStake?.potentialPayout || 0);
  }, 0);
  
  const ethTotalPotentialProfit = allUserPredictions.reduce((sum, p) => {
    const ethStake = p.userStakes?.ETH;
    return sum + (ethStake?.potentialProfit || 0);
  }, 0);
  
  const usdcTotalPotentialProfit = allUserPredictions.reduce((sum, p) => {
    const usdcStake = p.userStakes?.USDC;
    return sum + (usdcStake?.potentialProfit || 0);
  }, 0);
  
  const swipeTotalPotentialProfit = allUserPredictions.reduce((sum, p) => {
    const swipeStake = p.userStakes?.SWIPE;
    return sum + (swipeStake?.potentialProfit || 0);
  }, 0);
  
  const canClaimCount = allUserPredictions.filter(p => {
    const ethStake = p.userStakes?.ETH;
    const swipeStake = p.userStakes?.SWIPE;
    const usdcStake = p.userStakes?.USDC;

    // Check local claimed state first
    const ethClaimed = claimedStakes.has(`${p.id}-ETH`) || ethStake?.claimed;
    const swipeClaimed = claimedStakes.has(`${p.id}-SWIPE`) || swipeStake?.claimed;
    const usdcClaimed = claimedStakes.has(`${p.id}-USDC`) || usdcStake?.claimed;

    // Must be resolved, user must have won, and not already claimed
    const ethCanClaim = ethStake && ethStake.isWinner && ethStake.canClaim && !ethClaimed;
    const swipeCanClaim = swipeStake && swipeStake.isWinner && swipeStake.canClaim && !swipeClaimed;
    const usdcCanClaim = usdcStake && usdcStake.isWinner && usdcStake.canClaim && !usdcClaimed;

    // Also include cancelled predictions where user can claim refund
    const ethCanClaimRefund = p.cancelled && ethStake && !ethClaimed && (ethStake.yesAmount > 0 || ethStake.noAmount > 0);
    const swipeCanClaimRefund = p.cancelled && swipeStake && !swipeClaimed && (swipeStake.yesAmount > 0 || swipeStake.noAmount > 0);
    const usdcCanClaimRefund = (p.cancelled || p.usdcCancelled) && usdcStake && !usdcClaimed && (usdcStake.yesAmount > 0 || usdcStake.noAmount > 0);

    return ethCanClaim || swipeCanClaim || usdcCanClaim || ethCanClaimRefund || swipeCanClaimRefund || usdcCanClaimRefund;
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
          <h3>Could not load your positions</h3>
          <p>Error: {predictionsError}</p>
          <p>Connected wallet: {address}</p>
          <button onClick={() => fetchUserStakes(true)}>Retry</button>
        </div>
      </div>
    );
  }

  // Share stats handler - toggles dropdown
  const handleShareStats = () => {
    setShowShareDropdown(!showShareDropdown);
    setShareStep('type'); // Reset to first step
  };
  
  // Handle share type selection (step 1)
  const handleSelectShareType = (type: 'profit-only' | 'full') => {
    setSelectedShareType(type);
    setShareStep('platform');
  };
  
  // Go back to type selection
  const handleBackToType = () => {
    setShareStep('type');
  };

  // Perform share based on selected option and platform
  const performShareStats = async (shareType: 'full' | 'profit-only', platform: 'farcaster' | 'twitter') => {
    const ethIsProfit = ethTotalPotentialProfit >= 0;
    const swipeIsProfit = swipeTotalPotentialProfit >= 0;
    const overallProfit = ethIsProfit && swipeIsProfit;
    
    // Get random intro from share-texts.ts
    const intro = getRandomPortfolioIntro(overallProfit, platform);
    
    let shareText = `${intro}\n\n📊 My SWIPE Stats:\n`;
    
    if (shareType === 'full') {
      // Full stats - show staked, payout, and profit/loss
      if (ethTotalStaked > 0) {
        shareText += `\n💰 ETH Staked: ${formatEth(ethTotalStaked)}`;
        shareText += `\n   Payout: ${formatEth(ethTotalPotentialPayout)}`;
        if (ethIsProfit) {
          shareText += `\n   Profit: +${formatEth(ethTotalPotentialProfit)} 📈`;
        } else {
          shareText += `\n   At risk: ${formatEth(Math.abs(ethTotalPotentialProfit))} 🎲`;
        }
      }
      
      if (swipeTotalStaked > 0) {
        shareText += `\n\n🎯 SWIPE Staked: ${formatSwipe(swipeTotalStaked)}`;
        shareText += `\n   Payout: ${formatSwipe(swipeTotalPotentialPayout)}`;
        if (swipeIsProfit) {
          shareText += `\n   Profit: +${formatSwipe(swipeTotalPotentialProfit)} 📈`;
        } else {
          shareText += `\n   At risk: ${formatSwipe(Math.abs(swipeTotalPotentialProfit))} 🎲`;
        }
      }
    } else {
      // Profit only - just show the profit/loss summary
      if (ethTotalStaked > 0 || ethTotalPotentialProfit !== 0) {
        if (ethIsProfit) {
          shareText += `\n💰 ETH: +${formatEth(ethTotalPotentialProfit)} profit 📈`;
        } else {
          shareText += `\n💰 ETH: ${formatEth(Math.abs(ethTotalPotentialProfit))} at risk 🎲`;
        }
      }
      
      if (swipeTotalStaked > 0 || swipeTotalPotentialProfit !== 0) {
        if (swipeIsProfit) {
          shareText += `\n🎯 SWIPE: +${formatSwipe(swipeTotalPotentialProfit)} profit 📈`;
        } else {
          shareText += `\n🎯 SWIPE: ${formatSwipe(Math.abs(swipeTotalPotentialProfit))} at risk 🎲`;
        }
      }
    }
    
    const shareUrl = 'https://theswipe.app';
    // Get random outro from share-texts.ts with platform tag
    const outro = getRandomPortfolioOutro(platform);
    shareText += `\n\n${outro}`;
    
    if (platform === 'farcaster') {
      // Use native composeCast for Farcaster - opens in-app compose dialog
      try {
        await composeCast({
          text: shareText,
          embeds: [shareUrl]
        });
        console.log('✅ Stats shared via native composeCast');
      } catch (error) {
        console.error('Failed to share stats via composeCast, falling back to URL:', error);
        // Fallback to URL only if composeCast completely fails
        const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(shareUrl)}`;
        window.open(warpcastUrl, '_blank');
      }
    } else {
      // Twitter - use universal openUrl (MiniKit or Farcaster SDK)
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
      await openUrl(twitterUrl);
    }
    
    setShowShareDropdown(false);
    setShareStep('type'); // Reset for next time
  };

  return (
    <div className="enhanced-user-dashboard">
      {/* Summary Stats Table */}
      <div className="stats-table-container">
        {/* Share Stats Badge Button with Dropdown */}
        <div className="share-stats-wrapper">
          <button 
            className="share-stats-badge"
            onClick={handleShareStats}
            title="Share your stats"
          >
            <Share2 size={14} />
          </button>
          
          {showShareDropdown && (
            <>
              <div className="share-dropdown-overlay" onClick={() => { setShowShareDropdown(false); setShareStep('type'); }} />
              <div className="share-stats-dropdown">
                {shareStep === 'type' ? (
                  <>
                    <button 
                      className="share-dropdown-item"
                      onClick={() => handleSelectShareType('profit-only')}
                    >
                      Profit Only
                    </button>
                    <button 
                      className="share-dropdown-item"
                      onClick={() => handleSelectShareType('full')}
                    >
                      Full Stats
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      className="share-dropdown-back"
                      onClick={handleBackToType}
                    >
                      ← Back
                    </button>
                    <button 
                      className="share-dropdown-item share-btn-farcaster-split"
                      onClick={() => performShareStats(selectedShareType, 'farcaster')}
                    >
                      <div className="share-btn-split-bg">
                        <div className="share-btn-half-purple"></div>
                        <div className="share-btn-half-white"></div>
                      </div>
                      <div className="share-btn-icons">
                        <img src="/farc.png" alt="Farcaster" className="share-btn-icon-left" />
                        <img src="/Base_square_blue.png" alt="Base" className="share-btn-icon-right" />
                      </div>
                    </button>
                    <div className="share-stats-divider"></div>
                    <button 
                      className="share-dropdown-item share-btn-twitter"
                      onClick={() => performShareStats(selectedShareType, 'twitter')}
                    >
                      <svg className="share-btn-x-icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
        
        <table className="stats-table">
          <thead>
            <tr>
              <th className="token-header">Token</th>
              <th>Bets</th>
              <th>Payout</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            {/* The collateral row comes first and is always shown, because it
                is the only one that can still take a bet. ETH and SWIPE sat
                above it reading zero on every account that only ever used the
                current contracts, which made a live portfolio look empty. They
                are archived history now and appear when they hold something. */}
            <tr className="usdc-row">
              <td className="token-cell">
                <img src="/usdc.png" alt="" className="token-logo" />
                <span className="token-cell-symbol">{collateralSymbol}</span>
              </td>
              <td className="value-cell">
                <span className="stat-value-total">{formatUsdc(usdcTotalStaked)}</span>
              </td>
              <td className="value-cell">
                <span className="stat-value-payout">{formatUsdc(usdcTotalPotentialPayout)}</span>
              </td>
              <td className="value-cell">
                <span className={`stat-value-profit ${usdcTotalPotentialProfit >= 0 ? 'profit' : 'loss'}`}>
                  {usdcTotalPotentialProfit >= 0 ? '+' : ''}{formatUsdc(usdcTotalPotentialProfit)}
                </span>
              </td>
            </tr>
            {/* ETH and SWIPE rows are gone from this summary.

                They sat on contracts nobody can settle, so the money they
                counted cannot be won, lost or collected, and putting them in a
                table headed Bets, Payout and Profit implied all three. The
                positions themselves are still listed below and still readable;
                what is removed is their claim to be part of a running book. */}
          </tbody>
        </table>
        
        {/* Ready to Claim Badge with Navigation Icons */}
        <div className="claim-badge-container">
          <div className="claim-badge">
            <span className="claim-icon">🎉</span>
            <span className="claim-count">{canClaimCount}</span>
            <GradientText 
              colors={['#0a0a0a', '#1a2a00', '#0a0a0a', '#1a3000', '#0a0a0a']}
              animationSpeed={3}
              showBorder={false}
            >
              <span className="claim-label">READY TO CLAIM</span>
            </GradientText>
          </div>
          {allUserPredictions.length > 0 && (
            <div className="dashboard-nav-icons">
              <button
                className={`nav-icon-btn pnl-btn ${activeView === 'pnl' ? 'active' : ''}`}
                onClick={() => setActiveView('pnl')}
                title="Profit & Loss"
              >
                <span className="nav-label">PNL %</span>
              </button>
              {activeView === 'pnl' && (
                <button
                  className="nav-icon-btn nav-back-btn"
                  onClick={() => setActiveView('main')}
                  title="Back to Dashboard"
                >
                  <span className="nav-label">← Back</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Filter Row - inline with separator */}
        <div className="filter-row">
          <div className="filter-row-divider"></div>
          <div className="filter-row-content">
            <span className="filter-row-label">🔻 Filters:</span>
            <div className="filter-select-wrapper">
              <Select value={selectedFilter} onValueChange={handleFilterChange}>
                <SelectTrigger className="filter-row-select">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                <SelectItem value="ready-to-claim">
                  🎉 Ready to Claim {canClaimCount > 0 && <span className="filter-badge">{canClaimCount}</span>}
                </SelectItem>
                <SelectItem value="active">⏳ Active</SelectItem>
                <SelectItem value="won">🏆 Won</SelectItem>
                <SelectItem value="lost">💔 Lost</SelectItem>
                <SelectItem value="expired">
                  ⏰ In Waiting {inWaitingCount > 0 && <span className="filter-badge">{inWaitingCount}</span>}
                </SelectItem>
                <SelectItem value="cancelled">❌ Cancelled</SelectItem>
                <SelectItem value="claimed">✅ Claimed</SelectItem>
                <SelectItem value="all">📊 All</SelectItem>
              </SelectContent>
            </Select>
            {canClaimCount > 0 && selectedFilter !== 'ready-to-claim' && (
              <span className="filter-badge-overlay claim-badge-overlay">{canClaimCount}</span>
            )}
            {inWaitingCount > 0 && selectedFilter !== 'expired' && selectedFilter !== 'ready-to-claim' && (
              <span className="filter-badge-overlay">{inWaitingCount}</span>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Conditional View Rendering */}
      {activeView === 'main' && (
        <>
          {/* No predictions message */}
      {filteredPredictions.length === 0 && (
        <div className="no-predictions-inline">
          {selectedFilter === 'ready-to-claim' ? (
            <>
              <h3>Nothing to claim</h3>
              <p>A win shows up here once the market it was on has been settled.</p>
            </>
          ) : selectedFilter === 'active' ? (
            <>
              <h3>No open positions</h3>
              <p>Nothing you have backed is still running.</p>
            </>
          ) : selectedFilter === 'won' ? (
            <>
              <h3>No wins yet</h3>
              <p>Markets you called right will collect here.</p>
            </>
          ) : selectedFilter === 'lost' ? (
            <>
              <h3>Nothing lost</h3>
              <p>No position of yours has settled against you.</p>
            </>
          ) : selectedFilter === 'expired' ? (
            <>
              <h3>Nothing waiting</h3>
              <p>Every market you are in has been settled.</p>
            </>
          ) : selectedFilter === 'cancelled' ? (
            <>
              <h3>Nothing cancelled</h3>
              <p>No market you backed was called off.</p>
            </>
          ) : selectedFilter === 'claimed' ? (
            <>
              <h3>Nothing collected yet</h3>
              <p>Payouts you have taken stay listed here.</p>
            </>
          ) : (
            <>
              <h3>No positions</h3>
              <p>You have not backed a market yet. Swipe on one to place a stake.</p>
            </>
          )}
        </div>
      )}

      {/* Filtered Predictions Section */}
      {filteredPredictions.length > 0 && (
        <div className="section">
          <h3>
            {selectedFilter === 'ready-to-claim' && 'Ready to claim'}
            {selectedFilter === 'active' && 'Open positions'}
            {selectedFilter === 'won' && 'Won'}
            {selectedFilter === 'lost' && 'Lost'}
            {selectedFilter === 'expired' && 'Waiting to settle'}
            {selectedFilter === 'cancelled' && 'Cancelled'}
            {selectedFilter === 'claimed' && 'Collected'}
            {selectedFilter === 'all' && 'Everything'}
          </h3>
          <div className="predictions-grid">
            {filteredPredictions
              .slice((predictionsPage - 1) * predictionsPerPage, predictionsPage * predictionsPerPage)
              .map((prediction) => {
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
          
          {/* Predictions Pagination */}
          {filteredPredictions.length > predictionsPerPage && (
            <div className="flex items-center justify-center gap-2 mt-6 p-4 bg-gradient-to-r from-black/80 via-zinc-900/90 to-black/80 rounded-xl border border-[#d4ff00]/20">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPredictionsPage(prev => Math.max(1, prev - 1))}
                disabled={predictionsPage === 1}
                className="gap-2 bg-zinc-900/80 border-zinc-700 hover:bg-zinc-800 hover:border-[#d4ff00]/50 text-white disabled:opacity-30"
              >
                <span>←</span>
                <span className="hidden sm:inline">Back</span>
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.ceil(filteredPredictions.length / predictionsPerPage) }, (_, i) => i + 1)
                  .filter(page => {
                    const totalPages = Math.ceil(filteredPredictions.length / predictionsPerPage);
                    return page === 1 || 
                           page === totalPages || 
                           Math.abs(page - predictionsPage) <= 1;
                  })
                  .map((page, index, arr) => (
                    <React.Fragment key={page}>
                      {index > 0 && arr[index - 1] !== page - 1 && (
                        <span className="text-zinc-500 px-1">•••</span>
                      )}
                      <Button
                        variant={predictionsPage === page ? "swipe" : "ghost"}
                        size="sm"
                        onClick={() => setPredictionsPage(page)}
                        className={predictionsPage === page 
                          ? "min-w-[36px] font-bold" 
                          : "min-w-[36px] text-zinc-400 hover:text-white hover:bg-zinc-800"
                        }
                      >
                        {page}
                      </Button>
                    </React.Fragment>
                  ))
                }
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPredictionsPage(prev => Math.min(Math.ceil(filteredPredictions.length / predictionsPerPage), prev + 1))}
                disabled={predictionsPage >= Math.ceil(filteredPredictions.length / predictionsPerPage)}
                className="gap-2 bg-zinc-900/80 border-zinc-700 hover:bg-zinc-800 hover:border-[#d4ff00]/50 text-white disabled:opacity-30"
              >
                <span className="hidden sm:inline">Next</span>
                <span>→</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Transaction History */}
      <div className="section">
        <div className="section-header-with-action">
          <h3>Transaction history</h3>
        </div>
        {loadingTransactions ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading transaction history...</p>
          </div>
        ) : userTransactions.length > 0 ? (
          <>
            <div className="transactions-list">
              {userTransactions
                .sort((a, b) => b.timestamp - a.timestamp) // Sort by newest first
                .slice((transactionPage - 1) * transactionsPerPage, transactionPage * transactionsPerPage)
                .map((transaction, index) => {
                  /**
                   * The status we actually recorded, not one inferred from a
                   * hash.
                   *
                   * This used to read: if there is a hash longer than ten
                   * characters, call it a success. A hash means the transaction
                   * was submitted. It says nothing about whether it mined, and
                   * a reverted transaction has a hash like any other, so every
                   * failed claim in this list was displayed with a green tick.
                   */
                  const displayStatus = transaction.status;
                  
                  // Create unique key combining index, id, and hash to avoid React duplicate key warnings
                  const uniqueKey = `${transaction.id}_${index}_${transaction.txHash || transaction.timestamp || ''}`;
                  
                  /**
                   * The token the record says, or nothing.
                   *
                   * What stood here guessed. If no tokenType was stored it
                   * assumed ETH, then overrode that to SWIPE when the amount
                   * was "large", on the theory that ETH stakes are small and
                   * SWIPE stakes are in the thousands. A 150 USDC bet is large
                   * by that test, so it was labelled SWIPE and given the SWIPE
                   * logo. Older ETH rows in wei tripped the second branch too.
                   *
                   * A row that does not know its token now says so. An unknown
                   * is not a defect worth hiding: it is one archived record
                   * without a field, and inventing an answer to avoid an empty
                   * badge is how a history ends up describing money that was
                   * never staked.
                   */
                  const tokenType = transaction.tokenType;
                  const isSwipe = tokenType === 'SWIPE';
                  const isUsdc = tokenType === 'USDC';
                  const isEth = tokenType === 'ETH';
                  
                  return (
                    <div key={uniqueKey} className="transaction-card-compact">
                      <div className="transaction-header-compact">
                        <div className="transaction-badges-compact">
                          <span className={`type-badge-compact ${transaction.type}`}>
                            {transaction.type === 'claim' && '💰'}
                            {transaction.type === 'stake' && '🎯'}
                            {transaction.type === 'resolve' && '✅'}
                            {transaction.type === 'cancel' && '🚫'}
                            {transaction.type === 'exit_early' && '🚪'}
                            {transaction.type === 'stake' ? 'BET' : (transaction.type === 'exit_early' ? 'EXIT' : transaction.type.toUpperCase())}
                          </span>
                          <span className={`token-type-badge-compact ${(tokenType ?? 'unknown').toLowerCase()}`}>
                            {isUsdc ? (
                              <span className="usdc-icon-tx">$</span>
                            ) : isSwipe ? (
                              <img src="/splash.png" alt="" className="token-badge-icon-compact" />
                            ) : isEth ? (
                              <img src="/Ethereum-icon-purple.svg" alt="" className="token-badge-icon-compact eth-icon-no-bg" />
                            ) : null}
                            {/* Collateral rows carry the chain's own symbol, so a
                                Robinhood row does not claim to be in USDC. */}
                            {isUsdc ? collateralSymbol : tokenType ?? 'Token not recorded'}
                          </span>
                          <span className={`status-badge-compact ${displayStatus}`}>
                            {displayStatus === 'pending' && '⏳'}
                            {displayStatus === 'success' && '✅'}
                            {displayStatus === 'failed' && '❌'}
                            {displayStatus.toUpperCase()}
                          </span>
                        </div>
                        <div className="transaction-time-compact">
                          {new Date(transaction.timestamp).toLocaleString('pl-PL', { 
                            day: '2-digit', 
                            month: '2-digit', 
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </div>
                      </div>
                      <div className="transaction-details-compact">
                        <p className="transaction-prediction">
                          <span className="label">Prediction:</span>
                          <span className="value">{transaction.predictionQuestion}</span>
                        </p>
                        <p className="transaction-hash">
                          <span className="label">Transaction Hash:</span>
                          {transaction.txHash ? (
                            <a 
                              href={transaction.basescanUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="basescan-link-compact"
                            >Explorer<svg className="basescan-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M10 2L2 10M10 2H6M10 2V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </a>
                          ) : (
                            <span className="pending-text">Pending...</span>
                          )}
                        </p>
                        {transaction.amount && transaction.amount > 0 && (
                          <p className="transaction-amount-compact">
                            <span className="label">Amount:</span>
                            <span className={`amount-value-compact ${(tokenType ?? 'unknown').toLowerCase()}`}>
                              {(() => {
                                if (isUsdc) {
                                  // The collateral leg is stored raw at 6 decimals.
                                  return `${(transaction.amount / 1e6).toFixed(2)} ${collateralSymbol}`;
                                }
                                // Older records stored the amount either raw or
                                // already converted, so this reads the scale.
                                // That is a question about the storage format,
                                // not a guess about which token it was: the
                                // token comes from the record or is not shown.
                                const isWei = transaction.amount > 1000000;
                                if (isSwipe) {
                                  return `${isWei ? formatSwipe(transaction.amount) : transaction.amount.toLocaleString()} SWIPE`;
                                }
                                if (isEth) {
                                  return `${isWei ? formatEth(transaction.amount) : transaction.amount.toFixed(6)} ETH`;
                                }
                                return `${transaction.amount.toLocaleString()}, unit not recorded`;
                              })()}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
            
            {/* Pagination */}
            {userTransactions.length > transactionsPerPage && (
              <div className="flex items-center justify-center gap-4 mt-6 p-4 bg-gradient-to-r from-black/80 via-zinc-900/90 to-black/80 rounded-xl border border-[#d4ff00]/20">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTransactionPage(prev => Math.max(1, prev - 1))}
                  disabled={transactionPage === 1}
                  className="gap-2 bg-zinc-900/80 border-zinc-700 hover:bg-zinc-800 hover:border-[#d4ff00]/50 text-white disabled:opacity-30"
                >
                  <span>←</span>
                  <span className="hidden sm:inline">Previous</span>
                </Button>
                <span className="text-white font-medium text-sm">
                  Page <span className="text-[#d4ff00] font-bold">{transactionPage}</span> of {Math.ceil(userTransactions.length / transactionsPerPage)}
                  <span className="text-zinc-400 text-xs ml-2">({userTransactions.length} total)</span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTransactionPage(prev => Math.min(Math.ceil(userTransactions.length / transactionsPerPage), prev + 1))}
                  disabled={transactionPage >= Math.ceil(userTransactions.length / transactionsPerPage)}
                  className="gap-2 bg-zinc-900/80 border-zinc-700 hover:bg-zinc-800 hover:border-[#d4ff00]/50 text-white disabled:opacity-30"
                >
                  <span className="hidden sm:inline">Next</span>
                  <span>→</span>
                </Button>
              </div>
            )}
          </>
        ) : transactionsError ? (
          /* An empty list after a failed read is not an empty history, and
             saying "no transactions found" there tells someone their record is
             gone when the server simply did not answer. */
          <div className="no-transactions">
            <p>{transactionsError}</p>
            <button type="button" className="sync-blockchain-btn" onClick={() => fetchUserTransactions(true)}>
              Try again
            </button>
          </div>
        ) : (
          <div className="no-transactions">
            <p>Nothing here yet. Bets, exits and claims show up as you make them.</p>
          </div>
        )}
      </div>
        </>
      )}

      {/* PNL View */}
      {activeView === 'pnl' && allUserPredictions.length > 0 && (
        <PNLTable allUserPredictions={allUserPredictions} />
      )}

      {/* Custom Modal - Dark Theme */}
      {showModal && (
        <div className="claim-modal-overlay" onClick={closeModal}>
          <div className="claim-modal-content" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button className="claim-modal-close" onClick={closeModal}>✕</button>
            
            {/* Pending State */}
            {modalType === 'claim' && (
              <>
                {/* Header with logos */}
                <div className="claim-modal-logos">
                  <img src="/farc.png" alt="Farcaster" className="claim-modal-logo" />
                  <span className="claim-modal-logo-divider">×</span>
                  <img src="/Base_square_blue.png" alt="Base" className="claim-modal-logo" />
                </div>
                
                {/* Loading spinner */}
                <div className="claim-modal-loading">
                  <div className="claim-modal-spinner"></div>
                </div>
                
                <h2 className="claim-modal-title">Claim sent</h2>
                <p className="claim-modal-subtitle">Waiting for it to mine. Nothing has moved until it does.</p>
                
                <div className="claim-modal-tx-info">
                  <span className="claim-modal-tx-label">Transaction:</span>
                  <a 
                    href={modalData.basescanUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="claim-modal-tx-link"
                  >
                    {modalData.txHash?.slice(0, 10)}...{modalData.txHash?.slice(-8)}
                  </a>
                </div>
                
                <a 
                  href={modalData.basescanUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="claim-modal-basescan-btn"
                >
                  View the transaction
                </a>
              </>
            )}
            
            {/* Success State */}
            {modalType === 'success' && (
              <>
                {/* Success icon */}
                <div className="claim-modal-success-icon">
                  <div className="claim-modal-success-circle">
                    <span>✓</span>
                  </div>
                </div>
                
                <h2 className="claim-modal-title">Claimed</h2>
                <p className="claim-modal-subtitle">The payout is in your wallet.</p>
                
                {/* Amount claimed */}
                {modalData.amount && modalData.tokenType && (
                  <div className="claim-modal-amount">
                    <span className="claim-modal-amount-value">
                      +{modalData.tokenType === 'SWIPE' 
                        ? (modalData.amount / Math.pow(10, 18) >= 1000 
                          ? `${(modalData.amount / Math.pow(10, 18) / 1000).toFixed(2)}K` 
                          : (modalData.amount / Math.pow(10, 18)).toFixed(2))
                        : (modalData.amount / Math.pow(10, 18)).toFixed(6)
                      }
                    </span>
                    <span className="claim-modal-amount-token">{modalData.tokenType}</span>
                  </div>
                )}
                
                <p className="claim-modal-description">Share your win and challenge your friends!</p>
                
                {/* Share button with logos */}
                <button 
                  onClick={shareClaimedPrediction}
                  className="claim-modal-share-btn"
                >
                  <span className="share-btn-text">Share on</span>
                  <div className="share-btn-logos">
                    <img src="/farc.png" alt="Farcaster" className="share-btn-logo" />
                    <img src="/Base_square_blue.png" alt="Base" className="share-btn-logo" />
                  </div>
                </button>
                
                {/* Basescan link */}
                <a 
                  href={modalData.basescanUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="claim-modal-basescan-link"
                >
                  View the transaction
                </a>
                
                {/* Close link */}
                <button 
                  onClick={closeModal}
                  className="claim-modal-close-link"
                >
                  Close
                </button>
              </>
            )}
            
            {/* Error State */}
            {modalType === 'error' && (
              <>
                {/* Error icon */}
                <div className="claim-modal-error-icon">
                  <div className="claim-modal-error-circle">
                    <span>✕</span>
                  </div>
                </div>
                
                <h2 className="claim-modal-title claim-modal-title-error">Error</h2>
                <p className="claim-modal-error-message">{modalData.message}</p>
                
                <button 
                  onClick={closeModal}
                  className="claim-modal-ok-btn"
                >
                  OK
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

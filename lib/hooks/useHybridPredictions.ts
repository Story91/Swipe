import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useRedisPredictions } from './useRedisPredictions';
import { useActiveChain } from '../chains/activeChain';
import { RedisPrediction } from '../types/redis';

export interface HybridPrediction {
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
  
  // USDC Dual Pool fields
  usdcPoolEnabled?: boolean;
  usdcYesTotalAmount?: number;
  usdcNoTotalAmount?: number;
  usdcMarketStats?: {
    yesPercentage: number;
    noPercentage: number;
    totalPool: number;
    participantCount: number;
  };
  
  // Enhanced data from Redis
  includeChart?: boolean;
  selectedCrypto?: string;
  endDate?: string;
  endTime?: string;
  participants: string[];
  marketStats?: {
    yesPercentage: number;
    noPercentage: number;
    timeLeft: number;
    totalPool: number;
  };
  
  // Additional fields needed for compatibility
  createdAt: number;
  approved: boolean;
  status: 'active' | 'resolved' | 'expired' | 'cancelled';
  
  // Computed fields
  totalPool: number;
  yesPercentage: number;
  noPercentage: number;
}

export function useHybridPredictions() {
  const [predictions, setPredictions] = useState<HybridPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true); // Only true until first data load
  const [error, setError] = useState<string | null>(null);
  const [allPredictionsLoaded, setAllPredictionsLoaded] = useState(false); // Track if ALL predictions (not just active) have been loaded
  const fetchAllModeRef = useRef(false); // Track if dashboard requested all predictions (using ref to avoid stale closure)
  const { address } = useAccount();
  // The chain every read below is about. Switching it must clear the list, not
  // leave the other chain's markets up.
  const { chainKey } = useActiveChain();
  
  // Redis predictions hook
  const { 
    predictions: redisPredictions, 
    loading: redisLoading, 
    error: redisError, 
    fetchPredictions: fetchRedisPredictions 
  } = useRedisPredictions();
  
  // Transform Redis predictions to match the expected format
  const transformPredictions = useCallback((redisPreds: RedisPrediction[]) => {
    return redisPreds.map((pred: RedisPrediction) => {
      const totalPool = pred.yesTotalAmount + pred.noTotalAmount;
      
      return {
        // Core data
        id: pred.id,
        question: pred.question,
        description: pred.description,
        category: pred.category,
        imageUrl: pred.imageUrl,
        deadline: pred.deadline,
        creator: pred.creator,
        verified: pred.verified,
        needsApproval: pred.needsApproval,
        resolved: pred.resolved,
        outcome: pred.outcome,
        cancelled: pred.cancelled,
        yesTotalAmount: pred.yesTotalAmount,
        noTotalAmount: pred.noTotalAmount,
        swipeYesTotalAmount: pred.swipeYesTotalAmount || 0,
        swipeNoTotalAmount: pred.swipeNoTotalAmount || 0,
        totalStakes: pred.totalStakes,
        
        // USDC Dual Pool data
        usdcPoolEnabled: pred.usdcPoolEnabled || false,
        usdcYesTotalAmount: pred.usdcYesTotalAmount || 0,
        usdcNoTotalAmount: pred.usdcNoTotalAmount || 0,
        usdcMarketStats: pred.usdcMarketStats,
        
        // Enhanced data
        includeChart: pred.includeChart,
        selectedCrypto: pred.selectedCrypto,
        endDate: pred.endDate,
        endTime: pred.endTime,
        participants: pred.participants || [],
        marketStats: pred.marketStats,
        
        // Additional fields for compatibility
        createdAt: pred.createdAt || (pred.deadline - (24 * 60 * 60)), // Default to 24h before deadline
        approved: !pred.needsApproval,
        status: (pred.resolved ? 'resolved' : 
                pred.cancelled ? 'cancelled' :
                pred.deadline <= Date.now() / 1000 ? 'expired' : 'active') as 'active' | 'resolved' | 'expired' | 'cancelled',
        
        // Computed fields (moved to component to avoid Date.now() causing re-renders)
        totalPool,
        yesPercentage: totalPool > 0 ? (pred.yesTotalAmount / totalPool) * 100 : 0,
        noPercentage: totalPool > 0 ? (pred.noTotalAmount / totalPool) * 100 : 0
      };
    });
  }, []);
  
  // Main fetch function - fetch ACTIVE predictions from Redis (optimized for main page)
  const fetchAllPredictions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await fetchRedisPredictions({ status: 'active' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch predictions';
      setError(errorMessage);
      console.error('❌ Failed to fetch hybrid predictions:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchRedisPredictions]);
  
  // Function to fetch ALL predictions (for admin/user dashboards)
  const fetchAllPredictionsComplete = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAllPredictionsLoaded(false);
    fetchAllModeRef.current = true;

    try {
      await fetchRedisPredictions();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch predictions';
      setError(errorMessage);
      console.error('❌ Failed to fetch all predictions:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchRedisPredictions]);

  // Transform predictions when Redis data changes
  useEffect(() => {
    /**
     * Copy the result through even when it is empty.
     *
     * This was guarded by `redisPredictions.length > 0`, which meant a fetch
     * that legitimately returned nothing left the previous list on screen. On
     * one chain that is a stale render. On two it is a lie about money: Redis
     * is namespaced per chain and Robinhood holds no markets yet, so switching
     * to it fetched zero, skipped this branch, and kept showing Base's markets
     * with Base's pools under a USDG heading. Tapping one would have opened a
     * bet dialog for a market that does not exist on the chain you are on.
     *
     * Empty is an answer. It renders as an empty state, which is the truth.
     */
    const transformed = transformPredictions(redisPredictions);
    setPredictions(transformed);
    setInitialLoading(false);
    if (fetchAllModeRef.current) {
      setAllPredictionsLoaded(true);
    }
  }, [redisPredictions, transformPredictions]);

  /**
   * Drop the old chain's markets the moment the chain changes.
   *
   * Without this the previous chain's list stays up for as long as the new
   * fetch takes, so the first thing a user sees after switching to Robinhood is
   * Base's markets relabelled with Robinhood's collateral symbol.
   */
  const knownChainRef = useRef(chainKey);
  useEffect(() => {
    // Skip the first run. The mount effect below already does the first fetch,
    // and clearing here as well would just flash an empty list on load.
    if (knownChainRef.current === chainKey) return;
    knownChainRef.current = chainKey;

    setPredictions([]);
    setInitialLoading(true);
    setAllPredictionsLoaded(false);
    // Fetch here rather than leaning on the effect keyed to `address`. That one
    // is guarded by a connected wallet, so a visitor with no wallet who
    // switched chains would have had the list cleared and never refilled.
    if (fetchAllModeRef.current) {
      fetchAllPredictionsComplete();
    } else {
      fetchAllPredictions();
    }
  }, [chainKey, fetchAllPredictions, fetchAllPredictionsComplete]);

  // A fetch that legitimately returns nothing still ends the initial load.
  // Without this the effect above never fires when there are no open markets,
  // initialLoading stays true forever, and every consumer is stuck on a
  // spinner instead of rendering its empty state.
  const fetchWasInFlightRef = useRef(false);
  useEffect(() => {
    if (redisLoading) {
      fetchWasInFlightRef.current = true;
    } else if (fetchWasInFlightRef.current) {
      fetchWasInFlightRef.current = false;
      setInitialLoading(false);
      if (fetchAllModeRef.current) {
        setAllPredictionsLoaded(true);
      }
    }
  }, [redisLoading]);
  
  // Fetch predictions on mount with blockchain sync
  useEffect(() => {
    const initializePredictions = async () => {
      fetchAllPredictions();
      
      // Sync ACTIVE predictions stakes from blockchain to Redis in background
      try {
        const response = await fetch('/api/sync/v2/active-stakes', { method: 'POST' });
        if (response.ok) {
          // Refresh from Redis to get updated data - but only if we're not in "fetch all" mode
          setTimeout(() => {
            if (!fetchAllModeRef.current) {
              fetchAllPredictions();
            }
          }, 1000);
        }
      } catch (error) {
        console.error('Failed to sync active predictions stakes from blockchain:', error);
      }
    };
    
    initializePredictions();
  }, []); // Run only once on mount
  
  // Fetch predictions when wallet connects for immediate live data (only once)
  useEffect(() => {
    if (address && !fetchAllModeRef.current) {
      fetchAllPredictions();
    }
  }, [address, fetchAllPredictions]);
  
  // Auto-refresh interval for live data (every 2 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!fetchAllModeRef.current) {
        fetchAllPredictions();
      }
    }, 120000);
    
    return () => clearInterval(interval);
  }, [fetchAllPredictions]);
  
  return {
    predictions,
    // Only show loading spinner on initial load (when we have no data yet)
    // Background refreshes won't show loading spinner
    loading: initialLoading && (loading || redisLoading),
    isRefreshing: loading || redisLoading, // For showing subtle refresh indicator if needed
    error: error || redisError,
    allPredictionsLoaded, // Flag indicating all predictions (not just active) have been loaded
    fetchPredictions: fetchAllPredictions, // Default: active only
    fetchAllPredictions: fetchAllPredictionsComplete, // All predictions
    refresh: fetchAllPredictionsComplete, // Refresh all predictions
    // Manual refresh functions for specific actions
    refreshAfterStake: (predictionId?: string) => {
      // Only refresh active predictions from Redis (fast, no blockchain sync)
      console.log('🔄 Refreshing active predictions after stake...');
      fetchAllPredictions(); // Fetch only active predictions from Redis
      
      // If predictionId provided, sync only that specific prediction from blockchain
      if (predictionId) {
        setTimeout(async () => {
          try {
            console.log(`🔄 Syncing prediction ${predictionId} from blockchain...`);
            const response = await fetch(`/api/sync/prediction/${predictionId}`, { method: 'POST' });
            if (response.ok) {
              console.log(`✅ Prediction ${predictionId} synced from blockchain`);
              // Refresh predictions again after sync
              fetchAllPredictions();
            }
          } catch (error) {
            console.error(`Failed to sync prediction ${predictionId}:`, error);
          }
        }, 2000);
      }
    },
    refreshAfterCreate: () => {
      // Only refresh active predictions after create
      console.log('🔄 Refreshing active predictions after create...');
      fetchAllPredictions(); // Fetch only active predictions from Redis
      // Also refresh again after 1 second to ensure new prediction is in Redis
      setTimeout(() => {
        console.log('🔄 Secondary refresh after create...');
        fetchAllPredictions();
      }, 1000);
    }
  };
}

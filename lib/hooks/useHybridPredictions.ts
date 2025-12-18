import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useRedisPredictions } from './useRedisPredictions';
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
  const { address } = useAccount();
  
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
      // Fetch only ACTIVE predictions from Redis for better performance
      console.log('🔄 Fetching ACTIVE predictions from Redis...');
      await fetchRedisPredictions({ status: 'active' }); // Only active predictions
      console.log('✅ Active predictions fetched from Redis successfully');
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

    try {
      console.log('🔄 Fetching ALL predictions from Redis...');
      await fetchRedisPredictions(); // No filter - get all predictions
      console.log('✅ All predictions fetched from Redis successfully');
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
    if (redisPredictions.length > 0) {
      const transformed = transformPredictions(redisPredictions);
      setPredictions(transformed);
      // Once we have data, initial loading is complete
      setInitialLoading(false);
    }
  }, [redisPredictions, transformPredictions]);
  
  // Fetch predictions on mount with blockchain sync
  useEffect(() => {
    const initializePredictions = async () => {
      // 1. First, fetch from Redis for instant display
      console.log('⚡ Quick fetch from Redis cache...');
      fetchAllPredictions();
      
      // 2. Then, sync ACTIVE predictions stakes from blockchain to Redis in background
      console.log('🔄 Syncing active predictions stakes from blockchain...');
      try {
        const response = await fetch('/api/sync/v2/active-stakes', { method: 'POST' });
        if (response.ok) {
          const result = await response.json();
          console.log(`✅ Synced stakes for ${result.data?.syncedPredictions || 0} active predictions from blockchain`);
          // 3. Refresh from Redis to get updated data
          setTimeout(() => {
            console.log('🔄 Refreshing after stakes sync...');
            fetchAllPredictions();
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
    if (address) {
      console.log('🔄 Wallet connected, fetching active predictions...');
      fetchAllPredictions(); // Fetch only active predictions
    }
  }, [address, fetchAllPredictions]);
  
  // Auto-refresh interval for live data (every 2 minutes)
  // Only refreshes ACTIVE predictions from Redis cache (no blockchain sync)
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('🔄 Auto-refreshing active predictions (2 min interval)...');
      fetchAllPredictions(); // Fetch only active predictions from Redis
    }, 120000); // Refresh every 2 minutes (120 seconds)
    
    return () => clearInterval(interval);
  }, [fetchAllPredictions]);
  
  // Debug log when predictions change
  useEffect(() => {
    console.log('🔍 DEBUG: useHybridPredictions predictions changed:', {
      predictionsLength: predictions.length,
      redisPredictionsLength: redisPredictions.length,
      loading: loading || redisLoading,
      error: error || redisError
    });
  }, [predictions.length, redisPredictions.length, loading, redisLoading, error, redisError]);

  return {
    predictions,
    // Only show loading spinner on initial load (when we have no data yet)
    // Background refreshes won't show loading spinner
    loading: initialLoading && (loading || redisLoading),
    isRefreshing: loading || redisLoading, // For showing subtle refresh indicator if needed
    error: error || redisError,
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

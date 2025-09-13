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
  
  // Computed fields
  totalPool: number;
  yesPercentage: number;
  noPercentage: number;
}

export function useHybridPredictions() {
  const [predictions, setPredictions] = useState<HybridPrediction[]>([]);
  const [loading, setLoading] = useState(false);
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
        
        // Computed fields (moved to component to avoid Date.now() causing re-renders)
        totalPool,
        yesPercentage: totalPool > 0 ? (pred.yesTotalAmount / totalPool) * 100 : 0,
        noPercentage: totalPool > 0 ? (pred.noTotalAmount / totalPool) * 100 : 0
      };
    });
  }, []);
  
  // Main fetch function - only from Redis (no RPC calls)
  const fetchAllPredictions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch only active predictions from Redis (no blockchain sync to avoid RPC limits)
      console.log('🔄 Fetching active predictions from Redis...');
      await fetchRedisPredictions({ status: 'active' });
      console.log('✅ Active predictions fetched from Redis successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch predictions';
      setError(errorMessage);
      console.error('❌ Failed to fetch hybrid predictions:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchRedisPredictions]);
  
  // Transform predictions when Redis data changes
  useEffect(() => {
    if (redisPredictions.length > 0) {
      const transformed = transformPredictions(redisPredictions);
      setPredictions(transformed);
    }
  }, [redisPredictions, transformPredictions]);
  
  // Fetch predictions only on mount and when wallet connects
  useEffect(() => {
    fetchAllPredictions();
  }, []); // Only on mount
  
  // Refresh when user connects wallet (but not on disconnect)
  useEffect(() => {
    if (address) {
      // Small delay to avoid rapid refreshes
      const timeoutId = setTimeout(() => {
        fetchAllPredictions();
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [address]);
  
  return {
    predictions,
    loading: loading || redisLoading,
    error: error || redisError,
    fetchPredictions: fetchAllPredictions,
    refresh: fetchAllPredictions,
    // Manual refresh functions for specific actions
    refreshAfterStake: () => {
      // Refresh after stake is placed
      setTimeout(() => fetchAllPredictions(), 2000);
    },
    refreshAfterCreate: () => {
      // Refresh after new prediction is created
      setTimeout(() => fetchAllPredictions(), 1000);
    }
  };
}

import { useState, useEffect, useCallback } from 'react';
import { RedisPrediction, RedisUserStake } from '../types/redis';

// API endpoints
const API_ENDPOINTS = {
  PREDICTIONS: '/api/predictions',
  STAKES: '/api/stakes',
  MARKET_STATS: '/api/market/stats',
} as const;

// Hook for managing Redis predictions
export function useRedisPredictions() {
  const [predictions, setPredictions] = useState<RedisPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketStats, setMarketStats] = useState<any>(null);

  // Fetch all predictions
  const fetchPredictions = useCallback(async (filters?: {
    category?: string;
    status?: 'active' | 'resolved' | 'pending_approval';
    creator?: string;
  }) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (filters?.category) params.append('category', filters.category);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.creator) params.append('creator', filters.creator);
      
      const url = `${API_ENDPOINTS.PREDICTIONS}${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`📊 Loaded ${result.data.length} predictions from Redis API`);
        console.log(`📊 Prediction IDs:`, result.data.map((p: any) => p.id));
        setPredictions(result.data);
      } else {
        throw new Error(result.error || 'Failed to fetch predictions');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Failed to fetch predictions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new prediction
  const createPrediction = useCallback(async (predictionData: {
    question: string;
    description: string;
    category: string;
    imageUrl?: string;
    includeChart?: boolean;
    selectedCrypto?: string;
    endDate: string;
    endTime: string;
    creator?: string;
    verified?: boolean;
    approved?: boolean;
    needsApproval?: boolean;
  }) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(API_ENDPOINTS.PREDICTIONS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(predictionData),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Add new prediction to the list
        setPredictions(prev => [result.data, ...prev]);
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to create prediction');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Failed to create prediction:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update prediction
  const updatePrediction = useCallback(async (id: string, updates: Partial<RedisPrediction>) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(API_ENDPOINTS.PREDICTIONS, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, updates }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Update prediction in the list
        setPredictions(prev => 
          prev.map(p => p.id === id ? result.data : p)
        );
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to update prediction');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Failed to update prediction:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete prediction
  const deletePrediction = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_ENDPOINTS.PREDICTIONS}?id=${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Remove prediction from the list
        setPredictions(prev => prev.filter(p => p.id !== id));
        return true;
      } else {
        throw new Error(result.error || 'Failed to delete prediction');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Failed to delete prediction:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Place stake
  const placeStake = useCallback(async (stakeData: {
    userId: string;
    predictionId: string;
    amount: number;
    isYes: boolean;
  }) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(API_ENDPOINTS.STAKES, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(stakeData),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Update prediction in the list with new stake data
        setPredictions(prev => 
          prev.map(p => p.id === stakeData.predictionId ? result.data.prediction : p)
        );
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to place stake');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Failed to place stake:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get user stakes for a prediction
  const getUserStakes = useCallback(async (predictionId: string, userId?: string) => {
    try {
      const params = new URLSearchParams({ predictionId });
      if (userId) params.append('userId', userId);
      
      const url = `${API_ENDPOINTS.STAKES}?${params.toString()}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        return result.data as RedisUserStake[];
      } else {
        throw new Error(result.error || 'Failed to fetch stakes');
      }
    } catch (err) {
      console.error('❌ Failed to fetch user stakes:', err);
      return [];
    }
  }, []);

  // Fetch market statistics
  const fetchMarketStats = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.MARKET_STATS);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setMarketStats(result.data);
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to fetch market stats');
      }
    } catch (err) {
      console.error('❌ Failed to fetch market stats:', err);
      return null;
    }
  }, []);

  // Get prediction by ID
  const getPredictionById = useCallback((id: string) => {
    return predictions.find(p => p.id === id);
  }, [predictions]);

  // Get active predictions
  const getActivePredictions = useCallback(() => {
    return predictions.filter(p => !p.resolved && !p.cancelled);
  }, [predictions]);

  // Get predictions by category
  const getPredictionsByCategory = useCallback((category: string) => {
    return predictions.filter(p => p.category === category);
  }, [predictions]);

  // Get predictions by creator
  const getPredictionsByCreator = useCallback((creator: string) => {
    return predictions.filter(p => p.creator === creator);
  }, [predictions]);

  // Refresh all data
  const refreshData = useCallback(async () => {
    await Promise.all([
      fetchPredictions(),
      fetchMarketStats(),
    ]);
  }, [fetchPredictions, fetchMarketStats]);

  // No automatic data fetch - let useHybridPredictions handle it
  // This prevents double loading and conflicts

  return {
    // State
    predictions,
    loading,
    error,
    marketStats,
    
    // Actions
    fetchPredictions,
    createPrediction,
    updatePrediction,
    deletePrediction,
    placeStake,
    getUserStakes,
    fetchMarketStats,
    refreshData,
    
    // Computed values
    getPredictionById,
    getActivePredictions,
    getPredictionsByCategory,
    getPredictionsByCreator,
    
    // Utility
    clearError: () => setError(null),
  };
}

// Hook for managing a single prediction
export function useRedisPrediction(predictionId: string) {
  const [prediction, setPrediction] = useState<RedisPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userStakes, setUserStakes] = useState<RedisUserStake[]>([]);

  // Fetch single prediction
  const fetchPrediction = useCallback(async () => {
    if (!predictionId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_ENDPOINTS.PREDICTIONS}?id=${predictionId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setPrediction(result.data);
      } else {
        throw new Error(result.error || 'Failed to fetch prediction');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Failed to fetch prediction:', err);
    } finally {
      setLoading(false);
    }
  }, [predictionId]);

  // Fetch user stakes for this prediction
  const fetchUserStakes = useCallback(async () => {
    if (!predictionId) return;
    
    try {
      const response = await fetch(`${API_ENDPOINTS.STAKES}?predictionId=${predictionId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setUserStakes(result.data);
      } else {
        throw new Error(result.error || 'Failed to fetch stakes');
      }
    } catch (err) {
      console.error('❌ Failed to fetch user stakes:', err);
    }
  }, [predictionId]);

  // Place stake on this prediction
  const placeStake = useCallback(async (stakeData: {
    userId: string;
    amount: number;
    isYes: boolean;
  }) => {
    if (!predictionId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(API_ENDPOINTS.STAKES, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...stakeData,
          predictionId,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Update local state
        setPrediction(result.data.prediction);
        await fetchUserStakes(); // Refresh stakes
        
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to place stake');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Failed to place stake:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [predictionId, fetchUserStakes]);

  // Initial data fetch
  useEffect(() => {
    if (predictionId) {
      fetchPrediction();
      fetchUserStakes();
    }
  }, [predictionId, fetchPrediction, fetchUserStakes]);

  // No auto-refresh - only manual refresh when needed

  return {
    // State
    prediction,
    loading,
    error,
    userStakes,
    
    // Actions
    fetchPrediction,
    fetchUserStakes,
    placeStake,
    
    // Utility
    clearError: () => setError(null),
  };
}

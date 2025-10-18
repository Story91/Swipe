import { useState, useEffect, useCallback } from 'react';
import { RedisPrediction } from '../types/redis';

// Admin-specific hook for optimized prediction loading
export function useAdminPredictions() {
  const [essentialPredictions, setEssentialPredictions] = useState<RedisPrediction[]>([]);
  const [allPredictions, setAllPredictions] = useState<RedisPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAll, setLoadedAll] = useState(false);

  // Fetch only essential predictions (active + expired) - FAST
  const fetchEssentialPredictions = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🚀 Fetching essential admin predictions (active + expired)...');
      
      // Fetch only active and expired predictions
      const response = await fetch('/api/predictions?admin_essential=true');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Loaded ${result.data.length} essential predictions for admin`);
        setEssentialPredictions(result.data);
        setAllPredictions(result.data); // Start with essential data
        setLoadedAll(false);
      } else {
        throw new Error(result.error || 'Failed to fetch essential predictions');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Failed to fetch essential predictions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch all predictions (resolved, cancelled, etc.) - SLOW but comprehensive
  const fetchAllPredictions = useCallback(async () => {
    if (loadedAll) return; // Already loaded
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('📊 Fetching ALL predictions for admin...');
      
      const response = await fetch('/api/predictions');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Loaded ${result.data.length} total predictions for admin`);
        setAllPredictions(result.data);
        setLoadedAll(true);
      } else {
        throw new Error(result.error || 'Failed to fetch all predictions');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Failed to fetch all predictions:', err);
    } finally {
      setLoading(false);
    }
  }, [loadedAll]);

  // Fetch specific category on demand
  const fetchByCategory = useCallback(async (category: 'active' | 'expired' | 'resolved' | 'cancelled' | 'all') => {
    setLoading(true);
    setError(null);
    
    try {
      console.log(`🔍 Fetching ${category} predictions for admin...`);
      
      let url = '/api/predictions';
      if (category !== 'all') {
        url += `?status=${category}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Loaded ${result.data.length} ${category} predictions for admin`);
        
        if (category === 'all') {
          setAllPredictions(result.data);
          setLoadedAll(true);
        } else {
          // Update specific category in allPredictions
          setAllPredictions(prev => {
            const filtered = prev.filter((p: RedisPrediction) => {
              const currentTime = Date.now() / 1000;
              switch (category) {
                case 'active':
                  return !p.resolved && !p.cancelled && p.deadline > currentTime;
                case 'expired':
                  return !p.resolved && !p.cancelled && p.deadline <= currentTime;
                case 'resolved':
                  return p.resolved;
                case 'cancelled':
                  return p.cancelled;
                default:
                  return true;
              }
            });
            
            // Merge with new data
            const existingIds = new Set(filtered.map((p: RedisPrediction) => p.id));
            const newData = result.data.filter((p: RedisPrediction) => !existingIds.has(p.id));
            return [...filtered, ...newData];
          });
        }
      } else {
        throw new Error(result.error || `Failed to fetch ${category} predictions`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error(`❌ Failed to fetch ${category} predictions:`, err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh data
  const refreshData = useCallback(async () => {
    if (loadedAll) {
      await fetchAllPredictions();
    } else {
      await fetchEssentialPredictions();
    }
  }, [loadedAll, fetchAllPredictions, fetchEssentialPredictions]);

  // Get predictions based on current state
  const getCurrentPredictions = useCallback(() => {
    return loadedAll ? allPredictions : essentialPredictions;
  }, [loadedAll, allPredictions, essentialPredictions]);

  // Get predictions by filter
  const getFilteredPredictions = useCallback((filter: string) => {
    const currentTime = Date.now() / 1000;
    const predictions = getCurrentPredictions();
    
    switch (filter) {
      case 'active':
        return predictions.filter(p => !p.resolved && !p.cancelled && p.deadline > currentTime);
      case 'expired':
        return predictions.filter(p => !p.resolved && !p.cancelled && p.deadline <= currentTime);
      case 'resolved':
        return predictions.filter(p => p.resolved);
      case 'cancelled':
        return predictions.filter(p => p.cancelled);
      case 'needs-resolution':
        return predictions.filter(p => !p.resolved && !p.cancelled && p.deadline <= currentTime);
      case 'v1':
        return predictions.filter(p => typeof p.id === 'string' && p.id.startsWith('pred_v1_'));
      case 'v2':
        return predictions.filter(p => typeof p.id === 'string' && p.id.startsWith('pred_v2_'));
      case 'all':
      default:
        return predictions;
    }
  }, [getCurrentPredictions]);

  // Load essential data on mount
  useEffect(() => {
    fetchEssentialPredictions();
  }, [fetchEssentialPredictions]);

  return {
    // State
    predictions: getCurrentPredictions(),
    essentialPredictions,
    allPredictions,
    loading,
    error,
    loadedAll,
    
    // Actions
    fetchEssentialPredictions,
    fetchAllPredictions,
    fetchByCategory,
    refreshData,
    
    // Computed
    getCurrentPredictions,
    getFilteredPredictions,
    
    // Utility
    clearError: () => setError(null),
  };
}

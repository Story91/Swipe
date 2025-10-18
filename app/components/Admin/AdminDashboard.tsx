"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useReadContract, usePublicClient, useWriteContract } from 'wagmi';
import { CONTRACTS, getV2Contract } from '../../../lib/contract';
import { useAdminPredictions } from '../../../lib/hooks/useAdminPredictions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

interface Prediction {
  id: string | number;
  question: string;
  category: string;
  description?: string;
  yesTotalAmount: number;
  noTotalAmount: number;
  deadline: number;
  resolved: boolean;
  outcome?: boolean;
  cancelled?: boolean;
  participants: number;
  resolutionDeadline?: number;
  needsApproval?: boolean;
  approved?: boolean;
  verified?: boolean;
  creator?: string;
}

interface AdminDashboardProps {
  predictions: Prediction[];
  onResolvePrediction: (predictionId: string | number, outcome: boolean, contractVersion?: 'V1' | 'V2') => void;
  onCancelPrediction: (predictionId: string | number, reason: string, contractVersion?: 'V1' | 'V2') => void;
  onCreatePrediction: () => void;
  onManageApprovers: () => void;
  onWithdrawFees: () => void;
  onPauseContract: () => void;
}

export function AdminDashboard({
  predictions: propPredictions,
  onResolvePrediction,
  onCancelPrediction,
  onCreatePrediction,
  onManageApprovers,
  onWithdrawFees,
  onPauseContract
}: AdminDashboardProps) {

  const publicClient = usePublicClient();
  const { writeContract } = useWriteContract();
  
  // Filter state
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  
  // Use optimized admin predictions hook - loads only essential data by default
  const { 
    predictions: redisPredictions, 
    loading: predictionsLoading, 
    error: predictionsError, 
    refreshData, 
    fetchByCategory,
    loadedAll,
    fetchAllPredictions
  } = useAdminPredictions();
  
  // Filter out duplicate predictions - only keep synced ones (pred_v1_, pred_v2_) and exclude pure Redis ones (pred_*)
  const filteredRedisPredictions = redisPredictions.filter(p => 
    p.id.startsWith('pred_v1_') || p.id.startsWith('pred_v2_')
  );
  
  // Use filtered Redis predictions if available, otherwise fall back to props
  const predictions = filteredRedisPredictions.length > 0 ? filteredRedisPredictions.map(p => ({
    id: p.id, // Keep as string for Redis predictions
    question: p.question,
    category: p.category,
    description: p.description,
    yesTotalAmount: p.yesTotalAmount,
    noTotalAmount: p.noTotalAmount,
    deadline: p.deadline,
    resolved: p.resolved,
    outcome: p.outcome,
    cancelled: p.cancelled,
    participants: p.participants?.length || 0,
    resolutionDeadline: p.resolutionDeadline || (p.deadline + (7 * 24 * 60 * 60)) // Use existing or calculate
  })) : propPredictions;


  // Get contract stats
  const { data: contractStats } = useReadContract({
    address: CONTRACTS.V2.address as `0x${string}`,
    abi: CONTRACTS.V2.abi,
    functionName: 'getContractStats',
  });

  // Get total predictions count
  const { data: totalPredictions } = useReadContract({
    address: CONTRACTS.V2.address as `0x${string}`,
    abi: CONTRACTS.V2.abi,
    functionName: 'nextPredictionId',
  });

  // Use Redis predictions as the primary data source
  // This is much faster than fetching from blockchain and always up-to-date
  const displayPredictions = predictions;

  
  // Helper function to check if prediction needs resolution
  const needsResolution = (prediction: Prediction) => {
    if (prediction.resolved || prediction.cancelled) return false;
    
    // For Redis predictions, check if deadline has passed
    if (typeof prediction.id === 'string') {
      const currentTime = Date.now() / 1000;
      return currentTime > prediction.deadline;
    }
    
    // For on-chain predictions, check resolution deadline
    if (!prediction.resolutionDeadline) return false;
    return Date.now() / 1000 > prediction.resolutionDeadline;
  };
  
  // Enhanced filter logic with lazy loading
  const handleFilterChange = useCallback(async (newFilter: string) => {
    setSelectedFilter(newFilter);
    
    // Load additional data if needed
    if (!loadedAll && (newFilter === 'resolved' || newFilter === 'cancelled' || newFilter === 'all')) {
      console.log(`🔄 Loading ${newFilter} predictions on demand...`);
      await fetchByCategory(newFilter as any);
    }
  }, [loadedAll, fetchByCategory]);

  // Filter predictions based on selected filter
  const getFilteredPredictions = () => {
    const currentTime = Date.now() / 1000;
    
    switch (selectedFilter) {
      case 'active':
        return displayPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline > currentTime);
      case 'expired':
        // Expired = deadline passed but still unresolved (same as needs-resolution)
        return displayPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline <= currentTime);
      case 'resolved':
        return displayPredictions.filter(p => p.resolved);
      case 'cancelled':
        return displayPredictions.filter(p => p.cancelled);
      case 'needs-resolution':
        // Needs resolution = expired and not resolved/cancelled (same as expired)
        return displayPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline <= currentTime);
      case 'v1':
        return displayPredictions.filter(p => typeof p.id === 'string' && p.id.startsWith('pred_v1_'));
      case 'v2':
        return displayPredictions.filter(p => typeof p.id === 'string' && p.id.startsWith('pred_v2_'));
      case 'all':
      default:
        return displayPredictions;
    }
  };

  const filteredPredictions = getFilteredPredictions();
  
  // Keep original categories for stats
  const activePredictions = displayPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline > Date.now() / 1000);
  const expiredPredictions = displayPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline <= Date.now() / 1000);
  const resolvedPredictions = displayPredictions.filter(p => p.resolved);
  const cancelledPredictions = displayPredictions.filter(p => p.cancelled);
  const pendingApprovalPredictions = displayPredictions.filter(p => (p as any).needsApproval && !(p as any).approved);

  // Refresh data function
  const handleRefresh = useCallback(() => {
    refreshData();
  }, [refreshData]);

  // REMOVED: Slow blockchain fetch loop that was causing performance issues
  // Now using Redis data exclusively, which is always up-to-date and much faster
  // Contract stats (contractStats, totalPredictions) are still fetched from blockchain for admin info

  // Calculate real stats (use displayPredictions for total stats, filteredPredictions for current view)
  const stats = {
    totalPredictions: totalPredictions ? Number(totalPredictions) - 1 : displayPredictions.length,
    needsResolution: displayPredictions.filter(p => needsResolution(p)).length,
    collectedFees: contractStats && (contractStats as any)[2] ? Number((contractStats as any)[2]) / 1e18 : 0, // Convert from wei to ETH
    activeApprovers: 5, // TODO: Add function to get active approvers count
    contractBalance: contractStats && (contractStats as any)[5] ? Number((contractStats as any)[5]) / 1e18 : 0,
    platformFee: contractStats && (contractStats as any)[1] ? Number((contractStats as any)[1]) / 100 : 1 // Convert to percentage
  };

  const handleResolve = async (predictionId: string | number, outcome: boolean) => {
    const side = outcome ? 'YES' : 'NO';
    if (confirm(`Are you sure you want to resolve this prediction as ${side}?`)) {
      // Use handleDirectResolve for all cases - it has auto-sync built in
      handleDirectResolve(predictionId, outcome);
    }
  };

  const handleCancel = async (predictionId: string | number) => {
    const reason = prompt('Reason for emergency cancellation:');
    if (reason) {
      // Check if this is a synced on-chain prediction (string ID starting with 'pred_v1_' or 'pred_v2_') or on-chain prediction (number ID)
      if (typeof predictionId === 'string' && (predictionId.startsWith('pred_v1_') || predictionId.startsWith('pred_v2_'))) {
        // This is a synced on-chain prediction - call the contract directly
        const isV1 = predictionId.startsWith('pred_v1_');
        const numericId = parseInt(predictionId.replace('pred_v1_', '').replace('pred_v2_', ''));
        if (!isNaN(numericId)) {
          console.log(`🔄 Cancelling ${isV1 ? 'V1' : 'V2'} on-chain prediction ${predictionId} (numeric ID: ${numericId}): ${reason}`);
          onCancelPrediction(numericId, reason, isV1 ? 'V1' : 'V2');
        } else {
          alert(`❌ Invalid ${isV1 ? 'V1' : 'V2'} prediction ID format`);
          return;
        }
      } else if (typeof predictionId === 'string' && predictionId.startsWith('pred_')) {
        // This is a pure Redis prediction (not synced from blockchain) - handle via API
        try {
          const response = await fetch('/api/predictions/resolve', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              predictionId: predictionId,
              reason: reason
            }),
          });
          
          if (response.ok) {
            console.log(`✅ Redis prediction ${predictionId} cancelled: ${reason}`);
            // Refresh data
            handleRefresh();
          } else {
            const errorData = await response.json();
            console.error('Failed to cancel Redis prediction:', errorData.error);
            alert(`Failed to cancel prediction: ${errorData.error}`);
          }
        } catch (error) {
          console.error('Error cancelling Redis prediction:', error);
          alert('Failed to cancel prediction');
        }
      } else {
        // Handle on-chain prediction (numeric ID)
        onCancelPrediction(predictionId, reason);
      }
    }
  };

  const getStatusBadge = (prediction: Prediction) => {
    if (prediction.cancelled) return <span className="status-badge status-cancelled">🚫 CANCELLED</span>;
    if (prediction.resolved) return <span className="status-badge status-resolved">✅ RESOLVED</span>;
    if (needsResolution(prediction)) return <span className="status-badge status-expired">⏰ EXPIRED</span>;
    return <span className="status-badge status-live">🔴 LIVE</span>;
  };

  const getTimeRemaining = (deadline: number) => {
    const now = Date.now() / 1000;
    const remaining = deadline - now;

    if (remaining <= 0) return "Ended";

    const days = Math.floor(remaining / (24 * 60 * 60));
    const hours = Math.floor((remaining % (24 * 60 * 60)) / (60 * 60));

    if (days > 0) return `${days} days, ${hours} hours`;
    return `${hours} hours`;
  };

  // Format ETH values the same way as TinderCard.tsx
  const formatETH = (value: number) => {
    // Convert from wei to ETH (same as TinderCard.tsx)
    const ethValue = value / 1e18;
    return ethValue > 0 ? ethValue.toFixed(5) : '0.00000';
  };

  // Enhanced resolve function with auto-sync (replaces both handleResolve and handleDirectResolve)
  const handleDirectResolve = async (predictionId: string | number, outcome: boolean) => {
    const side = outcome ? 'YES' : 'NO';
    let numericId: number | null = null;
    let contractVersion: 'V1' | 'V2' = 'V2'; // Default to V2
    
    if (typeof predictionId === 'string' && (predictionId.startsWith('pred_v1_') || predictionId.startsWith('pred_v2_'))) {
      // V1 or V2 synced prediction
      contractVersion = predictionId.startsWith('pred_v1_') ? 'V1' : 'V2';
      numericId = parseInt(predictionId.replace('pred_v1_', '').replace('pred_v2_', ''));
    } else if (typeof predictionId === 'string' && predictionId.startsWith('pred_')) {
      // Pure Redis prediction - use API resolve (which has auto-sync)
      try {
        const response = await fetch('/api/predictions/resolve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            predictionId: predictionId,
            outcome: outcome,
            reason: `Admin resolved as ${side}`
          }),
        });
        
        if (response.ok) {
          console.log(`✅ Redis prediction ${predictionId} resolved as ${side}`);
          // API already handles auto-sync and claims update
          handleRefresh();
        } else {
          const errorData = await response.json();
          console.error('Failed to resolve Redis prediction:', errorData.error);
          alert(`Failed to resolve prediction: ${errorData.error}`);
        }
      } catch (error) {
        console.error('Error resolving Redis prediction:', error);
        alert('Failed to resolve prediction');
      }
      return;
    } else if (typeof predictionId === 'number') {
      numericId = predictionId;
      // For numeric IDs, we can't determine version, so default to V2
    }
    
    if (!numericId || isNaN(numericId)) {
      alert('❌ Invalid prediction ID for contract transaction');
      return;
    }

    const contract = contractVersion === 'V1' ? CONTRACTS.V1 : CONTRACTS.V2;

    try {
      writeContract({
        address: contract.address as `0x${string}`,
        abi: contract.abi,
        functionName: 'resolvePrediction',
        args: [BigInt(numericId), outcome],
      }, {
        onSuccess: async (tx) => {
          console.log(`✅ Prediction ${numericId} resolved successfully on ${contractVersion}:`, tx);
          alert(`✅ Prediction resolved as ${side}!\nTransaction: ${tx}\n\nAuto-syncing with Redis...`);
          
          // Auto-sync single prediction (like TinderCard stake)
          try {
            console.log('🔄 Auto-syncing single prediction after resolve...');
            const syncResponse = await fetch('/api/blockchain/events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventType: 'prediction_resolved',
                predictionId: numericId,
                contractVersion: contractVersion
              })
            });
            
            if (syncResponse.ok) {
              console.log('✅ Single prediction sync successful after resolve');
              
              // Also sync claims to update user stakes
              console.log('🔄 Auto-syncing claims after resolve...');
              const claimsSyncResponse = await fetch('/api/sync/v2/claims');
              if (claimsSyncResponse.ok) {
                console.log('✅ Claims sync successful after resolve');
              } else {
                console.warn('⚠️ Claims sync failed after resolve');
              }
              
              alert(`✅ Auto-sync complete!\nPrediction ${numericId} resolved as ${side}\nRedis and claims updated. Refreshing data...`);
              // Refresh data after successful sync
              setTimeout(() => {
                handleRefresh();
              }, 2000);
            } else {
              console.warn('⚠️ Single prediction sync failed after resolve');
              alert(`⚠️ WARNING: Transaction successful but sync failed!\nPrediction ${numericId} resolved as ${side}\nTransaction: ${tx}\n\nPlease manually refresh the page.`);
            }
          } catch (syncError) {
            console.error('❌ Failed to auto-sync single prediction after resolve:', syncError);
            alert(`⚠️ WARNING: Transaction successful but sync failed!\nPrediction ${numericId} resolved as ${side}\nTransaction: ${tx}\n\nPlease manually refresh the page.`);
          }
        },
        onError: (error) => {
          console.error('❌ Resolve failed:', error);
          alert(`❌ Resolve failed!\nPrediction ${numericId}\nError: ${error.message || error}\n\nPlease check your wallet and try again.`);
        }
      });
    } catch (error) {
      console.error('❌ Resolve error:', error);
      alert(`❌ Resolve error!\nPrediction ${numericId}\nError: ${error}`);
    }
  };

  const predictionsNeedingResolution = filteredPredictions.filter(p => needsResolution(p));
  const livePredictions = filteredPredictions.filter(p => !p.resolved && !p.cancelled && !needsResolution(p));

  // Show loading only for Redis predictions, not blockchain data
  if (predictionsLoading) {
    return (
      <div className="admin-dashboard">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>Loading predictions from Redis...</div>
        </div>
      </div>
    );
  }

  if (predictionsError) {
    return (
      <div className="admin-dashboard">
        <div style={{ textAlign: 'center', padding: '40px', color: 'red' }}>
          <div>❌ Failed to load predictions from Redis</div>
          <div style={{ fontSize: '14px', marginTop: '10px' }}>{predictionsError}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* Header with Filter */}
      <div className="admin-header" style={{ marginBottom: '20px' }}>
        {/* Filter Section - Clean */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          marginBottom: '20px'
        }}>
          <div className="filter-section" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label htmlFor="prediction-filter" style={{ 
              fontSize: '14px', 
              fontWeight: '600', 
              whiteSpace: 'nowrap',
              color: 'rgba(0, 0, 0, 0.8)'
            }}>
              📊 Filter:
            </label>
            <Select value={selectedFilter} onValueChange={handleFilterChange}>
              <SelectTrigger style={{ 
                width: '200px', 
                fontSize: '13px',
                background: 'rgba(255, 255, 255, 0.9)',
                border: '1px solid rgba(0, 0, 0, 0.1)',
                borderRadius: '8px'
              }}>
                <SelectValue placeholder="Select filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Predictions</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="needs-resolution">Needs Resolution</SelectItem>
                <SelectItem value="v1">V1 Contract</SelectItem>
                <SelectItem value="v2">V2 Contract</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {/* Sync Controls - Ultra Compact Grid Layout */}
        <div className="sync-controls-grid" style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '6px',
          marginBottom: '20px',
          maxWidth: '100%'
        }}>
          <button 
            onClick={handleRefresh}
            className="refresh-btn ultra-compact-btn"
            style={{
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '6px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              minHeight: '28px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px'
            }}
          >
            🔄 Refresh
          </button>
          
          {!loadedAll && (
            <button 
              onClick={async () => {
                console.log('📊 Loading all predictions for admin...');
                await fetchAllPredictions();
              }}
              className="load-all-btn ultra-compact-btn"
              style={{
                background: '#FF9800',
                color: 'white',
                border: 'none',
                padding: '6px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '9px',
                fontWeight: '500',
                whiteSpace: 'nowrap',
                minHeight: '28px',
                touchAction: 'manipulation',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px'
              }}
            >
              📊 Load All
            </button>
          )}
          
          <button 
            onClick={async () => {
              if (confirm('🚀 V2 FULL SYNC\n\nThis will sync ALL V2 predictions and stakes from blockchain to Redis.\nThis may take a few minutes.\n\nContinue?')) {
                try {
                  alert('🚀 Starting V2 full sync... This may take a few minutes.');
                  const response = await fetch('/api/sync/v2');
                  if (response.ok) {
                    const result = await response.json();
                    alert(`✅ V2 FULL SYNC COMPLETE!\n\nSynced: ${result.data.syncedPredictions} predictions\nStakes: ${result.data.syncedStakes}\nErrors: ${result.data.errorsCount}\n\nRefreshing data...`);
                    handleRefresh();
                  } else {
                    alert('❌ V2 full sync failed. Check console for details.');
                  }
                } catch (error) {
                  console.error('V2 full sync error:', error);
                  alert('❌ V2 full sync failed. Check console for details.');
                }
              }
            }}
            className="sync-btn ultra-compact-btn"
            style={{
              background: '#2196F3',
              color: 'white',
              border: 'none',
              padding: '6px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              minHeight: '28px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px'
            }}
          >
            🚀 V2 Full
          </button>
          
          <button 
            onClick={async () => {
              if (confirm('⚡ V2 INCREMENTAL SYNC\n\nThis will sync only NEW V2 predictions (newer than last in Redis).\nMuch faster than full sync!\n\nContinue?')) {
                try {
                  alert('⚡ Starting V2 incremental sync...');
                  const response = await fetch('/api/sync/v2/incremental');
                  if (response.ok) {
                    const result = await response.json();
                    alert(`✅ V2 INCREMENTAL SYNC COMPLETE!\n\nSynced: ${result.data.syncedPredictions} new predictions\nStakes: ${result.data.syncedStakes}\nErrors: ${result.data.errorsCount}\n\nFound ${result.data.newPredictionsFound} new predictions\nRefreshing data...`);
                    handleRefresh();
                  } else {
                    alert('❌ V2 incremental sync failed. Check console for details.');
                  }
                } catch (error) {
                  console.error('V2 incremental sync error:', error);
                  alert('❌ V2 incremental sync failed. Check console for details.');
                }
              }
            }}
            className="sync-btn ultra-compact-btn"
            style={{
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '6px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              minHeight: '28px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px'
            }}
          >
            ⚡ V2 Incremental
          </button>
          
          <button 
            onClick={async () => {
              if (confirm('⚡ V2 ACTIVE SYNC\n\nThis will sync only ACTIVE V2 predictions from blockchain to Redis.\nMuch faster!\n\nContinue?')) {
                try {
                  alert('⚡ Starting V2 active predictions sync...');
                  const response = await fetch('/api/sync/v2/active');
                  if (response.ok) {
                    const result = await response.json();
                    alert(`✅ V2 ACTIVE SYNC COMPLETE!\n\nSynced: ${result.data.activePredictions} active predictions\nStakes: ${result.data.syncedStakes}\nErrors: ${result.data.errorsCount}\n\nRefreshing data...`);
                    handleRefresh();
                  } else {
                    alert('❌ V2 active sync failed. Check console for details.');
                  }
                } catch (error) {
                  console.error('V2 active sync error:', error);
                  alert('❌ V2 active sync failed. Check console for details.');
                }
              }
            }}
            className="sync-btn ultra-compact-btn"
            style={{
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '6px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              minHeight: '28px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px'
            }}
          >
            ⚡ V2 Active
          </button>
          
          <button 
            onClick={async () => {
              if (confirm('💰 V2 RESOLVED SYNC\n\nThis will sync only RESOLVED V2 predictions and their stakes.\nPerfect for ready-to-claim data!\n\nContinue?')) {
                try {
                  alert('💰 Starting V2 resolved predictions sync...');
                  const response = await fetch('/api/sync/v2/resolved');
                  if (response.ok) {
                    const result = await response.json();
                    alert(`✅ V2 RESOLVED SYNC COMPLETE!\n\nSynced: ${result.data.resolvedPredictions} resolved predictions\nStakes: ${result.data.syncedStakes}\nErrors: ${result.data.errorsCount}\n\nRefreshing data...`);
                    handleRefresh();
                  } else {
                    alert('❌ V2 resolved sync failed. Check console for details.');
                  }
                } catch (error) {
                  console.error('V2 resolved sync error:', error);
                  alert('❌ V2 resolved sync failed. Check console for details.');
                }
              }
            }}
            className="sync-btn ultra-compact-btn"
            style={{
              background: '#FF9800',
              color: 'white',
              border: 'none',
              padding: '6px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              minHeight: '28px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px'
            }}
          >
            💰 V2 Resolved
          </button>
          
          <button 
            onClick={async () => {
              if (confirm('🔍 V2 CLAIMS SYNC\n\nThis will sync claim status for all resolved V2 predictions.\nUpdates ready-to-claim status!\n\nContinue?')) {
                try {
                  alert('🔍 Starting V2 claims sync...');
                  const response = await fetch('/api/sync/v2/claims');
                  if (response.ok) {
                    const result = await response.json();
                    alert(`✅ V2 CLAIMS SYNC COMPLETE!\n\nSynced: ${result.data.syncedClaims} claim statuses\nErrors: ${result.data.errorsCount}\n\nRefreshing data...`);
                    handleRefresh();
                  } else {
                    alert('❌ V2 claims sync failed. Check console for details.');
                  }
                } catch (error) {
                  console.error('V2 claims sync error:', error);
                  alert('❌ V2 claims sync failed. Check console for details.');
                }
              }
            }}
            className="sync-btn ultra-compact-btn"
            style={{
              background: '#9C27B0',
              color: 'white',
              border: 'none',
              padding: '6px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              minHeight: '28px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px'
            }}
          >
            🔍 V2 Claims
          </button>
          
          <button 
            onClick={async () => {
              const userId = prompt('👤 USER BLOCKCHAIN SYNC\n\nEnter user wallet address to sync their complete transaction history from blockchain to Redis.\n\nThis will find ALL missing stakes and transactions!\n\nWallet address (0x...):');
              if (userId && userId.startsWith('0x')) {
                try {
                  alert('🔍 Starting blockchain sync for user...\nThis may take a few minutes as we scan all predictions.');
                  const response = await fetch('/api/admin/sync-user-blockchain', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: userId.toLowerCase() })
                  });
                  
                  if (response.ok) {
                    const result = await response.json();
                    const data = result.data;
                    
                    // Show detailed results
                    let message = `✅ BLOCKCHAIN SYNC COMPLETE FOR USER!\n\n`;
                    message += `📊 Total stakes in blockchain: ${data.blockchainStakes}\n`;
                    message += `📦 Total stakes in Redis: ${data.redisStakes}\n`;
                    message += `❌ Missing/outdated stakes: ${data.missingStakes}\n`;
                    message += `✅ Synced stakes: ${data.syncedStakes}\n\n`;
                    
                    if (data.missingStakesList && data.missingStakesList.length > 0) {
                      message += `📋 Missing Stakes Details:\n\n`;
                      data.missingStakesList.slice(0, 5).forEach((stake: any) => {
                        message += `• Prediction ${stake.predictionNumericId}: ${stake.question.substring(0, 50)}...\n`;
                        if (stake.ETH.yesAmount > 0 || stake.ETH.noAmount > 0) {
                          message += `  ETH: ${stake.ETH.yesAmount} YES, ${stake.ETH.noAmount} NO, claimed: ${stake.ETH.claimed}\n`;
                        }
                        if (stake.SWIPE.yesAmount > 0 || stake.SWIPE.noAmount > 0) {
                          message += `  SWIPE: ${stake.SWIPE.yesAmount} YES, ${stake.SWIPE.noAmount} NO, claimed: ${stake.SWIPE.claimed}\n`;
                        }
                      });
                      
                      if (data.missingStakesList.length > 5) {
                        message += `\n... and ${data.missingStakesList.length - 5} more\n`;
                      }
                    }
                    
                    alert(message + '\nData synced successfully! User can now see their complete history.');
                    console.log('📊 Full sync results:', result);
                  } else {
                    const errorData = await response.json();
                    alert(`❌ Blockchain sync failed: ${errorData.error}\n\nCheck console for details.`);
                  }
                } catch (error) {
                  console.error('User blockchain sync error:', error);
                  alert('❌ Blockchain sync failed. Check console for details.');
                }
              } else if (userId) {
                alert('❌ Invalid wallet address. Must start with 0x');
              }
            }}
            className="sync-btn ultra-compact-btn"
            style={{
              background: '#E91E63',
              color: 'white',
              border: 'none',
              padding: '6px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              minHeight: '28px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px'
            }}
          >
            👤 User Sync
          </button>
          
          <button 
            onClick={async () => {
              if (confirm('🌍 ALL USERS TRANSACTIONS SYNC\n\nThis will scan ALL predictions and sync transaction history for ALL users from blockchain to Redis.\n\nThis may take 10-30 minutes!\n\nContinue?')) {
                try {
                  alert('🌍 Starting all users transactions sync...\nThis will take 10-30 minutes. Please wait...');
                  const response = await fetch('/api/admin/sync-all-user-transactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                  });
                  
                  if (response.ok) {
                    const result = await response.json();
                    const data = result.data;
                    
                    let message = `✅ ALL USERS TRANSACTIONS SYNC COMPLETE!\n\n`;
                    message += `📊 Predictions scanned: ${data.totalPredictionsScanned}\n`;
                    message += `👥 Unique users found: ${data.totalUniqueUsers}\n`;
                    message += `💰 Total stakes found: ${data.totalStakesFound}\n`;
                    message += `💾 New transactions saved: ${data.totalTransactionsSaved}\n`;
                    message += `✅ Users processed: ${data.usersProcessed}\n\n`;
                    message += `All users can now see their complete transaction history!`;
                    
                    alert(message);
                    console.log('📊 All users sync results:', result);
                  } else {
                    const errorData = await response.json();
                    alert(`❌ All users sync failed: ${errorData.error}\n\nCheck console for details.`);
                  }
                } catch (error) {
                  console.error('All users sync error:', error);
                  alert('❌ All users sync failed. Check console for details.');
                }
              }
            }}
            className="sync-btn ultra-compact-btn"
            style={{
              background: '#FF5722',
              color: 'white',
              border: 'none',
              padding: '6px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              minHeight: '28px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px'
            }}
          >
            🌍 All Users
          </button>
          
          <button 
            onClick={async () => {
              try {
                const response = await fetch('/api/debug/active-swipers');
                
                if (response.ok) {
                  const result = await response.json();
                  const data = result.data;
                  
                  let message = `📊 ACTIVE SWIPERS STATISTICS\n\n`;
                  message += `🔴 Active predictions: ${data.activePredictions}\n`;
                  message += `👥 Total participants (with duplicates): ${data.totalParticipants}\n`;
                  message += `👤 Unique active users: ${data.uniqueActiveUsers}\n`;
                  message += `📈 Avg participants per prediction: ${data.averageParticipantsPerPrediction}\n\n`;
                  
                  if (data.topPredictions && data.topPredictions.length > 0) {
                    message += `🏆 TOP ACTIVE PREDICTIONS:\n\n`;
                    data.topPredictions.slice(0, 5).forEach((pred: any, i: number) => {
                      message += `${i + 1}. ${pred.question}\n`;
                      message += `   👥 ${pred.participants} participants\n`;
                      message += `   💰 ${pred.yesPool.toFixed(4)} ETH YES / ${pred.noPool.toFixed(4)} ETH NO\n`;
                      if (pred.swipeYesPool > 0 || pred.swipeNoPool > 0) {
                        message += `   🪙 ${pred.swipeYesPool.toFixed(0)} SWIPE YES / ${pred.swipeNoPool.toFixed(0)} SWIPE NO\n`;
                      }
                      message += `\n`;
                    });
                  }
                  
                  alert(message);
                  console.log('📊 Full active swipers data:', result);
                } else {
                  const errorData = await response.json();
                  alert(`❌ Failed to get active swipers: ${errorData.error}`);
                }
              } catch (error) {
                console.error('Active swipers check error:', error);
                alert('❌ Failed to check active swipers. Check console for details.');
              }
            }}
            className="sync-btn ultra-compact-btn"
            style={{
              background: '#00BCD4',
              color: 'white',
              border: 'none',
              padding: '6px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              minHeight: '28px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px'
            }}
          >
            📊 Active Swipers
          </button>
          
          <button 
            onClick={async () => {
              try {
                const response = await fetch('/api/debug/predictions-breakdown');
                
                if (response.ok) {
                  const result = await response.json();
                  const data = result.data;
                  
                  let message = `📊 PREDICTIONS BREAKDOWN\n\n`;
                  message += `Total: ${data.total} predictions\n\n`;
                  message += `🔴 Active: ${data.counts.active} (${data.percentages.active})\n`;
                  message += `✅ Resolved: ${data.counts.resolved} (${data.percentages.resolved})\n`;
                  message += `⏰ Expired: ${data.counts.expired} (${data.percentages.expired})\n`;
                  message += `🚫 Cancelled: ${data.counts.cancelled} (${data.percentages.cancelled})\n`;
                  message += `⏳ Needs Approval: ${data.counts.needsApproval} (${data.percentages.needsApproval})\n\n`;
                  
                  if (data.breakdown.active && data.breakdown.active.length > 0) {
                    message += `🔴 ACTIVE PREDICTIONS (${data.breakdown.active.length}):\n`;
                    data.breakdown.active.forEach((pred: any, i: number) => {
                      message += `${i + 1}. ${pred.question}\n`;
                      message += `   👥 ${pred.participants} | 💰 ${pred.ethPool.toFixed(4)} ETH\n`;
                    });
                    message += `\n`;
                  }
                  
                  if (data.breakdown.expired && data.breakdown.expired.length > 0) {
                    message += `⏰ EXPIRED (need resolution): ${data.breakdown.expired.length}\n\n`;
                  }
                  
                  message += `💡 TIP: Resolve expired predictions to keep platform active!`;
                  
                  alert(message);
                  console.log('📊 Full breakdown data:', result);
                } else {
                  const errorData = await response.json();
                  alert(`❌ Failed to get breakdown: ${errorData.error}`);
                }
              } catch (error) {
                console.error('Predictions breakdown error:', error);
                alert('❌ Failed to get predictions breakdown. Check console for details.');
              }
            }}
            className="sync-btn ultra-compact-btn"
            style={{
              background: '#673AB7',
              color: 'white',
              border: 'none',
              padding: '6px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              minHeight: '28px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px'
            }}
          >
            📈 Breakdown
          </button>
          
          
        </div>
      </div>


      {/* Stats Table - Vertical Layout for Miniapp */}
      <div className="stats-table" style={{ 
        background: 'rgba(255, 255, 255, 0.15)', 
        backdropFilter: 'blur(10px)',
        borderRadius: '12px', 
        padding: '12px',
        marginBottom: '20px',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        maxWidth: '100%'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: '600', color: 'rgba(0, 0, 0, 0.8)', fontSize: '12px' }}>Total Predictions:</span>
            <span style={{ fontFamily: 'monospace', color: '#2563eb', fontSize: '14px', fontWeight: '700' }}>{stats.totalPredictions}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: '600', color: 'rgba(0, 0, 0, 0.8)', fontSize: '12px' }}>Needs Resolution:</span>
            <span style={{ fontFamily: 'monospace', color: '#dc2626', fontSize: '14px', fontWeight: '700' }}>{stats.needsResolution}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: '600', color: 'rgba(0, 0, 0, 0.8)', fontSize: '12px' }}>Platform Fee:</span>
            <span style={{ fontFamily: 'monospace', color: '#059669', fontSize: '14px', fontWeight: '700' }}>{stats.platformFee}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: '600', color: 'rgba(0, 0, 0, 0.8)', fontSize: '12px' }}>ETH Collected Fees:</span>
            <span style={{ fontFamily: 'monospace', color: '#059669', fontSize: '14px', fontWeight: '700' }}>{stats.collectedFees.toFixed(4)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: '600', color: 'rgba(0, 0, 0, 0.8)', fontSize: '12px' }}>ETH Contract Balance:</span>
            <span style={{ fontFamily: 'monospace', color: '#059669', fontSize: '14px', fontWeight: '700' }}>{stats.contractBalance.toFixed(4)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: '600', color: 'rgba(0, 0, 0, 0.8)', fontSize: '12px' }}>Active Approvers:</span>
            <span style={{ fontFamily: 'monospace', color: '#2563eb', fontSize: '14px', fontWeight: '700' }}>{stats.activeApprovers}</span>
          </div>
        </div>
      </div>


      {/* Predictions Grid */}
      <div className="predictions-grid">
        {/* Needs Resolution - REMOVED (duplicated with Expired Predictions) */}
        {false && predictionsNeedingResolution.map((prediction) => {
          const totalPool = prediction.yesTotalAmount + prediction.noTotalAmount;
          const yesPercentage = totalPool > 0 ? (prediction.yesTotalAmount / totalPool) * 100 : 0;

          return (
            <div key={prediction.id} className="prediction-card">
              <div className="card-header">
                <span className="category-badge">{prediction.category}</span>
                {getStatusBadge(prediction)}
              </div>
              <div className="prediction-question">{prediction.question}</div>

              <div className="prediction-stats">
                <div className="stat-item">
                  <div className="stat-value">{totalPool.toFixed(1)} ETH</div>
                  <div>Total Pool</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{prediction.participants}</div>
                  <div>Participants</div>
                </div>
              </div>

              <div className="odds-bar">
                <div className="odds-visual">
                  <div className="yes-bar" style={{ width: `${yesPercentage}%` }}></div>
                  <div className="no-bar" style={{ width: `${100 - yesPercentage}%` }}></div>
                </div>
                <div className="odds-labels">
                  <span>YES {yesPercentage.toFixed(1)}% ({prediction.yesTotalAmount.toFixed(1)} ETH)</span>
                  <span>NO {(100 - yesPercentage).toFixed(1)}% ({prediction.noTotalAmount.toFixed(1)} ETH)</span>
                </div>
              </div>

              <div className="resolution-notice">
                <strong>⚠️ Deadline Passed</strong><br />
                <small>Resolution needed within {getTimeRemaining(prediction.resolutionDeadline || prediction.deadline + 7 * 24 * 60 * 60)}</small>
              </div>

              <div className="action-buttons">
                <button
                  className="btn btn-yes"
                  onClick={() => handleResolve(prediction.id, true)}
                >
                  ✅ Resolve YES
                </button>
                <button
                  className="btn btn-no"
                  onClick={() => handleResolve(prediction.id, false)}
                >
                  ❌ Resolve NO
                </button>
                <button
                  className="btn btn-cancel"
                  onClick={() => handleCancel(prediction.id)}
                >
                  🚫 Cancel & Refund
                </button>
              </div>

            </div>
          );
        })}

        {/* Live Predictions */}
        {livePredictions.map((prediction) => {
          const totalPool = prediction.yesTotalAmount + prediction.noTotalAmount;
          const yesPercentage = totalPool > 0 ? (prediction.yesTotalAmount / totalPool) * 100 : 0;

          return (
            <div key={prediction.id} className="prediction-card" style={{
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
              maxWidth: '100%',
              overflow: 'hidden'
            }}>
              <div className="card-header" style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '12px',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <span className="category-badge" style={{
                  background: '#e3f2fd',
                  color: '#1976d2',
                  padding: '4px 8px',
                  borderRadius: '12px',
                  fontSize: '10px',
                  fontWeight: '600',
                  textTransform: 'uppercase'
                }}>{prediction.category}</span>
                {getStatusBadge(prediction)}
              </div>
              
              <div className="prediction-question" style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#333',
                marginBottom: '12px',
                lineHeight: '1.4',
                wordWrap: 'break-word'
              }}>{prediction.question}</div>

              <div className="prediction-stats" style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '12px'
              }}>
                <div className="stat-item" style={{ textAlign: 'center' }}>
                  <div className="stat-value" style={{
                    fontSize: '16px',
                    fontWeight: '700',
                    color: '#2563eb',
                    marginBottom: '2px'
                  }}>{formatETH(totalPool)} ETH</div>
                  <div style={{ fontSize: '10px', color: '#666', fontWeight: '500' }}>Total Pool</div>
                </div>
                <div className="stat-item" style={{ textAlign: 'center' }}>
                  <div className="stat-value" style={{
                    fontSize: '16px',
                    fontWeight: '700',
                    color: '#059669',
                    marginBottom: '2px'
                  }}>{prediction.participants}</div>
                  <div style={{ fontSize: '10px', color: '#666', fontWeight: '500' }}>Participants</div>
                </div>
              </div>

              <div className="odds-bar" style={{ marginBottom: '12px' }}>
                <div className="odds-visual" style={{
                  height: '8px',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  display: 'flex',
                  marginBottom: '6px'
                }}>
                  <div className="yes-bar" style={{ 
                    width: `${yesPercentage}%`,
                    background: 'linear-gradient(90deg, #4caf50, #66bb6a)',
                    height: '100%'
                  }}></div>
                  <div className="no-bar" style={{ 
                    width: `${100 - yesPercentage}%`,
                    background: 'linear-gradient(90deg, #f44336, #ef5350)',
                    height: '100%'
                  }}></div>
                </div>
                <div className="odds-labels" style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  <span style={{ color: '#4caf50' }}>YES {yesPercentage.toFixed(1)}%</span>
                  <span style={{ color: '#f44336' }}>NO {(100 - yesPercentage).toFixed(1)}%</span>
                </div>
              </div>

              <div className="time-remaining" style={{
                textAlign: 'center',
                fontSize: '12px',
                color: '#ff9800',
                fontWeight: '600',
                marginBottom: '12px',
                padding: '6px',
                background: 'rgba(255, 152, 0, 0.1)',
                borderRadius: '6px'
              }}>⏰ {getTimeRemaining(prediction.deadline)}</div>

              <div className="action-buttons" style={{
                display: 'flex',
                justifyContent: 'center'
              }}>
                <button
                  className="btn btn-cancel"
                  onClick={() => handleCancel(prediction.id)}
                  style={{
                    background: '#f44336',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '600',
                    transition: 'all 0.2s ease'
                  }}
                >
                  🚫 Emergency Cancel
                </button>
              </div>
            </div>
          );
        })}

        {/* Resolved Predictions */}
        {filteredPredictions.filter(p => p.resolved).map((prediction) => {
          const totalPool = prediction.yesTotalAmount + prediction.noTotalAmount;
          const yesPercentage = totalPool > 0 ? (prediction.yesTotalAmount / totalPool) * 100 : 0;

          return (
            <div key={prediction.id} className="prediction-card" style={{
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
              maxWidth: '100%',
              overflow: 'hidden'
            }}>
              <div className="card-header" style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '12px',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <span className="category-badge" style={{
                  background: '#e3f2fd',
                  color: '#1976d2',
                  padding: '4px 8px',
                  borderRadius: '12px',
                  fontSize: '10px',
                  fontWeight: '600',
                  textTransform: 'uppercase'
                }}>{prediction.category}</span>
                {getStatusBadge(prediction)}
              </div>
              
              <div className="prediction-question" style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#333',
                marginBottom: '12px',
                lineHeight: '1.4',
                wordWrap: 'break-word'
              }}>{prediction.question}</div>

              <div className="prediction-stats" style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '12px'
              }}>
                <div className="stat-item" style={{ textAlign: 'center' }}>
                  <div className="stat-value" style={{
                    fontSize: '16px',
                    fontWeight: '700',
                    color: '#2563eb',
                    marginBottom: '2px'
                  }}>{formatETH(totalPool)} ETH</div>
                  <div style={{ fontSize: '10px', color: '#666', fontWeight: '500' }}>Total Pool</div>
                </div>
                <div className="stat-item" style={{ textAlign: 'center' }}>
                  <div className="stat-value" style={{
                    fontSize: '16px',
                    fontWeight: '700',
                    color: '#059669',
                    marginBottom: '2px'
                  }}>{prediction.participants}</div>
                  <div style={{ fontSize: '10px', color: '#666', fontWeight: '500' }}>Participants</div>
                </div>
              </div>

              <div className="odds-bar" style={{ marginBottom: '12px' }}>
                <div className="odds-visual" style={{
                  height: '8px',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  display: 'flex',
                  marginBottom: '6px'
                }}>
                  <div className="yes-bar" style={{ 
                    width: `${yesPercentage}%`,
                    background: 'linear-gradient(90deg, #4caf50, #66bb6a)',
                    height: '100%'
                  }}></div>
                  <div className="no-bar" style={{ 
                    width: `${100 - yesPercentage}%`,
                    background: 'linear-gradient(90deg, #f44336, #ef5350)',
                    height: '100%'
                  }}></div>
                </div>
                <div className="odds-labels" style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  <span style={{ color: '#4caf50' }}>YES {yesPercentage.toFixed(1)}% {prediction.outcome === true ? '✅ WON' : '❌ LOST'}</span>
                  <span style={{ color: '#f44336' }}>NO {(100 - yesPercentage).toFixed(1)}% {prediction.outcome === false ? '✅ WON' : '❌ LOST'}</span>
                </div>
              </div>

              <div className="resolution-success" style={{
                textAlign: 'center',
                fontSize: '12px',
                color: '#4caf50',
                fontWeight: '600',
                marginBottom: '12px',
                padding: '8px',
                background: 'rgba(76, 175, 80, 0.1)',
                borderRadius: '6px'
              }}>
                <strong>✅ Resolved as {prediction.outcome ? 'YES' : 'NO'}</strong><br />
                <small style={{ fontSize: '10px', color: '#666' }}>Platform Fee: {formatETH(totalPool * 0.01)} ETH (1% of {formatETH(prediction.outcome ? prediction.noTotalAmount : prediction.yesTotalAmount)} ETH profit)</small><br />
                <small style={{ fontSize: '10px', color: '#666' }}>Participants can now claim their rewards</small>
              </div>

              <div className="action-buttons" style={{
                display: 'flex',
                justifyContent: 'center'
              }}>
                <button className="btn" style={{ 
                  background: '#e0e0e0', 
                  color: '#666',
                  cursor: 'not-allowed',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  Resolved ✅
                </button>
              </div>
            </div>
          );
        })}

        {/* Cancelled Predictions */}
        {filteredPredictions.filter(p => p.cancelled).map((prediction) => {
          const totalPool = prediction.yesTotalAmount + prediction.noTotalAmount;
          const yesPercentage = totalPool > 0 ? (prediction.yesTotalAmount / totalPool) * 100 : 0;

          return (
            <div key={prediction.id} className="prediction-card" style={{
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
              maxWidth: '100%',
              overflow: 'hidden'
            }}>
              <div className="card-header" style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '12px',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <span className="category-badge" style={{
                  background: '#e3f2fd',
                  color: '#1976d2',
                  padding: '4px 8px',
                  borderRadius: '12px',
                  fontSize: '10px',
                  fontWeight: '600',
                  textTransform: 'uppercase'
                }}>{prediction.category}</span>
                {getStatusBadge(prediction)}
              </div>
              
              <div className="prediction-question" style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#333',
                marginBottom: '12px',
                lineHeight: '1.4',
                wordWrap: 'break-word'
              }}>{prediction.question}</div>

              <div className="prediction-stats" style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '12px'
              }}>
                <div className="stat-item" style={{ textAlign: 'center' }}>
                  <div className="stat-value" style={{
                    fontSize: '16px',
                    fontWeight: '700',
                    color: '#2563eb',
                    marginBottom: '2px'
                  }}>{formatETH(totalPool)} ETH</div>
                  <div style={{ fontSize: '10px', color: '#666', fontWeight: '500' }}>Total Pool</div>
                </div>
                <div className="stat-item" style={{ textAlign: 'center' }}>
                  <div className="stat-value" style={{
                    fontSize: '16px',
                    fontWeight: '700',
                    color: '#059669',
                    marginBottom: '2px'
                  }}>{prediction.participants}</div>
                  <div style={{ fontSize: '10px', color: '#666', fontWeight: '500' }}>Participants</div>
                </div>
              </div>

              <div className="odds-bar" style={{ marginBottom: '12px' }}>
                <div className="odds-visual" style={{
                  height: '8px',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  display: 'flex',
                  marginBottom: '6px'
                }}>
                  <div className="yes-bar" style={{ 
                    width: `${yesPercentage}%`,
                    background: 'linear-gradient(90deg, #4caf50, #66bb6a)',
                    height: '100%'
                  }}></div>
                  <div className="no-bar" style={{ 
                    width: `${100 - yesPercentage}%`,
                    background: 'linear-gradient(90deg, #f44336, #ef5350)',
                    height: '100%'
                  }}></div>
                </div>
                <div className="odds-labels" style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  <span style={{ color: '#4caf50' }}>YES {yesPercentage.toFixed(1)}% ({formatETH(prediction.yesTotalAmount)} ETH)</span>
                  <span style={{ color: '#f44336' }}>NO {(100 - yesPercentage).toFixed(1)}% ({formatETH(prediction.noTotalAmount)} ETH)</span>
                </div>
              </div>

              <div className="resolution-notice" style={{
                textAlign: 'center',
                fontSize: '12px',
                color: '#f44336',
                fontWeight: '600',
                marginBottom: '12px',
                padding: '8px',
                background: 'rgba(244, 67, 54, 0.1)',
                borderRadius: '6px'
              }}>
                <strong>🚫 CANCELLED</strong><br />
                <small style={{ fontSize: '10px', color: '#666' }}>This prediction was cancelled and stakes will be refunded</small>
              </div>

              <div className="action-buttons" style={{
                display: 'flex',
                justifyContent: 'center'
              }}>
                <button 
                  className="btn btn-info"
                  onClick={() => alert(`Prediction ${prediction.id} was cancelled. Stakes will be refunded to participants.`)}
                  style={{
                    background: '#2196f3',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '600',
                    transition: 'all 0.2s ease'
                  }}
                >
                  ℹ️ Info
                </button>
              </div>
            </div>
          );
        })}

        {/* Expired Predictions */}
        {filteredPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline <= Date.now() / 1000).map((prediction) => {
          const totalPool = prediction.yesTotalAmount + prediction.noTotalAmount;
          const yesPercentage = totalPool > 0 ? (prediction.yesTotalAmount / totalPool) * 100 : 0;

          return (
            <div key={prediction.id} className="prediction-card" style={{
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
              maxWidth: '100%',
              overflow: 'hidden'
            }}>
              <div className="card-header" style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '12px',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <span className="category-badge" style={{
                  background: '#e3f2fd',
                  color: '#1976d2',
                  padding: '4px 8px',
                  borderRadius: '12px',
                  fontSize: '10px',
                  fontWeight: '600',
                  textTransform: 'uppercase'
                }}>{prediction.category}</span>
                {getStatusBadge(prediction)}
              </div>
              
              <div className="prediction-question" style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#333',
                marginBottom: '12px',
                lineHeight: '1.4',
                wordWrap: 'break-word'
              }}>{prediction.question}</div>

              <div className="prediction-stats" style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '12px'
              }}>
                <div className="stat-item" style={{ textAlign: 'center' }}>
                  <div className="stat-value" style={{
                    fontSize: '16px',
                    fontWeight: '700',
                    color: '#2563eb',
                    marginBottom: '2px'
                  }}>{formatETH(totalPool)} ETH</div>
                  <div style={{ fontSize: '10px', color: '#666', fontWeight: '500' }}>Total Pool</div>
                </div>
                <div className="stat-item" style={{ textAlign: 'center' }}>
                  <div className="stat-value" style={{
                    fontSize: '16px',
                    fontWeight: '700',
                    color: '#059669',
                    marginBottom: '2px'
                  }}>{prediction.participants}</div>
                  <div style={{ fontSize: '10px', color: '#666', fontWeight: '500' }}>Participants</div>
                </div>
              </div>

              <div className="odds-bar" style={{ marginBottom: '12px' }}>
                <div className="odds-visual" style={{
                  height: '8px',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  display: 'flex',
                  marginBottom: '6px'
                }}>
                  <div className="yes-bar" style={{ 
                    width: `${yesPercentage}%`,
                    background: 'linear-gradient(90deg, #4caf50, #66bb6a)',
                    height: '100%'
                  }}></div>
                  <div className="no-bar" style={{ 
                    width: `${100 - yesPercentage}%`,
                    background: 'linear-gradient(90deg, #f44336, #ef5350)',
                    height: '100%'
                  }}></div>
                </div>
                <div className="odds-labels" style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  <span style={{ color: '#4caf50' }}>YES {yesPercentage.toFixed(1)}% ({formatETH(prediction.yesTotalAmount)} ETH)</span>
                  <span style={{ color: '#f44336' }}>NO {(100 - yesPercentage).toFixed(1)}% ({formatETH(prediction.noTotalAmount)} ETH)</span>
                </div>
              </div>

              <div className="resolution-notice" style={{
                textAlign: 'center',
                fontSize: '12px',
                color: '#ff9800',
                fontWeight: '600',
                marginBottom: '12px',
                padding: '8px',
                background: 'rgba(255, 152, 0, 0.1)',
                borderRadius: '6px'
              }}>
                <strong>⏰ EXPIRED</strong><br />
                <small style={{ fontSize: '10px', color: '#666' }}>Deadline passed - needs resolution</small>
              </div>

              <div className="action-buttons" style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '8px',
                flexWrap: 'wrap'
              }}>
                <button 
                  className="btn btn-success"
                  onClick={() => handleResolve(prediction.id, true)}
                  style={{
                    background: '#4caf50',
                    color: 'white',
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: '600',
                    transition: 'all 0.2s ease'
                  }}
                >
                  ✅ YES
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={() => handleResolve(prediction.id, false)}
                  style={{
                    background: '#f44336',
                    color: 'white',
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: '600',
                    transition: 'all 0.2s ease'
                  }}
                >
                  ❌ NO
                </button>
                <button 
                  className="btn btn-warning"
                  onClick={() => handleCancel(prediction.id)}
                  style={{
                    background: '#ff9800',
                    color: 'white',
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: '600',
                    transition: 'all 0.2s ease'
                  }}
                >
                  🚫 Cancel
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useReadContract, usePublicClient, useWriteContract } from 'wagmi';
import { CONTRACTS, getV2Contract } from '../../../lib/contract';
import { useRedisPredictions } from '../../../lib/hooks/useRedisPredictions';
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
  
  // Use Redis predictions hook to get all predictions
  const { predictions: redisPredictions, loading: predictionsLoading, error: predictionsError, refreshData } = useRedisPredictions();
  
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

  // Fetch real predictions data
  const [realPredictions, setRealPredictions] = React.useState<Prediction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Categorize predictions
  // Use real data if available, fallback to props
  const displayPredictions = realPredictions.length > 0 ? realPredictions : predictions;
  
  // Helper function to check if prediction needs resolution
  const needsResolution = (prediction: Prediction) => {
    if (prediction.resolved || prediction.cancelled) return false;
    
    // For Redis predictions, check if deadline has passed
    if (typeof prediction.id === 'string') {
      return Date.now() / 1000 > prediction.deadline;
    }
    
    // For on-chain predictions, check resolution deadline
    if (!prediction.resolutionDeadline) return false;
    return Date.now() / 1000 > prediction.resolutionDeadline;
  };
  
  // Filter predictions based on selected filter
  const getFilteredPredictions = () => {
    switch (selectedFilter) {
      case 'active':
        return displayPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline > Date.now() / 1000);
      case 'expired':
        return displayPredictions.filter(p => !p.resolved && !p.cancelled && p.deadline <= Date.now() / 1000);
      case 'resolved':
        return displayPredictions.filter(p => p.resolved);
      case 'cancelled':
        return displayPredictions.filter(p => p.cancelled);
      case 'needs-resolution':
        return displayPredictions.filter(p => needsResolution(p));
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

  React.useEffect(() => {
    const fetchPredictions = async () => {
      if (!totalPredictions || Number(totalPredictions) <= 1) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const predictions: Prediction[] = [];

        for (let i = 1; i < Number(totalPredictions); i++) {
          try {
            if (!publicClient) {
              throw new Error('Public client not available');
            }

            // Pobierz podstawowe informacje o predykcji
            const basicResult = await publicClient.readContract({
              address: CONTRACTS.V2.address as `0x${string}`,
              abi: CONTRACTS.V2.abi,
              functionName: 'getPredictionBasic',
              args: [BigInt(i)],
            }) as {
              question: string;
              description: string;
              category: string;
              yesTotalAmount: bigint;
              noTotalAmount: bigint;
              deadline: bigint;
              resolved: boolean;
              outcome: boolean;
              approved: boolean;
              creator: string;
            };

            // Pobierz rozszerzone informacje
            const extendedResult = await publicClient.readContract({
              address: CONTRACTS.V2.address as `0x${string}`,
              abi: CONTRACTS.V2.abi,
              functionName: 'getPredictionExtended',
              args: [BigInt(i)],
            }) as [string, bigint, boolean, bigint, boolean, boolean, bigint];

            // Pobierz statystyki rynku
            const marketStats = await publicClient.readContract({
              address: CONTRACTS.V2.address as `0x${string}`,
              abi: CONTRACTS.V2.abi,
              functionName: 'getMarketStats',
              args: [BigInt(i)],
            }) as {
              totalPool: bigint;
              participantsCount: bigint;
              yesPercentage: bigint;
              noPercentage: bigint;
              timeLeft: bigint;
            };

            const prediction: Prediction = {
              id: i,
              question: basicResult.question,
              description: basicResult.description,
              category: basicResult.category,
              yesTotalAmount: Number(basicResult.yesTotalAmount) / 1e18,
              noTotalAmount: Number(basicResult.noTotalAmount) / 1e18,
              deadline: Number(basicResult.deadline),
              resolved: basicResult.resolved,
              outcome: basicResult.outcome,
              cancelled: extendedResult[2],
              participants: Number(marketStats.participantsCount),
              resolutionDeadline: Number(basicResult.deadline) + (10 * 24 * 60 * 60), // 10 days after deadline
              needsApproval: false, // Default to false for blockchain data
              approved: basicResult.approved,
              verified: false, // Default to false for blockchain data
              creator: basicResult.creator,
            };

            predictions.push(prediction);
          } catch (error) {
            console.error(`Error fetching prediction ${i}:`, error);
          }
        }

        setRealPredictions(predictions);
      } catch (err) {
        console.error('❌ Failed to fetch predictions:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch predictions');
      } finally {
        setLoading(false);
      }
    };

    fetchPredictions();
  }, [totalPredictions]);

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
      // Check if this is a synced on-chain prediction (string ID starting with 'pred_v1_' or 'pred_v2_') or on-chain prediction (number ID)
      if (typeof predictionId === 'string' && (predictionId.startsWith('pred_v1_') || predictionId.startsWith('pred_v2_'))) {
        // This is a synced on-chain prediction - call the contract directly
        const isV1 = predictionId.startsWith('pred_v1_');
        const numericId = parseInt(predictionId.replace('pred_v1_', '').replace('pred_v2_', ''));
        if (!isNaN(numericId)) {
          console.log(`🔄 Resolving ${isV1 ? 'V1' : 'V2'} on-chain prediction ${predictionId} (numeric ID: ${numericId}) as ${side}`);
          onResolvePrediction(numericId, outcome, isV1 ? 'V1' : 'V2');
        } else {
          alert(`❌ Invalid ${isV1 ? 'V1' : 'V2'} prediction ID format`);
          return;
        }
      } else if (typeof predictionId === 'string' && predictionId.startsWith('pred_')) {
        // This is a pure Redis prediction (not synced from blockchain) - handle via API
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
            // Refresh data
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
      } else {
        // Handle on-chain prediction (numeric ID)
        onResolvePrediction(predictionId, outcome);
      }
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

  // Direct contract transaction functions (bypass UI state)
  const handleDirectResolve = async (predictionId: string | number, outcome: boolean) => {
    const side = outcome ? 'YES' : 'NO';
    let numericId: number | null = null;
    let contractVersion: 'V1' | 'V2' = 'V2'; // Default to V2
    
    if (typeof predictionId === 'string' && (predictionId.startsWith('pred_v1_') || predictionId.startsWith('pred_v2_'))) {
      // V1 or V2 synced prediction
      contractVersion = predictionId.startsWith('pred_v1_') ? 'V1' : 'V2';
      numericId = parseInt(predictionId.replace('pred_v1_', '').replace('pred_v2_', ''));
    } else if (typeof predictionId === 'string' && predictionId.startsWith('pred_')) {
      // Pure Redis prediction - cannot do direct contract transaction
      alert('❌ Cannot perform direct contract transaction on pure Redis prediction. Use regular resolve instead.');
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

    if (confirm(`🚨 FORCE RESOLVE: Are you sure you want to resolve prediction ${numericId} as ${side} on the ${contractVersion} blockchain? This will execute a real transaction.`)) {
      try {
        writeContract({
          address: contract.address as `0x${string}`,
          abi: contract.abi,
          functionName: 'resolvePrediction',
          args: [BigInt(numericId), outcome],
        }, {
          onSuccess: async (tx) => {
            console.log(`✅ FORCE RESOLVE: Prediction ${numericId} resolved successfully on ${contractVersion}:`, tx);
            alert(`✅ FORCE RESOLVE SUCCESS!\nPrediction ${numericId} resolved as ${side} on ${contractVersion}\nTransaction: ${tx}\n\nSyncing with Redis...`);
            
            // Force sync with blockchain to update Redis immediately
            try {
              console.log('🔄 Syncing blockchain to Redis after FORCE RESOLVE...');
              const syncResponse = await fetch('/api/sync');
              if (syncResponse.ok) {
                console.log('✅ Redis sync successful after FORCE RESOLVE');
                
                // Also sync claims to update user stakes
                console.log('🔄 Syncing claims after FORCE RESOLVE...');
                const claimsSyncResponse = await fetch('/api/sync/claims');
                if (claimsSyncResponse.ok) {
                  console.log('✅ Claims sync successful after FORCE RESOLVE');
                } else {
                  console.warn('⚠️ Claims sync failed after FORCE RESOLVE');
                }
                
                alert(`✅ SYNC COMPLETE!\nPrediction ${numericId} resolved as ${side}\nTransaction: ${tx}\n\nRedis and claims have been updated. Refreshing data...`);
                // Refresh data after successful sync
                setTimeout(() => {
                  handleRefresh();
                }, 2000);
              } else {
                console.warn('⚠️ Redis sync failed after FORCE RESOLVE');
                alert(`⚠️ WARNING: Transaction successful but sync failed!\nPrediction ${numericId} resolved as ${side}\nTransaction: ${tx}\n\nPlease manually refresh the page.`);
              }
            } catch (syncError) {
              console.error('❌ Failed to sync after FORCE RESOLVE:', syncError);
              alert(`⚠️ WARNING: Transaction successful but sync failed!\nPrediction ${numericId} resolved as ${side}\nTransaction: ${tx}\n\nPlease manually refresh the page.`);
            }
          },
          onError: (error) => {
            console.error('❌ FORCE RESOLVE FAILED:', error);
            alert(`❌ FORCE RESOLVE FAILED!\nPrediction ${numericId}\nError: ${error.message || error}\n\nPlease check your wallet and try again.`);
          }
        });
      } catch (error) {
        console.error('❌ FORCE RESOLVE ERROR:', error);
        alert(`❌ FORCE RESOLVE ERROR!\nPrediction ${numericId}\nError: ${error}`);
      }
    }
  };

  const handleDirectCancel = async (predictionId: string | number) => {
    const reason = prompt('🚨 FORCE CANCEL: Enter reason for emergency cancellation:');
    if (!reason) return;

    let numericId: number | null = null;
    let contractVersion: 'V1' | 'V2' = 'V2'; // Default to V2
    
    if (typeof predictionId === 'string' && (predictionId.startsWith('pred_v1_') || predictionId.startsWith('pred_v2_'))) {
      // V1 or V2 synced prediction
      contractVersion = predictionId.startsWith('pred_v1_') ? 'V1' : 'V2';
      numericId = parseInt(predictionId.replace('pred_v1_', '').replace('pred_v2_', ''));
    } else if (typeof predictionId === 'string' && predictionId.startsWith('pred_')) {
      // Pure Redis prediction - cannot do direct contract transaction
      alert('❌ Cannot perform direct contract transaction on pure Redis prediction. Use regular cancel instead.');
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

    if (confirm(`🚨 FORCE CANCEL: Are you sure you want to cancel prediction ${numericId} on the ${contractVersion} blockchain?\nReason: ${reason}\n\nThis will execute a real transaction.`)) {
      try {
        writeContract({
          address: contract.address as `0x${string}`,
          abi: contract.abi,
          functionName: 'cancelPrediction',
          args: [BigInt(numericId), reason],
        }, {
          onSuccess: async (tx) => {
            console.log(`✅ FORCE CANCEL: Prediction ${numericId} cancelled successfully on ${contractVersion}:`, tx);
            alert(`✅ FORCE CANCEL SUCCESS!\nPrediction ${numericId} cancelled on ${contractVersion}\nReason: ${reason}\nTransaction: ${tx}\n\nSyncing with Redis...`);
            
            // Force sync with blockchain to update Redis immediately
            try {
              console.log('🔄 Syncing blockchain to Redis after FORCE CANCEL...');
              const syncResponse = await fetch('/api/sync');
              if (syncResponse.ok) {
                console.log('✅ Redis sync successful after FORCE CANCEL');
                alert(`✅ SYNC COMPLETE!\nPrediction ${numericId} cancelled\nReason: ${reason}\nTransaction: ${tx}\n\nRedis has been updated. Refreshing data...`);
                // Refresh data after successful sync
                setTimeout(() => {
                  handleRefresh();
                }, 2000);
              } else {
                console.warn('⚠️ Redis sync failed after FORCE CANCEL');
                alert(`⚠️ WARNING: Transaction successful but sync failed!\nPrediction ${numericId} cancelled\nReason: ${reason}\nTransaction: ${tx}\n\nPlease manually refresh the page.`);
              }
            } catch (syncError) {
              console.error('❌ Failed to sync after FORCE CANCEL:', syncError);
              alert(`⚠️ WARNING: Transaction successful but sync failed!\nPrediction ${numericId} cancelled\nReason: ${reason}\nTransaction: ${tx}\n\nPlease manually refresh the page.`);
            }
          },
          onError: (error) => {
            console.error('❌ FORCE CANCEL FAILED:', error);
            alert(`❌ FORCE CANCEL FAILED!\nPrediction ${numericId}\nError: ${error.message || error}\n\nPlease check your wallet and try again.`);
          }
        });
      } catch (error) {
        console.error('❌ FORCE CANCEL ERROR:', error);
        alert(`❌ FORCE CANCEL ERROR!\nPrediction ${numericId}\nError: ${error}`);
      }
    }
  };

  const predictionsNeedingResolution = filteredPredictions.filter(p => needsResolution(p));
  const livePredictions = filteredPredictions.filter(p => !p.resolved && !p.cancelled && !needsResolution(p));

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>Loading admin data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-dashboard">
        <div style={{ textAlign: 'center', padding: '40px', color: 'red' }}>
          <div>❌ Failed to load admin data</div>
          <div style={{ fontSize: '14px', marginTop: '10px' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* Header with Filter and Refresh Button */}
      <div className="admin-header" style={{ marginBottom: '20px' }}>
        {/* Filter Row */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '15px' }}>
          <div className="filter-section" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="prediction-filter" style={{ fontSize: '12px', fontWeight: '500', whiteSpace: 'nowrap' }}>
              Filter:
            </label>
            <Select value={selectedFilter} onValueChange={setSelectedFilter}>
              <SelectTrigger style={{ width: '150px', fontSize: '12px' }}>
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
        {/* V2 Sync Controls - Mobile Optimized */}
        <div className="v2-sync-controls" style={{ 
          display: 'flex', 
          gap: '8px', 
          flexWrap: 'wrap', 
          justifyContent: 'flex-end',
          marginBottom: '10px'
        }}>
          <button 
            onClick={handleRefresh}
            className="refresh-btn mobile-sync-btn"
            style={{
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '12px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              margin: '2px',
              whiteSpace: 'nowrap',
              minHeight: '44px',
              minWidth: '80px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease'
            }}
          >
            🔄 Refresh
          </button>
          
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
            className="sync-btn mobile-sync-btn"
            style={{
              background: '#2196F3',
              color: 'white',
              border: 'none',
              padding: '12px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              margin: '2px',
              whiteSpace: 'nowrap',
              minHeight: '44px',
              minWidth: '100px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease'
            }}
          >
            🚀 V2 Full Sync
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
            className="sync-btn mobile-sync-btn"
            style={{
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '12px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              margin: '2px',
              whiteSpace: 'nowrap',
              minHeight: '44px',
              minWidth: '100px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease'
            }}
          >
            ⚡ V2 Incremental Sync
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
            className="sync-btn mobile-sync-btn"
            style={{
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '12px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              margin: '2px',
              whiteSpace: 'nowrap',
              minHeight: '44px',
              minWidth: '120px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease'
            }}
          >
            ⚡ V2 Active Sync
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
            className="sync-btn mobile-sync-btn"
            style={{
              background: '#FF9800',
              color: 'white',
              border: 'none',
              padding: '12px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              margin: '2px',
              whiteSpace: 'nowrap',
              minHeight: '44px',
              minWidth: '120px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease'
            }}
          >
            💰 V2 Resolved Sync
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
            className="sync-btn mobile-sync-btn"
            style={{
              background: '#9C27B0',
              color: 'white',
              border: 'none',
              padding: '12px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              margin: '2px',
              whiteSpace: 'nowrap',
              minHeight: '44px',
              minWidth: '120px',
              touchAction: 'manipulation',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease'
            }}
          >
            🔍 V2 Claims Sync
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

              {/* Force Contract Transaction Buttons */}
              <div className="force-buttons" style={{ marginTop: '10px', padding: '10px', background: 'rgba(255, 0, 0, 0.1)', borderRadius: '8px', border: '1px solid rgba(255, 0, 0, 0.3)' }}>
                <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 'bold', marginBottom: '8px' }}>
                  🚨 FORCE CONTRACT TRANSACTIONS (Bypass UI State)
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    className="btn"
                    style={{ background: '#dc2626', color: 'white', fontSize: '12px', padding: '6px 12px' }}
                    onClick={() => handleDirectResolve(prediction.id, true)}
                  >
                    🔥 FORCE YES
                  </button>
                  <button
                    className="btn"
                    style={{ background: '#dc2626', color: 'white', fontSize: '12px', padding: '6px 12px' }}
                    onClick={() => handleDirectResolve(prediction.id, false)}
                  >
                    🔥 FORCE NO
                  </button>
                  <button
                    className="btn"
                    style={{ background: '#dc2626', color: 'white', fontSize: '12px', padding: '6px 12px' }}
                    onClick={() => handleDirectCancel(prediction.id)}
                  >
                    🔥 FORCE CANCEL
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Live Predictions */}
        {livePredictions.map((prediction) => {
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
                  <span>YES {yesPercentage.toFixed(1)}%</span>
                  <span>NO {(100 - yesPercentage).toFixed(1)}%</span>
                </div>
              </div>

              <div className="time-remaining">⏰ {getTimeRemaining(prediction.deadline)}</div>

              <div className="action-buttons">
                <button
                  className="btn btn-cancel"
                  onClick={() => handleCancel(prediction.id)}
                >
                  🚫 Emergency Cancel
                </button>
              </div>

              {/* Force Contract Transaction Buttons */}
              <div className="force-buttons" style={{ marginTop: '10px', padding: '10px', background: 'rgba(255, 0, 0, 0.1)', borderRadius: '8px', border: '1px solid rgba(255, 0, 0, 0.3)' }}>
                <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 'bold', marginBottom: '8px' }}>
                  🚨 FORCE CONTRACT TRANSACTIONS (Bypass UI State)
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    className="btn"
                    style={{ background: '#dc2626', color: 'white', fontSize: '12px', padding: '6px 12px' }}
                    onClick={() => handleDirectResolve(prediction.id, true)}
                  >
                    🔥 FORCE YES
                  </button>
                  <button
                    className="btn"
                    style={{ background: '#dc2626', color: 'white', fontSize: '12px', padding: '6px 12px' }}
                    onClick={() => handleDirectResolve(prediction.id, false)}
                  >
                    🔥 FORCE NO
                  </button>
                  <button
                    className="btn"
                    style={{ background: '#dc2626', color: 'white', fontSize: '12px', padding: '6px 12px' }}
                    onClick={() => handleDirectCancel(prediction.id)}
                  >
                    🔥 FORCE CANCEL
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Resolved Predictions */}
        {filteredPredictions.filter(p => p.resolved).map((prediction) => {
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
                  <span>YES {yesPercentage.toFixed(1)}% {prediction.outcome === true ? '✅ WON' : '❌ LOST'}</span>
                  <span>NO {(100 - yesPercentage).toFixed(1)}% {prediction.outcome === false ? '✅ WON' : '❌ LOST'}</span>
                </div>
              </div>

              <div className="resolution-success">
                <strong>✅ Resolved as {prediction.outcome ? 'YES' : 'NO'}</strong><br />
                <small>Platform Fee: {(totalPool * 0.01).toFixed(4)} ETH (1% of {(prediction.outcome ? prediction.noTotalAmount : prediction.yesTotalAmount).toFixed(1)} ETH profit)</small><br />
                <small>Participants can now claim their rewards</small>
              </div>

              <div className="action-buttons">
                <button className="btn" style={{ background: 'gray', cursor: 'not-allowed' }}>
                  Resolved ✅
                </button>
              </div>

              {/* Force Contract Transaction Buttons - Even for resolved predictions */}
              <div className="force-buttons" style={{ marginTop: '10px', padding: '10px', background: 'rgba(255, 0, 0, 0.1)', borderRadius: '8px', border: '1px solid rgba(255, 0, 0, 0.3)' }}>
                <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 'bold', marginBottom: '8px' }}>
                  🚨 FORCE CONTRACT TRANSACTIONS (Bypass UI State)
                </div>
                <div style={{ fontSize: '10px', color: '#dc2626', marginBottom: '8px' }}>
                  ⚠️ WARNING: This prediction appears resolved in UI, but you can force contract transactions
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    className="btn"
                    style={{ background: '#dc2626', color: 'white', fontSize: '12px', padding: '6px 12px' }}
                    onClick={() => handleDirectResolve(prediction.id, true)}
                  >
                    🔥 FORCE YES
                  </button>
                  <button
                    className="btn"
                    style={{ background: '#dc2626', color: 'white', fontSize: '12px', padding: '6px 12px' }}
                    onClick={() => handleDirectResolve(prediction.id, false)}
                  >
                    🔥 FORCE NO
                  </button>
                  <button
                    className="btn"
                    style={{ background: '#dc2626', color: 'white', fontSize: '12px', padding: '6px 12px' }}
                    onClick={() => handleDirectCancel(prediction.id)}
                  >
                    🔥 FORCE CANCEL
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Cancelled Predictions */}
        {filteredPredictions.filter(p => p.cancelled).map((prediction) => {
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
                <strong>🚫 CANCELLED</strong><br />
                <small>This prediction was cancelled and stakes will be refunded</small>
              </div>

              <div className="action-buttons">
                <button 
                  className="btn btn-info"
                  onClick={() => alert(`Prediction ${prediction.id} was cancelled. Stakes will be refunded to participants.`)}
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
                <strong>⏰ EXPIRED</strong><br />
                <small>Deadline passed - needs resolution</small>
              </div>

              <div className="action-buttons">
                <button 
                  className="btn btn-success"
                  onClick={() => handleResolve(prediction.id, true)}
                >
                  ✅ Resolve YES
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={() => handleResolve(prediction.id, false)}
                >
                  ❌ Resolve NO
                </button>
                <button 
                  className="btn btn-warning"
                  onClick={() => handleCancel(prediction.id)}
                >
                  🚫 Cancel
                </button>
              </div>

              {/* Force Contract Transaction Buttons */}
              <div style={{ marginTop: '10px', padding: '10px', border: '2px solid #ff4444', borderRadius: '8px', backgroundColor: '#ffe6e6' }}>
                <div style={{ color: '#ff4444', fontWeight: 'bold', marginBottom: '8px' }}>
                  🔥 FORCE CONTRACT TRANSACTIONS (Bypass UI State)
                </div>
                <div style={{ color: '#ff4444', fontSize: '12px', marginBottom: '8px' }}>
                  ⚠️ WARNING: This prediction appears expired in UI, but you can force contract transactions
                </div>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  <button 
                    className="btn btn-danger"
                    onClick={() => handleDirectResolve(prediction.id, true)}
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                  >
                    🔥 FORCE YES
                  </button>
                  <button 
                    className="btn btn-danger"
                    onClick={() => handleDirectResolve(prediction.id, false)}
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                  >
                    🔥 FORCE NO
                  </button>
                  <button 
                    className="btn btn-danger"
                    onClick={() => handleDirectCancel(prediction.id)}
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                  >
                    🔥 FORCE CANCEL
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useReadContract, usePublicClient, useWriteContract } from 'wagmi';
import { CONTRACTS, getV2Contract, USDC_DUALPOOL_CONTRACT_ADDRESS, USDC_DUALPOOL_ABI } from '../../../lib/contract';
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

  // Refresh largest stakes cache function
  const handleRefreshLargestStakesCache = useCallback(async () => {
    try {
      console.log('🔄 Refreshing largest stakes cache...');
      const response = await fetch('/api/admin/refresh-largest-stakes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      if (result.success) {
        console.log('✅ Largest stakes cache refreshed successfully');
        alert('Largest stakes cache refreshed successfully!');
      } else {
        console.error('❌ Failed to refresh largest stakes cache:', result.error);
        alert('Failed to refresh largest stakes cache: ' + result.error);
      }
    } catch (error) {
      console.error('❌ Error refreshing largest stakes cache:', error);
      alert('Error refreshing largest stakes cache: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }, []);

  // Handle collecting real leaderboard data (simplified - divides stakes equally)
  const handleCollectRealLeaderboardData = useCallback(async () => {
    try {
      console.log('🔍 Collecting real leaderboard data...');
      
      const response = await fetch('/api/debug/leaderboard-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Real leaderboard data collected:', data);
        
        // Show success notification
        alert(`✅ Real Data Collected!\nFound ${data.data.totalUsers} users with ${data.data.totalPredictions} predictions.\nCheck Leaderboard page!`);
      } else {
        throw new Error(`Failed to collect data: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Failed to collect real leaderboard data:', error);
      alert('❌ Collection Failed: Failed to collect real leaderboard data');
    }
  }, []);

  // Handle rescanning V2 contract for accurate leaderboard (reads actual stakes from blockchain)
  const handleRescanV2Leaderboard = useCallback(async () => {
    if (!confirm('🔄 Rescan V2 Contract?\n\nThis will:\n- Read actual user stakes from blockchain\n- Update Redis with accurate data\n- Update leaderboard cache\n\nThis may take a few minutes. Continue?')) {
      return;
    }

    try {
      console.log('🔄 Rescanning V2 contract for leaderboard...');
      
      const response = await fetch('/api/admin/rescan-v2-leaderboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ V2 contract rescanned:', data);
        
        // Show success notification
        alert(`✅ V2 Contract Rescanned!\n\nFound ${data.data.totalUsers} users\n${data.data.totalV2Predictions} V2 predictions\n\nETH Leaderboard: ${data.data.ethLeaderboardCount} users\nSWIPE Leaderboard: ${data.data.swipeLeaderboardCount} users\n\nLeaderboard updated!`);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to rescan: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Failed to rescan V2 leaderboard:', error);
      alert(`❌ Rescan Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  // REMOVED: Slow blockchain fetch loop that was causing performance issues
  // Now using Redis data exclusively, which is always up-to-date and much faster
  // Contract stats (contractStats, totalPredictions) are still fetched from blockchain for admin info

  // Calculate real stats (use displayPredictions for total stats, filteredPredictions for current view)
  // Note: wagmi may return structs as arrays or objects depending on ABI definition
  // ContractStats struct order: totalPredictions, platformFee, ethFees, swipeFees, ethMinStake, ethMaxStake, swipeMinStake, swipeMaxStake, contractBalance
  const stats = {
    totalPredictions: totalPredictions ? Number(totalPredictions) - 1 : displayPredictions.length,
    needsResolution: displayPredictions.filter(p => needsResolution(p)).length,
    collectedFees: contractStats ? (
      // Try object property first, then array index
      (contractStats as any).ethFees ? Number((contractStats as any).ethFees) / 1e18 :
      Array.isArray(contractStats) && contractStats[2] ? Number(contractStats[2]) / 1e18 : 0
    ) : 0,
    collectedSwipeFees: contractStats ? (
      // Try object property first, then array index
      (contractStats as any).swipeFees ? Number((contractStats as any).swipeFees) / 1e18 :
      Array.isArray(contractStats) && contractStats[3] ? Number(contractStats[3]) / 1e18 : 0
    ) : 0,
    activeApprovers: 5, // TODO: Add function to get active approvers count
    contractBalance: contractStats ? (
      // Try object property first, then array index
      (contractStats as any).contractBalance ? Number((contractStats as any).contractBalance) / 1e18 :
      Array.isArray(contractStats) && contractStats[8] ? Number(contractStats[8]) / 1e18 : 0
    ) : 0,
    platformFee: contractStats ? (
      // Try object property first, then array index
      (contractStats as any).platformFee ? Number((contractStats as any).platformFee) / 100 :
      Array.isArray(contractStats) && contractStats[1] ? Number(contractStats[1]) / 100 : 1
    ) : 1
  };

  // Debug: Log contract stats structure
  useEffect(() => {
    if (contractStats) {
      console.log('🔍 ContractStats structure:', contractStats);
      console.log('🔍 ContractStats type:', typeof contractStats, Array.isArray(contractStats));
      console.log('🔍 ContractStats keys:', Object.keys(contractStats || {}));
    }
  }, [contractStats]);

  const handleResolve = async (predictionId: string | number, outcome: boolean) => {
    const side = outcome ? 'YES' : 'NO';
    if (confirm(`Are you sure you want to resolve this prediction as ${side}?`)) {
      // Use handleDirectResolve for all cases - it has auto-sync built in
      handleDirectResolve(predictionId, outcome);
    }
  };

  // Resolve USDC contract only (for already V2-resolved predictions)
  const handleResolveUsdcOnly = async (predictionId: string | number, outcome: boolean) => {
    const side = outcome ? 'YES' : 'NO';
    
    // Extract numeric ID
    let numericId: number | null = null;
    if (typeof predictionId === 'string' && predictionId.startsWith('pred_v2_')) {
      numericId = parseInt(predictionId.replace('pred_v2_', ''));
    } else if (typeof predictionId === 'number') {
      numericId = predictionId;
    }
    
    if (!numericId || isNaN(numericId)) {
      alert('❌ Invalid prediction ID for USDC contract');
      return;
    }
    
    if (!confirm(`Resolve USDC DualPool prediction ${numericId} as ${side}?`)) {
      return;
    }
    
    try {
      writeContract({
        address: USDC_DUALPOOL_CONTRACT_ADDRESS as `0x${string}`,
        abi: USDC_DUALPOOL_ABI,
        functionName: 'resolvePrediction',
        args: [BigInt(numericId), outcome],
      }, {
        onSuccess: async (tx) => {
          console.log(`✅ USDC DualPool prediction ${numericId} resolved as ${side}:`, tx);
          alert(`✅ USDC prediction resolved as ${side}!\nTransaction: ${tx}`);
          
          // Sync USDC data to Redis
          try {
            await fetch('/api/sync/usdc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ predictionId: numericId })
            });
            console.log('✅ USDC data synced to Redis');
          } catch (syncErr) {
            console.warn('⚠️ USDC sync failed:', syncErr);
          }
          
          handleRefresh();
        },
        onError: (error) => {
          console.error('❌ USDC resolve failed:', error);
          alert(`❌ USDC resolve failed: ${error.message}`);
        }
      });
    } catch (error) {
      console.error('Failed to resolve USDC prediction:', error);
      alert(`❌ Failed: ${error}`);
    }
  };

  // Register prediction on USDC DualPool contract
  const handleRegisterUsdc = async (predictionId: string | number) => {
    // Extract numeric ID
    let numericId: number | null = null;
    if (typeof predictionId === 'string' && predictionId.startsWith('pred_v2_')) {
      numericId = parseInt(predictionId.replace('pred_v2_', ''));
    } else if (typeof predictionId === 'number') {
      numericId = predictionId;
    }
    
    if (!numericId || isNaN(numericId)) {
      alert('❌ Invalid prediction ID for USDC registration');
      return;
    }
    
    // Find prediction data
    const pred = redisPredictions.find(p => p.id === predictionId || p.id === `pred_v2_${predictionId}`);
    if (!pred) {
      alert('❌ Prediction not found in Redis');
      return;
    }
    
    if (!confirm(`Register prediction ${numericId} on USDC DualPool contract?\n\nQuestion: ${pred.question?.substring(0, 50)}...`)) {
      return;
    }
    
    try {
      writeContract({
        address: USDC_DUALPOOL_CONTRACT_ADDRESS as `0x${string}`,
        abi: USDC_DUALPOOL_ABI,
        functionName: 'registerPrediction',
        args: [BigInt(numericId), pred.creator as `0x${string}`, BigInt(pred.deadline)],
      }, {
        onSuccess: async (tx) => {
          console.log(`✅ Prediction ${numericId} registered on USDC DualPool:`, tx);
          alert(`✅ Prediction registered on USDC!\nTransaction: ${tx}\n\nUsers can now bet with USDC.`);
          
          // Sync USDC data to Redis
          try {
            await fetch('/api/sync/usdc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ predictionIds: [numericId] })
            });
            handleRefresh();
          } catch (e) {
            console.warn('USDC sync after registration failed:', e);
          }
        },
        onError: (error) => {
          console.error('❌ USDC registration failed:', error);
          alert(`❌ Failed: ${error.message}`);
        }
      });
    } catch (error) {
      console.error('Failed to register USDC prediction:', error);
      alert(`❌ Failed: ${error}`);
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
    
    // Check if this prediction has USDC pool enabled
    const predictionStringId = `pred_${contractVersion.toLowerCase()}_${numericId}`;
    const currentPred = redisPredictions.find(p => p.id === predictionStringId);
    const hasUsdcPool = (currentPred as any)?.usdcPoolEnabled === true;

    try {
      writeContract({
        address: contract.address as `0x${string}`,
        abi: contract.abi,
        functionName: 'resolvePrediction',
        args: [BigInt(numericId), outcome],
      }, {
        onSuccess: async (tx) => {
          console.log(`✅ Prediction ${numericId} resolved successfully on ${contractVersion}:`, tx);
          
          // If USDC pool is enabled, also resolve on USDC DualPool contract
          if (hasUsdcPool) {
            console.log(`🔵 USDC pool detected - also resolving on USDC DualPool contract...`);
            try {
              writeContract({
                address: USDC_DUALPOOL_CONTRACT_ADDRESS as `0x${string}`,
                abi: USDC_DUALPOOL_ABI,
                functionName: 'resolvePrediction',
                args: [BigInt(numericId), outcome],
              }, {
                onSuccess: (usdcTx) => {
                  console.log(`✅ USDC DualPool prediction ${numericId} also resolved:`, usdcTx);
                  alert(`✅ Prediction resolved as ${side} on BOTH contracts!\n\nV2: ${tx}\nUSDC: ${usdcTx}`);
                },
                onError: (usdcError) => {
                  console.error('❌ USDC DualPool resolve failed:', usdcError);
                  alert(`⚠️ V2 resolved but USDC failed!\n\nV2: ${tx}\nUSDC Error: ${usdcError.message}`);
                }
              });
            } catch (usdcErr) {
              console.error('❌ Failed to call USDC resolve:', usdcErr);
            }
          } else {
            alert(`✅ Prediction resolved as ${side}!\nTransaction: ${tx}\n\nAuto-syncing with Redis...`);
          }
          
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
              
              // Send broadcast notification to all users about resolved prediction
              try {
                console.log('📢 Sending broadcast notification about resolved prediction...');
                // Get prediction title for notification
                const currentPrediction = filteredPredictions.find(p => 
                  (typeof predictionId === 'string' && p.id === predictionId) ||
                  (typeof predictionId === 'number' && p.id === `pred_v${contractVersion === 'V1' ? '1' : '2'}_${predictionId}`)
                );
                
                const predictionTitle = currentPrediction?.question || `Prediction #${numericId}`;
                const outcomeText = outcome ? 'YES' : 'NO';
                
                const notifyResponse = await fetch('/api/notify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    broadcast: true,
                    title: "🎉 Prediction Resolved!",
                    body: `"${predictionTitle}" resolved as ${outcomeText}! Check if you won and claim your winnings! Complete daily tasks for more free $SWIPE! 💰`,
                    type: 'prediction_resolved'
                  }),
                });
                
                if (notifyResponse.ok) {
                  const notifyResult = await notifyResponse.json();
                  console.log('✅ Broadcast notification sent:', notifyResult);
                } else {
                  console.warn('⚠️ Broadcast notification failed:', await notifyResponse.text());
                }
              } catch (notifyError) {
                console.error('❌ Failed to send broadcast notification:', notifyError);
                // Don't fail the whole operation if notification fails
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

          <button 
            onClick={handleRefreshLargestStakesCache}
            className="refresh-leaderboard-btn ultra-compact-btn"
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
            🏆 Refresh Leaderboard
          </button>
          
          <button 
            onClick={async () => {
              if (confirm('🔍 COLLECT REAL LEADERBOARD DATA\n\nThis will collect real stakes data from all predictions and fetch Farcaster profiles.\nThis may take a few minutes.\n\nContinue?')) {
                try {
                  console.log('🔍 Starting real leaderboard data collection...');
                  const response = await fetch('/api/debug/leaderboard-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                  });
                  
                  if (response.ok) {
                    const result = await response.json();
                    console.log('✅ Real leaderboard data collected:', result);
                    
                    // Show summary
                    const summary = result.data.summary;
                    alert(`✅ Real Leaderboard Data Collected!\n\n📊 Summary:\n• ${result.data.totalUsers} users\n• ${result.data.totalPredictions} predictions\n• ${summary.totalETHStaked.toFixed(4)} ETH staked\n• ${summary.totalSWIPEStaked.toFixed(0)} SWIPE staked\n• ${summary.totalPredictionsParticipated} total participations\n\n🏆 ETH Top 3:\n${result.data.ethLeaderboard.slice(0, 3).map((u: any, i: number) => `${i+1}. ${u.address.slice(0,6)}...${u.address.slice(-4)}: ${u.totalStakedETH.toFixed(4)} ETH`).join('\n')}\n\n🏆 SWIPE Top 3:\n${result.data.swipeLeaderboard.slice(0, 3).map((u: any, i: number) => `${i+1}. ${u.address.slice(0,6)}...${u.address.slice(-4)}: ${u.totalStakedSWIPE.toFixed(0)} SWIPE`).join('\n')}\n\n🔍 Farcaster Profiles: ${result.data.farcasterProfiles.length} found\n\nCheck console for full data!`);
                  } else {
                    const error = await response.json();
                    alert(`❌ Failed to collect leaderboard data: ${error.error}`);
                  }
                } catch (error) {
                  console.error('❌ Error collecting leaderboard data:', error);
                  alert(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }
            }}
            className="collect-leaderboard-btn ultra-compact-btn"
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
            🔍 Collect Real Data (Simplified)
          </button>
          <button
            onClick={handleRescanV2Leaderboard}
            className="admin-button"
            style={{ marginLeft: '10px' }}
          >
            🔄 Rescan V2 Contract (Accurate)
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
              if (confirm('🔄 V2 + USDC SYNC (Last 15)\n\nThis will sync the last 15 predictions:\n• ETH/SWIPE pools and stakes (V2)\n• USDC pools (DualPool contract)\n\nPerfect for keeping live predictions up to date!\n\nContinue?')) {
                try {
                  alert('🔄 Starting V2 + USDC sync (last 15 predictions)...');
                  const response = await fetch('/api/sync/v2/recent?count=15');
                  if (response.ok) {
                    const result = await response.json();
                    alert(`✅ V2 + USDC SYNC COMPLETE!\n\nV2 Synced: ${result.data.syncedPredictions} predictions\nStakes: ${result.data.syncedStakes}\nRange: #${result.data.syncedRange.from} - #${result.data.syncedRange.to}\n\n💵 USDC Synced: ${result.data.usdcSynced || 0} predictions\n\nErrors: V2=${result.data.errorsCount}, USDC=${result.data.usdcErrors || 0}\n\nRefreshing data...`);
                    handleRefresh();
                  } else {
                    alert('❌ V2 recent sync failed. Check console for details.');
                  }
                } catch (error) {
                  console.error('V2 recent sync error:', error);
                  alert('❌ V2 recent sync failed. Check console for details.');
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
            🔄 Last 15 + 💵
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
              const idsInput = prompt('💵 USDC SYNC\n\nSync USDC contract data to Redis.\n\nEnter prediction IDs (comma separated) or leave empty for all registered:\n\nExample: 224,225,226');
              
              try {
                alert('💵 Starting USDC sync...');
                const url = idsInput 
                  ? `/api/sync/usdc?ids=${idsInput.replace(/\s/g, '')}` 
                  : '/api/sync/usdc';
                  
                const response = await fetch(url);
                if (response.ok) {
                  const result = await response.json();
                  alert(`✅ USDC SYNC COMPLETE!\n\nSynced: ${result.synced} predictions\nTotal checked: ${result.total}\n\nResults:\n${Object.entries(result.results || {}).map(([id, r]: [string, any]) => 
                    `#${id}: ${r.registered ? `✓ Pool: YES=$${r.yesPool?.toFixed(2)} NO=$${r.noPool?.toFixed(2)}` : '✗ Not registered'}`
                  ).join('\n')}\n\nRefreshing data...`);
                  handleRefresh();
                } else {
                  alert('❌ USDC sync failed. Check console for details.');
                }
              } catch (error) {
                console.error('USDC sync error:', error);
                alert('❌ USDC sync failed. Check console for details.');
              }
            }}
            className="sync-btn ultra-compact-btn"
            style={{
              background: '#10b981',
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
            💵 USDC Sync
          </button>
          
          <button 
            onClick={async () => {
              // Show USDC status for all predictions
              const v2Predictions = redisPredictions.filter(p => p.id.startsWith('pred_v2_') && !p.resolved && !p.cancelled);
              const usdcEnabled = v2Predictions.filter(p => (p as any).usdcPoolEnabled);
              const notRegistered = v2Predictions.filter(p => !(p as any).usdcPoolEnabled);
              
              let message = `💵 USDC MARKETS STATUS\n\n`;
              message += `📊 Total Active V2 Predictions: ${v2Predictions.length}\n`;
              message += `✅ USDC Enabled: ${usdcEnabled.length}\n`;
              message += `❌ Not Registered: ${notRegistered.length}\n\n`;
              
              if (usdcEnabled.length > 0) {
                message += `✅ USDC ENABLED:\n`;
                usdcEnabled.slice(0, 5).forEach((p: any) => {
                  const id = p.id.replace('pred_v2_', '');
                  const yesPool = ((p.usdcYesTotalAmount || 0) / 1e6).toFixed(2);
                  const noPool = ((p.usdcNoTotalAmount || 0) / 1e6).toFixed(2);
                  message += `• #${id}: $${yesPool} YES / $${noPool} NO\n`;
                });
                if (usdcEnabled.length > 5) message += `... +${usdcEnabled.length - 5} more\n`;
                message += `\n`;
              }
              
              if (notRegistered.length > 0) {
                message += `❌ NOT REGISTERED (need to register):\n`;
                notRegistered.slice(0, 5).forEach((p: any) => {
                  const id = p.id.replace('pred_v2_', '');
                  message += `• #${id}: ${p.question?.substring(0, 40)}...\n`;
                });
                if (notRegistered.length > 5) message += `... +${notRegistered.length - 5} more\n`;
              }
              
              alert(message);
            }}
            className="sync-btn ultra-compact-btn"
            style={{
              background: '#3b82f6',
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
            💵 USDC Status
          </button>
          
          <button 
            onClick={async () => {
              // Register all unregistered V2 predictions on USDC
              const v2Predictions = redisPredictions.filter(p => 
                p.id.startsWith('pred_v2_') && 
                !p.resolved && 
                !p.cancelled &&
                !(p as any).usdcPoolEnabled
              );
              
              if (v2Predictions.length === 0) {
                alert('✅ All active V2 predictions are already registered on USDC!');
                return;
              }
              
              const predList = v2Predictions.map(p => `• ${p.id.replace('pred_v2_', '')}: ${p.question?.substring(0, 40)}...`).join('\n');
              
              if (!confirm(`💵 REGISTER ALL ON USDC\n\nThis will register ${v2Predictions.length} predictions on USDC DualPool contract.\n\nPredictions to register:\n${predList}\n\n⚠️ This requires ${v2Predictions.length} separate transactions!\n\nContinue?`)) {
                return;
              }
              
              alert(`Starting registration of ${v2Predictions.length} predictions...\nPlease confirm each transaction in your wallet.`);
              
              for (const pred of v2Predictions) {
                const numericId = parseInt(pred.id.replace('pred_v2_', ''));
                try {
                  writeContract({
                    address: USDC_DUALPOOL_CONTRACT_ADDRESS as `0x${string}`,
                    abi: USDC_DUALPOOL_ABI,
                    functionName: 'registerPrediction',
                    args: [BigInt(numericId), pred.creator as `0x${string}`, BigInt(pred.deadline)],
                  });
                } catch (e) {
                  console.error(`Failed to register ${numericId}:`, e);
                }
              }
            }}
            className="sync-btn ultra-compact-btn"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #10b981)',
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
            💵 Register All
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
            <span style={{ fontFamily: 'monospace', color: '#059669', fontSize: '14px', fontWeight: '700' }}>{stats.collectedFees.toFixed(4)} ETH</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: '600', color: 'rgba(0, 0, 0, 0.8)', fontSize: '12px' }}>$SWIPE Collected Fees:</span>
            <span style={{ fontFamily: 'monospace', color: '#059669', fontSize: '14px', fontWeight: '700' }}>{stats.collectedSwipeFees.toFixed(2)} SWIPE</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: '600', color: 'rgba(0, 0, 0, 0.8)', fontSize: '12px' }}>ETH Contract Balance:</span>
            <span style={{ fontFamily: 'monospace', color: '#059669', fontSize: '14px', fontWeight: '700' }}>{stats.contractBalance.toFixed(4)} ETH</span>
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
                justifyContent: 'center',
                gap: '8px',
                flexWrap: 'wrap'
              }}>
                {/* Register USDC button - only for V2 predictions not yet registered */}
                {typeof prediction.id === 'string' && prediction.id.startsWith('pred_v2_') && !(prediction as any).usdcPoolEnabled && (
                  <button
                    onClick={() => handleRegisterUsdc(prediction.id)}
                    style={{
                      background: 'linear-gradient(135deg, #3b82f6, #10b981)',
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
                    💵 Register USDC
                  </button>
                )}
                {(prediction as any).usdcPoolEnabled && (
                  <span style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: '#10b981',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: '600'
                  }}>
                    💵 USDC Active
                  </span>
                )}
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
                justifyContent: 'center',
                gap: '8px',
                flexWrap: 'wrap'
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
                  V2 Resolved ✅
                </button>
                
                {/* USDC Resolve Button - show for V2 predictions that are not USDC resolved */}
                {typeof prediction.id === 'string' && prediction.id.startsWith('pred_v2_') && !(prediction as any).usdcResolved && (
                  <button 
                    className="btn"
                    onClick={() => handleResolveUsdcOnly(prediction.id, prediction.outcome || false)}
                    style={{ 
                      background: 'linear-gradient(135deg, #2775ca, #1e5aa8)',
                      color: 'white',
                      cursor: 'pointer',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}
                  >
                    💵 Resolve USDC ({prediction.outcome ? 'YES' : 'NO'})
                  </button>
                )}
                
                {/* USDC Already Resolved */}
                {(prediction as any).usdcResolved && (
                  <button className="btn" style={{ 
                    background: '#c8e6c9', 
                    color: '#2e7d32',
                    cursor: 'not-allowed',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: '600'
                  }}>
                    💵 USDC Resolved ✅
                  </button>
                )}
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

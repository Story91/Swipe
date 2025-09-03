"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useReadContract, usePublicClient, useWriteContract } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../lib/contract';
import { useRedisPredictions } from '../../../lib/hooks/useRedisPredictions';

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
  onResolvePrediction: (predictionId: string | number, outcome: boolean) => void;
  onCancelPrediction: (predictionId: string | number, reason: string) => void;
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
  
  // Use Redis predictions hook to get all predictions
  const { predictions: redisPredictions, loading: predictionsLoading, error: predictionsError, refreshData } = useRedisPredictions();
  
  // Use Redis predictions if available, otherwise fall back to props
  const predictions = redisPredictions.length > 0 ? redisPredictions.map(p => ({
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
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'getContractStats',
  });

  // Get total predictions count
  const { data: totalPredictions } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'nextPredictionId',
  });

  // Fetch real predictions data
  const [realPredictions, setRealPredictions] = React.useState<Prediction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Categorize predictions
  // Use real data if available, fallback to props
  const displayPredictions = realPredictions.length > 0 ? realPredictions : predictions;
  
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
      if (!totalPredictions || totalPredictions <= 1) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const predictions: Prediction[] = [];

        for (let i = 1; i < totalPredictions; i++) {
          try {
            if (!publicClient) {
              throw new Error('Public client not available');
            }

            // Pobierz podstawowe informacje o predykcji
            const basicResult = await publicClient.readContract({
              address: CONTRACT_ADDRESS as `0x${string}`,
              abi: CONTRACT_ABI,
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
              address: CONTRACT_ADDRESS as `0x${string}`,
              abi: CONTRACT_ABI,
              functionName: 'getPredictionExtended',
              args: [BigInt(i)],
            }) as [string, bigint, boolean, bigint, boolean, boolean, bigint];

            // Pobierz statystyki rynku
            const marketStats = await publicClient.readContract({
              address: CONTRACT_ADDRESS as `0x${string}`,
              abi: CONTRACT_ABI,
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

  // Calculate real stats
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
      // Check if this is a Redis-based prediction (string ID starting with 'pred_') or on-chain prediction (number ID)
      if (typeof predictionId === 'string' && predictionId.startsWith('pred_')) {
        // This is a synced on-chain prediction - call the contract directly
        const numericId = parseInt(predictionId.replace('pred_', ''));
        console.log(`🔄 Resolving on-chain prediction ${predictionId} (numeric ID: ${numericId}) as ${side}`);
        onResolvePrediction(numericId, outcome);
      } else if (typeof predictionId === 'string') {
        // Handle pure Redis-based prediction (not synced from blockchain)
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
      // Check if this is a Redis-based prediction (string ID starting with 'pred_') or on-chain prediction (number ID)
      if (typeof predictionId === 'string' && predictionId.startsWith('pred_')) {
        // This is a synced on-chain prediction - call the contract directly
        const numericId = parseInt(predictionId.replace('pred_', ''));
        console.log(`🔄 Cancelling on-chain prediction ${predictionId} (numeric ID: ${numericId}): ${reason}`);
        onCancelPrediction(numericId, reason);
      } else if (typeof predictionId === 'string') {
        // Handle pure Redis-based prediction (not synced from blockchain)
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
    const numericId = typeof predictionId === 'string' && predictionId.startsWith('pred_') 
      ? parseInt(predictionId.replace('pred_', '')) 
      : typeof predictionId === 'number' ? predictionId : null;
    
    if (!numericId) {
      alert('❌ Invalid prediction ID for contract transaction');
      return;
    }

    if (confirm(`🚨 FORCE RESOLVE: Are you sure you want to resolve prediction ${numericId} as ${side} on the blockchain? This will execute a real transaction.`)) {
      try {
        writeContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'resolvePrediction',
          args: [BigInt(numericId), outcome],
        }, {
          onSuccess: async (tx) => {
            console.log(`✅ FORCE RESOLVE: Prediction ${numericId} resolved successfully:`, tx);
            alert(`✅ FORCE RESOLVE SUCCESS!\nPrediction ${numericId} resolved as ${side}\nTransaction: ${tx}\n\nSyncing with Redis...`);
            
            // Force sync with blockchain to update Redis immediately
            try {
              console.log('🔄 Syncing blockchain to Redis after FORCE RESOLVE...');
              const syncResponse = await fetch('/api/sync');
              if (syncResponse.ok) {
                console.log('✅ Redis sync successful after FORCE RESOLVE');
                alert(`✅ SYNC COMPLETE!\nPrediction ${numericId} resolved as ${side}\nTransaction: ${tx}\n\nRedis has been updated. Refreshing data...`);
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

    const numericId = typeof predictionId === 'string' && predictionId.startsWith('pred_') 
      ? parseInt(predictionId.replace('pred_', '')) 
      : typeof predictionId === 'number' ? predictionId : null;
    
    if (!numericId) {
      alert('❌ Invalid prediction ID for contract transaction');
      return;
    }

    if (confirm(`🚨 FORCE CANCEL: Are you sure you want to cancel prediction ${numericId} on the blockchain?\nReason: ${reason}\n\nThis will execute a real transaction.`)) {
      try {
        writeContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'cancelPrediction',
          args: [BigInt(numericId), reason],
        }, {
          onSuccess: async (tx) => {
            console.log(`✅ FORCE CANCEL: Prediction ${numericId} cancelled successfully:`, tx);
            alert(`✅ FORCE CANCEL SUCCESS!\nPrediction ${numericId} cancelled\nReason: ${reason}\nTransaction: ${tx}\n\nSyncing with Redis...`);
            
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

  const predictionsNeedingResolution = displayPredictions.filter(p => needsResolution(p));
  const livePredictions = displayPredictions.filter(p => !p.resolved && !p.cancelled && !needsResolution(p));

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
      {/* Header with Refresh Button */}
      <div className="admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>📊 Admin Dashboard</h2>
        <div className="refresh-controls" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <button 
            onClick={handleRefresh}
            className="refresh-btn"
            style={{
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              margin: '2px'
            }}
          >
            🔄 Refresh
          </button>
          <button 
            onClick={async () => {
              if (confirm('🔄 SYNC BLOCKCHAIN TO REDIS\n\nThis will sync all blockchain data to Redis. This may take a few minutes.\n\nContinue?')) {
                try {
                  alert('🔄 Starting blockchain sync... This may take a few minutes.');
                  const response = await fetch('/api/sync');
                  if (response.ok) {
                    const result = await response.json();
                    alert(`✅ SYNC COMPLETE!\n\nSynced: ${result.data.syncedCount} predictions\nStakes: ${result.data.totalStakesSynced}\nErrors: ${result.data.errorsCount}\n\nRefreshing data...`);
                    handleRefresh();
                  } else {
                    alert('❌ Sync failed. Check console for details.');
                  }
                } catch (error) {
                  console.error('Sync error:', error);
                  alert('❌ Sync failed. Check console for details.');
                }
              }
            }}
            className="sync-btn"
            style={{
              background: '#2196F3',
              color: 'white',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              margin: '2px'
            }}
          >
            🔄 Sync
          </button>
          <button 
            onClick={async () => {
              try {
                console.log('🔍 Testing API endpoints...');
                
                // Test predictions API
                const predictionsResponse = await fetch('/api/predictions');
                const predictionsData = await predictionsResponse.json();
                console.log('📊 Predictions API:', predictionsData);
                
                // Test stakes API for a specific prediction
                const stakesResponse = await fetch('/api/stakes?predictionId=pred_5&userId=0x123');
                const stakesData = await stakesResponse.json();
                console.log('💰 Stakes API:', stakesData);
                
                alert(`🔍 API TEST RESULTS:\n\nPredictions: ${predictionsData.success ? '✅' : '❌'} (${predictionsData.data?.length || 0} items)\nStakes: ${stakesData.success ? '✅' : '❌'} (${stakesData.data?.length || 0} items)\n\nCheck console for details.`);
              } catch (error) {
                console.error('API test error:', error);
                alert('❌ API test failed. Check console for details.');
              }
            }}
            className="test-btn"
            style={{
              background: '#FF9800',
              color: 'white',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              margin: '2px'
            }}
          >
            🔍 Test
          </button>
          <button 
            onClick={async () => {
              if (confirm('🔄 RESET CLAIMED STATUS\n\nThis will reset all claimed statuses in Redis to match blockchain state.\n\nThis is needed if claims were marked in Redis but not actually executed on blockchain.\n\nContinue?')) {
                try {
                  alert('🔄 Resetting claimed statuses...');
                  
                  // Get all predictions
                  const predictionsResponse = await fetch('/api/predictions');
                  const predictionsData = await predictionsResponse.json();
                  
                  if (predictionsData.success) {
                    let resetCount = 0;
                    
                    for (const prediction of predictionsData.data) {
                      if (prediction.id.startsWith('pred_') && prediction.resolved) {
                        // Get all stakes for this prediction
                        const stakesResponse = await fetch(`/api/stakes?predictionId=${prediction.id}`);
                        const stakesData = await stakesResponse.json();
                        
                        if (stakesData.success) {
                          for (const stake of stakesData.data) {
                            if (stake.claimed) {
                              // Reset claimed status
                              await fetch('/api/stakes', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  userId: stake.userId,
                                  predictionId: stake.predictionId,
                                  updates: { claimed: false }
                                }),
                              });
                              resetCount++;
                            }
                          }
                        }
                      }
                    }
                    
                    alert(`✅ RESET COMPLETE!\n\nReset ${resetCount} claimed statuses.\n\nNow sync blockchain to get correct state.`);
                  }
                } catch (error) {
                  console.error('Reset error:', error);
                  alert('❌ Reset failed. Check console for details.');
                }
              }
            }}
            className="reset-btn"
            style={{
              background: '#F44336',
              color: 'white',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              margin: '2px'
            }}
          >
            🔄 Reset
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{stats.totalPredictions}</div>
          <div className="stat-label">Total Predictions</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.needsResolution}</div>
          <div className="stat-label">Needs Resolution</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.collectedFees.toFixed(4)}</div>
          <div className="stat-label">ETH Collected Fees</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.contractBalance.toFixed(4)}</div>
          <div className="stat-label">ETH Contract Balance</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.platformFee}%</div>
          <div className="stat-label">Platform Fee</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.activeApprovers}</div>
          <div className="stat-label">Active Approvers</div>
        </div>
      </div>

      {/* Admin Controls */}
      <div className="admin-controls">
        <h3 className="admin-title">🛠️ Global Controls</h3>
        <div className="action-buttons">
          <button className="btn btn-resolve" onClick={onCreatePrediction}>
            ➕ Create Prediction
          </button>
          <button className="btn btn-approve" onClick={onManageApprovers}>
            👥 Manage Approvers
          </button>
          <button className="btn btn-cancel" onClick={onWithdrawFees}>
            💰 Withdraw Fees
          </button>
          <button className="btn btn-reject" onClick={onPauseContract}>
            ⏸️ Pause Contract
          </button>
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
        {resolvedPredictions.map((prediction) => {
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
        {cancelledPredictions.map((prediction) => {
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
        {expiredPredictions.map((prediction) => {
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

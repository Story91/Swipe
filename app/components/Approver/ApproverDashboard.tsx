"use client";

import React from 'react';
import { useReadContract, usePublicClient, useAccount } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../lib/contract';

interface Prediction {
  id: number;
  question: string;
  category: string;
  description?: string;
  creator: string;
  createdAt: number;
  approvalCount: number;
  requiredApprovals: number;
  hasUserApproved?: boolean;
  isRejected?: boolean;
  rejectionReason?: string;
}

interface ApproverDashboardProps {
  predictions: Prediction[];
  onApprovePrediction: (predictionId: number) => void;
  onRejectPrediction: (predictionId: number, reason: string) => void;
}

export function ApproverDashboard({
  predictions,
  onApprovePrediction,
  onRejectPrediction
}: ApproverDashboardProps) {

  const publicClient = usePublicClient();
  const { address } = useAccount();

  // Get required approvals from contract
  const { data: requiredApprovals } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'requiredApprovals',
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
            // Get basic prediction info
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

            // Get extended info
            const extendedResult = await publicClient.readContract({
              address: CONTRACT_ADDRESS as `0x${string}`,
              abi: CONTRACT_ABI,
              functionName: 'getPredictionExtended',
              args: [BigInt(i)],
            }) as [string, bigint, boolean, bigint, boolean, boolean, bigint];

            // Get approval info
            let approvalCount = 0;
            let hasUserApproved = false;
            let isRejected = false;
            let rejectionReason = '';

            try {
              // Get approval count
              const approvalCountResult = await publicClient.readContract({
                address: CONTRACT_ADDRESS as `0x${string}`,
                abi: CONTRACT_ABI,
                functionName: 'getApprovalCount',
                args: [BigInt(i)],
              }) as bigint;
              approvalCount = Number(approvalCountResult);

              // Check if user has approved (if address is available)
              if (address) {
                const userApprovalResult = await publicClient.readContract({
                  address: CONTRACT_ADDRESS as `0x${string}`,
                  abi: CONTRACT_ABI,
                  functionName: 'hasUserApproved',
                  args: [BigInt(i), address as `0x${string}`],
                }) as boolean;
                hasUserApproved = userApprovalResult;
              }

              // Check if rejected
              const rejectedResult = await publicClient.readContract({
                address: CONTRACT_ADDRESS as `0x${string}`,
                abi: CONTRACT_ABI,
                functionName: 'isPredictionRejected',
                args: [BigInt(i)],
              }) as boolean;
              isRejected = rejectedResult;

              if (isRejected) {
                // Get rejection reason
                const reasonResult = await publicClient.readContract({
                  address: CONTRACT_ADDRESS as `0x${string}`,
                  abi: CONTRACT_ABI,
                  functionName: 'getRejectionReason',
                  args: [BigInt(i)],
                }) as string;
                rejectionReason = reasonResult;
              }
            } catch (approvalError) {
              console.warn(`Could not fetch approval data for prediction ${i}:`, approvalError);
            }

            const prediction: Prediction = {
              id: i,
              question: basicResult.question,
              description: basicResult.description,
              category: basicResult.category,
              creator: basicResult.creator,
              createdAt: Number(extendedResult[3]),
              approvalCount,
              requiredApprovals: requiredApprovals ? Number(requiredApprovals) : 3,
              hasUserApproved,
              isRejected,
              rejectionReason
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
  }, [totalPredictions, requiredApprovals, address, publicClient]);

  // Use real data if available, fallback to props
  const displayPredictions = realPredictions.length > 0 ? realPredictions : predictions;

  const stats = {
    pendingApproval: displayPredictions.filter(p => !p.isRejected && p.approvalCount < p.requiredApprovals).length,
    userApproved: displayPredictions.filter(p => p.hasUserApproved).length,
    userRejected: displayPredictions.filter(p => p.isRejected).length,
    requiredApprovals: requiredApprovals ? Number(requiredApprovals) : 3 // Default to 3 if not loaded
  };

  const handleApprove = (predictionId: number) => {
    if (confirm('Are you sure you want to approve this prediction?')) {
      onApprovePrediction(predictionId);
    }
  };

  const handleReject = (predictionId: number) => {
    const reason = prompt('Reason for rejection:');
    if (reason) {
      onRejectPrediction(predictionId, reason);
    }
  };

  const getStatusBadge = (prediction: Prediction) => {
    if (prediction.isRejected) return <span className="status-badge status-cancelled">🚫 REJECTED</span>;
    if (prediction.approvalCount >= prediction.requiredApprovals) return <span className="status-badge status-live">🔴 LIVE</span>;
    if (prediction.hasUserApproved) return <span className="status-badge status-pending">⏳ WAITING</span>;
    return <span className="status-badge status-pending">⏳ NEEDS APPROVAL</span>;
  };

  const getTimeAgo = (timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;

    const hours = Math.floor(diff / 3600);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  const pendingPredictions = displayPredictions.filter(p => !p.isRejected && p.approvalCount < p.requiredApprovals);
  const approvedByUser = displayPredictions.filter(p => p.hasUserApproved);
  const rejectedPredictions = displayPredictions.filter(p => p.isRejected);

  if (loading) {
    return (
      <div className="approver-dashboard">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>Loading approver data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="approver-dashboard">
        <div style={{ textAlign: 'center', padding: '40px', color: 'red' }}>
          <div>❌ Failed to load approver data</div>
          <div style={{ fontSize: '14px', marginTop: '10px' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="approver-dashboard">
      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{stats.pendingApproval}</div>
          <div className="stat-label">Pending Approval</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.userApproved}</div>
          <div className="stat-label">You Approved</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.userRejected}</div>
          <div className="stat-label">You Rejected</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.requiredApprovals}/2</div>
          <div className="stat-label">Required Approvals</div>
        </div>
      </div>

      {/* Predictions Grid */}
      <div className="predictions-grid">
        {/* Pending Approval */}
        {pendingPredictions.map((prediction) => {
          const progressPercentage = (prediction.approvalCount / prediction.requiredApprovals) * 100;

          return (
            <div key={prediction.id} className="prediction-card">
              <div className="card-header">
                <span className="category-badge">{prediction.category}</span>
                {getStatusBadge(prediction)}
              </div>
              <div className="prediction-question">{prediction.question}</div>

              <div className="prediction-details">
                <strong>📝 Description:</strong><br />
                <small>{prediction.description || 'No description provided'}</small><br /><br />
                <strong>👤 Created by:</strong> {prediction.creator.slice(0, 6)}...{prediction.creator.slice(-4)}<br />
                <strong>⏰ Created:</strong> {getTimeAgo(prediction.createdAt)}
              </div>

              <div className="approval-section">
                <div className="approval-progress">
                  <span>Approval Progress:</span>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${progressPercentage}%` }}
                    ></div>
                  </div>
                  <span>{prediction.approvalCount}/{prediction.requiredApprovals}</span>
                </div>
                <small>
                  {prediction.approvalCount === 0 ? '❌ No approvals yet' :
                   prediction.hasUserApproved ? '✅ You approved • ⏳ Waiting for others' :
                   `✅ ${prediction.approvalCount} approved • ⏳ Waiting for your approval`}
                </small>
              </div>

              {!prediction.hasUserApproved && (
                <div className="action-buttons">
                  <button
                    className="btn btn-approve"
                    onClick={() => handleApprove(prediction.id)}
                  >
                    ✅ Approve
                  </button>
                  <button
                    className="btn btn-reject"
                    onClick={() => handleReject(prediction.id)}
                  >
                    ❌ Reject
                  </button>
                </div>
              )}

              {prediction.hasUserApproved && (
                <div className="already-approved">
                  <p>✅ You already approved this prediction</p>
                  <small>Waiting for {prediction.requiredApprovals - prediction.approvalCount} more approval{prediction.requiredApprovals - prediction.approvalCount > 1 ? 's' : ''}</small>
                </div>
              )}
            </div>
          );
        })}

        {/* Recently Rejected */}
        {rejectedPredictions.slice(0, 2).map((prediction) => (
          <div key={prediction.id} className="prediction-card" style={{ opacity: 0.7 }}>
            <div className="card-header">
              <span className="category-badge">{prediction.category}</span>
              <span className="status-badge status-cancelled">🚫 REJECTED</span>
            </div>
            <div className="prediction-question">{prediction.question}</div>

            <div className="rejection-details">
              <strong>❌ Rejected:</strong><br />
              <small>{prediction.rejectionReason || 'No reason provided'}</small><br />
              <strong>⏰ Rejected:</strong> {getTimeAgo(prediction.createdAt + 3600)}<br />
              <small>Creator received refund of creation fee</small>
            </div>

            <div className="rejection-success">
              <p>✅ Successfully rejected - creator refunded creation fee</p>
            </div>
          </div>
        ))}

        {/* Approved by User */}
        {approvedByUser.slice(0, 2).map((prediction) => (
          <div key={prediction.id} className="prediction-card">
            <div className="card-header">
              <span className="category-badge">{prediction.category}</span>
              <span className="status-badge status-live">🔴 LIVE</span>
            </div>
            <div className="prediction-question">{prediction.question}</div>

            <div className="prediction-details">
              <strong>📝 Description:</strong><br />
              <small>{prediction.description || 'No description provided'}</small><br /><br />
              <strong>👤 Created by:</strong> {prediction.creator.slice(0, 6)}...{prediction.creator.slice(-4)}<br />
              <strong>⏰ Created:</strong> {getTimeAgo(prediction.createdAt)}
            </div>

            <div className="approval-success">
              <strong>✅ You Approved This!</strong><br />
              <small>Prediction is now live and accepting bets</small>
            </div>

            <div className="live-stats">
              <div className="stat-item">
                <div className="stat-value">0.0 ETH</div>
                <div>YES Pool</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">0.0 ETH</div>
                <div>NO Pool</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">0</div>
                <div>Bets Placed</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

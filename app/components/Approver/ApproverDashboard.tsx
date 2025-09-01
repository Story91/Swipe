"use client";

import React from 'react';
import { useReadContract } from 'wagmi';
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

  // Get required approvals from contract
  const { data: requiredApprovals } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'requiredApprovals',
  });

  const stats = {
    pendingApproval: predictions.filter(p => !p.isRejected && p.approvalCount < p.requiredApprovals).length,
    userApproved: predictions.filter(p => p.hasUserApproved).length,
    userRejected: predictions.filter(p => p.isRejected).length,
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

  const pendingPredictions = predictions.filter(p => !p.isRejected && p.approvalCount < p.requiredApprovals);
  const approvedByUser = predictions.filter(p => p.hasUserApproved);
  const rejectedPredictions = predictions.filter(p => p.isRejected);

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

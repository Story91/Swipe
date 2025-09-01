"use client";

import React from 'react';
import { useReadContract } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../lib/contract';

interface Prediction {
  id: number;
  question: string;
  category: string;
  yesTotalAmount: number;
  noTotalAmount: number;
  deadline: number;
  resolved: boolean;
  outcome?: boolean;
  cancelled?: boolean;
  participants: number;
  resolutionDeadline?: number;
}

interface AdminDashboardProps {
  predictions: Prediction[];
  onResolvePrediction: (predictionId: number, outcome: boolean) => void;
  onCancelPrediction: (predictionId: number, reason: string) => void;
  onCreatePrediction: () => void;
  onManageApprovers: () => void;
  onWithdrawFees: () => void;
  onPauseContract: () => void;
}

export function AdminDashboard({
  predictions,
  onResolvePrediction,
  onCancelPrediction,
  onCreatePrediction,
  onManageApprovers,
  onWithdrawFees,
  onPauseContract
}: AdminDashboardProps) {

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

  // Helper function to check if prediction needs resolution
  const needsResolution = (prediction: Prediction) => {
    if (prediction.resolved || prediction.cancelled) return false;
    if (!prediction.resolutionDeadline) return false;
    return Date.now() / 1000 > prediction.resolutionDeadline;
  };

  // Calculate real stats
  const stats = {
    totalPredictions: totalPredictions ? Number(totalPredictions) - 1 : predictions.length,
    needsResolution: predictions.filter(p => needsResolution(p)).length,
    collectedFees: contractStats && contractStats[2] ? Number(contractStats[2]) / 1e18 : 0, // Convert from wei to ETH
    activeApprovers: 5, // TODO: Add function to get active approvers count
    contractBalance: contractStats && contractStats[5] ? Number(contractStats[5]) / 1e18 : 0,
    platformFee: contractStats && contractStats[1] ? Number(contractStats[1]) / 100 : 1 // Convert to percentage
  };

  const handleResolve = (predictionId: number, outcome: boolean) => {
    const side = outcome ? 'YES' : 'NO';
    if (confirm(`Are you sure you want to resolve this prediction as ${side}?`)) {
      onResolvePrediction(predictionId, outcome);
    }
  };

  const handleCancel = (predictionId: number) => {
    const reason = prompt('Reason for emergency cancellation:');
    if (reason) {
      onCancelPrediction(predictionId, reason);
    }
  };

  const getStatusBadge = (prediction: Prediction) => {
    if (needsResolution(prediction)) return <span className="status-badge status-live">🔴 NEEDS RESOLUTION</span>;
    if (prediction.cancelled) return <span className="status-badge status-cancelled">🚫 CANCELLED</span>;
    if (prediction.resolved) return <span className="status-badge status-resolved">✅ RESOLVED</span>;
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

  const predictionsNeedingResolution = predictions.filter(p => needsResolution(p));
  const livePredictions = predictions.filter(p => !p.resolved && !p.cancelled && !needsResolution(p));
  const resolvedPredictions = predictions.filter(p => p.resolved);

  return (
    <div className="admin-dashboard">
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
        {/* Needs Resolution */}
        {predictionsNeedingResolution.map((prediction) => {
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
            </div>
          );
        })}

        {/* Resolved Predictions */}
        {resolvedPredictions.slice(0, 2).map((prediction) => {
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

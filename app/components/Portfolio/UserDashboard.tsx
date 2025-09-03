"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../lib/contract';
import { ethers } from 'ethers';

// Transaction history utilities
interface TransactionRecord {
  id: string;
  type: 'stake' | 'claim' | 'approve' | 'reject' | 'resolve' | 'cancel';
  predictionId: number;
  predictionTitle: string;
  amount?: number;
  outcome?: boolean;
  reason?: string;
  txHash?: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
}

// Notification system
interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: number;
  duration?: number;
}

const saveNotification = (notification: Notification) => {
  if (typeof window === 'undefined') return;

  const existing = JSON.parse(localStorage.getItem('dexter_notifications') || '[]');
  const updated = [notification, ...existing].slice(0, 20); // Keep last 20 notifications
  localStorage.setItem('dexter_notifications', JSON.stringify(updated));
};

const showNotification = (
  type: Notification['type'],
  title: string,
  message: string,
  duration: number = 5000
) => {
  const notification: Notification = {
    id: `notification_${Date.now()}`,
    type,
    title,
    message,
    timestamp: Date.now(),
    duration
  };

  saveNotification(notification);

  // Trigger custom event for UI updates
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dexter-notification', { detail: notification }));
  }

  return notification;
};

const saveTransaction = (transaction: TransactionRecord) => {
  if (typeof window === 'undefined') return;

  const existing = JSON.parse(localStorage.getItem('dexter_transactions') || '[]');
  const updated = [transaction, ...existing].slice(0, 100); // Keep last 100 transactions
  localStorage.setItem('dexter_transactions', JSON.stringify(updated));
};

const getTransactions = (): TransactionRecord[] => {
  if (typeof window === 'undefined') return [];
  return JSON.parse(localStorage.getItem('dexter_transactions') || '[]');
};

const updateTransactionStatus = (txHash: string, status: 'confirmed' | 'failed') => {
  if (typeof window === 'undefined') return;

  const transactions = getTransactions();
  const updated = transactions.map(tx =>
    tx.txHash === txHash ? { ...tx, status } : tx
  );
  localStorage.setItem('dexter_transactions', JSON.stringify(updated));
};

// UI-specific prediction interface (converts bigint to number for easier handling)
interface Prediction {
  id: number;
  question: string;
  description: string;
  category: string;
  yesTotalAmount: number;
  noTotalAmount: number;
  deadline: number;
  resolved: boolean;
  outcome: boolean;
  approved: boolean;
  creator: string;
  imageUrl: string;
  resolutionDeadline: number;
  cancelled: boolean;
  createdAt: number;
  verified: boolean;
  needsApproval: boolean;
  approvalCount: number;
  requiredApprovals: number;
  participants: number;
  userYesStake: number;
  userNoStake: number;
  potentialPayout: number;
  potentialProfit: number;
  hasUserApproved?: boolean;
  isRejected?: boolean;
  rejectionReason?: string;
}

interface UserDashboardProps {
  predictions: Prediction[];
  onClaimReward: (predictionId: number) => void;
}

export function UserDashboard({ predictions, onClaimReward }: UserDashboardProps) {
  const { address } = useAccount();
  const [selectedStakeAmounts, setSelectedStakeAmounts] = useState<{ [key: number]: number }>({});
  const [realPredictions, setRealPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [transactionHistory, setTransactionHistory] = useState<TransactionRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const publicClient = usePublicClient();

  // Pobierz liczbę predykcji
  const { data: nextPredictionId } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'nextPredictionId',
  });

  // Hook do pisania do kontraktu
  const { writeContract } = useWriteContract();

  const setStakeAmount = (predictionId: number, amount: number) => {
    setSelectedStakeAmounts(prev => ({ ...prev, [predictionId]: amount }));
  };

  const calculatePotentialPayout = (prediction: Prediction, stakeAmount: number, isYes: boolean) => {
    const yesPool = prediction.yesTotalAmount + (isYes ? stakeAmount : 0);
    const noPool = prediction.noTotalAmount + (!isYes ? stakeAmount : 0);

    if (isYes) {
      const payoutRatio = noPool / yesPool;
      const payout = stakeAmount * (1 + payoutRatio);
      const profit = payout - stakeAmount;
      return { payout, profit };
    } else {
      const payoutRatio = yesPool / noPool;
      const payout = stakeAmount * (1 + payoutRatio);
      const profit = payout - stakeAmount;
      return { payout, profit };
    }
  };

  // Use predictions from Redis props instead of fetching from RPC
  useEffect(() => {
    if (predictions && predictions.length > 0) {
      setRealPredictions(predictions);
      setLoading(false);
    }
  }, [predictions]);

  // Legacy function - now just uses props from Redis
  const fetchPredictions = useCallback(async () => {
    // No longer needed - using props from Redis
    return;
  }, []);

  // No longer need RPC calls - using Redis data

  // Load transaction history on mount
  useEffect(() => {
    const transactions = getTransactions();
    setTransactionHistory(transactions);
  }, []);

  const handleStakeBet = (predictionId: number, isYes: boolean) => {
    const amount = selectedStakeAmounts[predictionId] || 0;
    if (amount < 0.001) {
      alert('❌ Minimum stake is 0.001 ETH');
      return;
    }
    if (amount > 100) {
      alert('❌ Maximum stake is 100 ETH');
      return;
    }

    const side = isYes ? 'YES' : 'NO';

    // Find prediction title for transaction record
    const prediction = realPredictions.find(p => p.id === predictionId);
    const predictionTitle = prediction?.question || `Prediction #${predictionId}`;

    // Save transaction to localStorage
    const transactionRecord: TransactionRecord = {
      id: `stake_${Date.now()}`,
      type: 'stake',
      predictionId,
      predictionTitle,
      amount,
      outcome: isYes,
      timestamp: Date.now(),
      status: 'pending'
    };
    saveTransaction(transactionRecord);

    // Użyj prawdziwej transakcji zamiast mock
    writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'placeStake',
      args: [BigInt(predictionId), isYes],
      value: ethers.parseEther(amount.toString()),
    }, {
      onSuccess: (txHash) => {
        console.log(`✅ Stake placed successfully on ${side} for prediction ${predictionId}`);

        // Update transaction with hash and status
        if (txHash) {
          updateTransactionStatus(txHash, 'confirmed');
        }

        // Show success notification
        showNotification(
          'success',
          '🎯 Stake Placed Successfully!',
          `You staked ${amount} ETH on ${side} for "${predictionTitle}"`
        );

        // Auto-refresh data after successful transaction
        setTimeout(() => {
          // Data will be refreshed via props from Redis
          if (onClaimReward) {
            // Trigger a refresh by calling the parent's refresh function
            console.log('🔄 Refreshing data after successful stake');
          }
        }, 2000); // Wait 2 seconds for transaction to be mined
      },
      onError: (error) => {
        console.error('❌ Stake transaction failed:', error);

        // Update transaction status to failed
        const transactions = getTransactions();
        const failedTx = transactions.find(tx => tx.id === transactionRecord.id);
        if (failedTx) {
          updateTransactionStatus(failedTx.txHash!, 'failed');
        }

        // Show error notification
        showNotification(
          'error',
          '❌ Stake Failed',
          'Transaction failed. Please try again.'
        );
      }
    });
  };

  const getStatusBadge = (prediction: Prediction) => {
    if (prediction.cancelled) return <span className="status-badge status-cancelled">🚫 CANCELLED</span>;
    if (prediction.resolved) return <span className="status-badge status-resolved">✅ RESOLVED</span>;
    if (prediction.needsApproval) return <span className="status-badge status-pending">⏳ PENDING</span>;
    return <span className="status-badge status-live">🔴 LIVE</span>;
  };

  const getTimeRemaining = (deadline: number) => {
    const now = Date.now() / 1000;
    const remaining = deadline - now;

    if (remaining <= 0) return "⏰ Ended";

    const days = Math.floor(remaining / (24 * 60 * 60));
    const hours = Math.floor((remaining % (24 * 60 * 60)) / (60 * 60));

    if (days > 0) return `⏰ ${days} days, ${hours} hours remaining`;
    return `⏰ ${hours} hours remaining`;
  };

  // Użyj prawdziwych danych z kontraktu lub fallback do prop
  const displayPredictions = realPredictions.length > 0 ? realPredictions : predictions;

  const totalStats = {
    activePredictions: displayPredictions.filter(p => !p.resolved && !p.cancelled).length,
    totalPool: displayPredictions.reduce((sum, p) => sum + p.yesTotalAmount + p.noTotalAmount, 0),
    userStakes: displayPredictions.reduce((sum, p) => sum + p.userYesStake + p.userNoStake, 0),
    potentialProfit: displayPredictions.reduce((sum, p) => sum + (p.potentialProfit || 0), 0)
  };

  return (
    <div className="user-dashboard">
      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{totalStats.activePredictions}</div>
          <div className="stat-label">Active Predictions</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{totalStats.totalPool.toFixed(1)}</div>
          <div className="stat-label">ETH Total Pool</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{totalStats.userStakes.toFixed(2)}</div>
          <div className="stat-label">Your Stakes</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">+{totalStats.potentialProfit.toFixed(2)}</div>
          <div className="stat-label">Potential Profit</div>
        </div>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div>Loading predictions from blockchain...</div>
        </div>
      )}

      {/* Predictions Grid */}
      <div className="predictions-grid">
        {displayPredictions.map((prediction) => {
          const totalPool = prediction.yesTotalAmount + prediction.noTotalAmount;
          const yesPercentage = totalPool > 0 ? (prediction.yesTotalAmount / totalPool) * 100 : 0;
          const stakeAmount = selectedStakeAmounts[prediction.id] || 0;

          return (
            <div key={prediction.id} className="prediction-card">
              <div className="card-header">
                <span className="category-badge">{prediction.category}</span>
                {getStatusBadge(prediction)}
              </div>

              <div className="prediction-question">{prediction.question}</div>

              {!prediction.needsApproval && (
                <>
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
                </>
              )}

              {(prediction.userYesStake > 0 || prediction.userNoStake > 0) && (
                <div className="user-stakes">
                  <strong>Your Current Stakes:</strong>
                  <div className="stake-info">
                    <span>YES:</span>
                    <span>{prediction.userYesStake.toFixed(3)} ETH</span>
                  </div>
                  <div className="stake-info">
                    <span>NO:</span>
                    <span>{prediction.userNoStake.toFixed(3)} ETH</span>
                  </div>
                  {prediction.potentialPayout && (
                    <div className="potential-payout">
                      💰 Current Potential: <strong>{prediction.potentialPayout.toFixed(4)} ETH</strong>
                      <br />
                      <small>(+{(prediction.potentialProfit || 0).toFixed(4)} ETH profit)</small>
                    </div>
                  )}
                </div>
              )}

              {prediction.needsApproval && (
                <div className="approval-section">
                  <div className="approval-progress">
                    <span>Approval Progress:</span>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${((prediction.approvalCount || 0) / (prediction.requiredApprovals || 1)) * 100}%`
                        }}
                      ></div>
                    </div>
                    <span>{prediction.approvalCount || 0}/{prediction.requiredApprovals || 1}</span>
                  </div>
                  <small>⏳ Waiting for community approval before going live...</small>
                </div>
              )}

              {!prediction.resolved && !prediction.cancelled && !prediction.needsApproval && (
                <>
                  <div className="stake-input-section">
                    <div className="stake-input-group">
                      <input
                        type="number"
                        className="stake-input"
                        placeholder="0.1"
                        step="0.01"
                        min="0.001"
                        max="100"
                        value={selectedStakeAmounts[prediction.id] || ''}
                        onChange={(e) => setStakeAmount(prediction.id, parseFloat(e.target.value) || 0)}
                      />
                      <span className="eth-label">ETH</span>
                    </div>

                    <div className="quick-amounts">
                      {[0.01, 0.1, 0.5, 1, 2].map(amount => (
                        <button
                          key={amount}
                          className="quick-amount-btn"
                          onClick={() => setStakeAmount(prediction.id, amount)}
                        >
                          {amount}
                        </button>
                      ))}
                    </div>

                    {stakeAmount >= 0.001 && (
                      <div className="stake-preview">
                        <div className="preview-line">
                          <span>Your stake:</span>
                          <span>{stakeAmount} ETH</span>
                        </div>
                        <div className="preview-line">
                          <span>If YES wins:</span>
                          <span>+{calculatePotentialPayout(prediction, stakeAmount, true).profit.toFixed(4)} ETH profit</span>
                        </div>
                        <div className="preview-line">
                          <span>If NO wins:</span>
                          <span>-{stakeAmount} ETH (lose stake)</span>
                        </div>
                        <div className="preview-line preview-total">
                          <span>Potential payout:</span>
                          <span>{calculatePotentialPayout(prediction, stakeAmount, true).payout.toFixed(4)} ETH</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="time-remaining">{getTimeRemaining(prediction.deadline)}</div>

                  <div className="action-buttons">
                    <button
                      className="btn btn-yes"
                      onClick={() => handleStakeBet(prediction.id, true)}
                    >
                      👍 Stake YES
                    </button>
                    <button
                      className="btn btn-no"
                      onClick={() => handleStakeBet(prediction.id, false)}
                    >
                      👎 Stake NO
                    </button>
                  </div>
                </>
              )}

              {prediction.resolved && !prediction.cancelled && (
                <div className="action-buttons">
                  <button
                    className="btn btn-resolve"
                    onClick={() => onClaimReward(prediction.id)}
                  >
                    💰 Claim Reward
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Transaction History Section */}
      <div className="transaction-history-section">
        <div className="history-header">
          <h3>📊 Transaction History</h3>
          <button
            className="btn-history-toggle"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? 'Hide' : 'Show'} History ({transactionHistory.length})
          </button>
        </div>

        {showHistory && (
          <div className="transaction-list">
            {transactionHistory.length === 0 ? (
              <div className="no-transactions">
                <p>📝 No transactions yet. Start by staking on a prediction!</p>
              </div>
            ) : (
              transactionHistory.map((tx) => (
                <div key={tx.id} className={`transaction-item ${tx.status}`}>
                  <div className="transaction-icon">
                    {tx.type === 'stake' ? '💰' : tx.type === 'claim' ? '🎉' : '⚡'}
                  </div>
                  <div className="transaction-details">
                    <div className="transaction-type">
                      {tx.type.toUpperCase()}
                      {tx.outcome !== undefined && (
                        <span className={`outcome-badge ${tx.outcome ? 'yes' : 'no'}`}>
                          {tx.outcome ? 'YES' : 'NO'}
                        </span>
                      )}
                    </div>
                    <div className="transaction-prediction">{tx.predictionTitle}</div>
                    <div className="transaction-meta">
                      {tx.amount && <span>{tx.amount} ETH</span>}
                      <span>{new Date(tx.timestamp).toLocaleString()}</span>
                      <span className={`status-badge status-${tx.status}`}>
                        {tx.status === 'confirmed' ? '✅' : tx.status === 'pending' ? '⏳' : '❌'} {tx.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Notification Component
const NotificationSystem: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    // Wyczyść stare notyfikacje przy starcie aplikacji
    localStorage.removeItem('dexter_notifications');

    // Listen for new notifications
    const handleNewNotification = (event: CustomEvent<Notification>) => {
      setNotifications(prev => [event.detail, ...prev].slice(0, 5)); // Show max 5 notifications
    };

    window.addEventListener('dexter-notification', handleNewNotification as EventListener);

    return () => {
      window.removeEventListener('dexter-notification', handleNewNotification as EventListener);
    };
  }, []);

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  if (notifications.length === 0) return null;

  return (
    <div className="notification-container">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRemove={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
};

const NotificationItem: React.FC<{
  notification: Notification;
  onRemove: () => void;
}> = ({ notification, onRemove }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const duration = notification.duration || 5000;
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onRemove, 300); // Remove after animation
    }, duration);

    return () => clearTimeout(timer);
  }, [notification.duration, onRemove]);

  const getIcon = () => {
    switch (notification.type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📢';
    }
  };

  const getBorderColor = () => {
    switch (notification.type) {
      case 'success': return '#10b981';
      case 'error': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'info': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  return (
    <div
      className={`notification-item ${notification.type} ${isVisible ? 'visible' : 'hidden'}`}
      style={{ borderLeftColor: getBorderColor() }}
    >
      <div className="notification-icon">{getIcon()}</div>
      <div className="notification-content">
        <div className="notification-title">{notification.title}</div>
        <div className="notification-message">{notification.message}</div>
      </div>
      <button className="notification-close" onClick={() => setIsVisible(false)}>
        ✕
      </button>
    </div>
  );
};

// Export components
export { NotificationSystem };
export { showNotification };

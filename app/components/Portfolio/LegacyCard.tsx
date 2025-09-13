"use client";

import React from 'react';
import { RedisPrediction } from '../../../lib/types/redis';
import './LegacyCard.css';

interface LegacyCardProps {
  prediction: RedisPrediction & {
    userStakes?: {
      ETH?: {
        predictionId: string;
        yesAmount: number;
        noAmount: number;
        claimed: boolean;
        potentialPayout: number;
        potentialProfit: number;
        canClaim: boolean;
        isWinner: boolean;
      };
      SWIPE?: {
        predictionId: string;
        yesAmount: number;
        noAmount: number;
        claimed: boolean;
        potentialPayout: number;
        potentialProfit: number;
        canClaim: boolean;
        isWinner: boolean;
      };
    };
    status: 'active' | 'resolved' | 'expired' | 'cancelled';
  };
  onClaimReward: (predictionId: string, tokenType?: 'ETH' | 'SWIPE') => void;
  isTransactionLoading: boolean;
}

export function LegacyCard({ prediction, onClaimReward, isTransactionLoading }: LegacyCardProps) {
  const formatEth = (wei: number): string => {
    return (wei / Math.pow(10, 18)).toFixed(6);
  };

  const formatTimeLeft = (deadline: number): string => {
    const now = Math.floor(Date.now() / 1000);
    const timeLeft = deadline - now;
    
    if (timeLeft <= 0) return 'Expired';
    
    const days = Math.floor(timeLeft / 86400);
    const hours = Math.floor((timeLeft % 86400) / 3600);
    const minutes = Math.floor((timeLeft % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active': return '#d4ff00';
      case 'resolved': return '#00ff88';
      case 'expired': return '#ff6b6b';
      case 'cancelled': return '#ffa500';
      default: return '#666';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'active': return '⏳';
      case 'resolved': return '✅';
      case 'expired': return '⏰';
      case 'cancelled': return '❌';
      default: return '❓';
    }
  };

  return (
    <div className="legacy-card">
      {/* Legacy Badge */}
      <div className="legacy-badge">
        <span className="legacy-icon">🏛️</span>
        <span className="legacy-text">Legacy V1</span>
      </div>

      {/* Prediction Header */}
      <div className="legacy-card-header">
        <h3 className="legacy-question">{prediction.question}</h3>
        <div className="legacy-status">
          <span 
            className="legacy-status-icon"
            style={{ color: getStatusColor(prediction.status) }}
          >
            {getStatusIcon(prediction.status)}
          </span>
          <span 
            className="legacy-status-text"
            style={{ color: getStatusColor(prediction.status) }}
          >
            {prediction.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Prediction Details */}
      <div className="legacy-card-body">
        <p className="legacy-description">{prediction.description}</p>
        
        <div className="legacy-meta">
          <div className="legacy-meta-item">
            <span className="legacy-meta-label">Category:</span>
            <span className="legacy-meta-value">{prediction.category}</span>
          </div>
          <div className="legacy-meta-item">
            <span className="legacy-meta-label">Creator:</span>
            <span className="legacy-meta-value">
              {prediction.creator.slice(0, 6)}...{prediction.creator.slice(-4)}
            </span>
          </div>
          <div className="legacy-meta-item">
            <span className="legacy-meta-label">Deadline:</span>
            <span className="legacy-meta-value">
              {new Date(prediction.deadline * 1000).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Market Stats */}
        <div className="legacy-market-stats">
          <div className="legacy-pool-info">
            <div className="legacy-pool-item">
              <span className="legacy-pool-label">YES Pool:</span>
              <span className="legacy-pool-value">{formatEth(prediction.yesTotalAmount)} ETH</span>
            </div>
            <div className="legacy-pool-item">
              <span className="legacy-pool-label">NO Pool:</span>
              <span className="legacy-pool-value">{formatEth(prediction.noTotalAmount)} ETH</span>
            </div>
          </div>
          
        </div>

        {/* User Stake Info - ETH */}
        {prediction.userStakes?.ETH && (prediction.userStakes.ETH.yesAmount > 0 || prediction.userStakes.ETH.noAmount > 0) && (
          <div className="legacy-stake-info">
            <div className="legacy-stake-header">
              <h4 className="legacy-stake-title">ETH Stake</h4>
              <div className="legacy-stake-amounts">
                {prediction.userStakes.ETH.yesAmount > 0 && (
                  <span className="legacy-stake-amount yes">
                    YES: {formatEth(prediction.userStakes.ETH.yesAmount)} ETH
                  </span>
                )}
                {prediction.userStakes.ETH.noAmount > 0 && (
                  <span className="legacy-stake-amount no">
                    NO: {formatEth(prediction.userStakes.ETH.noAmount)} ETH
                  </span>
                )}
              </div>
            </div>

            {/* ETH Payout Info */}
            <div className="legacy-payout-info">
              <div className="legacy-payout-item">
                <span className="legacy-payout-label">ETH Potential Payout:</span>
                <span className="legacy-payout-value potential-payout">
                  {formatEth(prediction.userStakes.ETH.potentialPayout)} ETH
                </span>
              </div>
              <div className="legacy-payout-item">
                <span className="legacy-payout-label">ETH Potential Profit:</span>
                <span className={`legacy-payout-value ${prediction.userStakes.ETH.potentialProfit >= 0 ? 'positive' : 'negative'}`}>
                  {prediction.userStakes.ETH.potentialProfit >= 0 ? '+' : ''}{formatEth(prediction.userStakes.ETH.potentialProfit)} ETH
                </span>
              </div>
            </div>

            {/* ETH Claim Status */}
            <div className="legacy-claim-status">
              {prediction.userStakes.ETH.claimed ? (
                <div className="legacy-claimed">
                  <span className="legacy-claimed-icon">✅</span>
                  <span className="legacy-claimed-text">ETH Claimed</span>
                </div>
              ) : prediction.userStakes.ETH.canClaim ? (
                <div className="legacy-claimable">
                  <span className="legacy-claimable-icon">💰</span>
                  <span className="legacy-claimable-text">ETH Ready to Claim</span>
                </div>
              ) : (
                <div className="legacy-pending">
                  <span className="legacy-pending-icon">⏳</span>
                  <span className="legacy-pending-text">
                    {prediction.status === 'active' ? 'ETH Wait for Resolution' : 'ETH Cannot Claim'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* User Stake Info - SWIPE */}
        {prediction.userStakes?.SWIPE && (prediction.userStakes.SWIPE.yesAmount > 0 || prediction.userStakes.SWIPE.noAmount > 0) && (
          <div className="legacy-stake-info">
            <div className="legacy-stake-header">
              <h4 className="legacy-stake-title">SWIPE Stake</h4>
              <div className="legacy-stake-amounts">
                {prediction.userStakes.SWIPE.yesAmount > 0 && (
                  <span className="legacy-stake-amount yes">
                    YES: {formatEth(prediction.userStakes.SWIPE.yesAmount)} SWIPE
                  </span>
                )}
                {prediction.userStakes.SWIPE.noAmount > 0 && (
                  <span className="legacy-stake-amount no">
                    NO: {formatEth(prediction.userStakes.SWIPE.noAmount)} SWIPE
                  </span>
                )}
              </div>
            </div>

            {/* SWIPE Payout Info */}
            <div className="legacy-payout-info">
              <div className="legacy-payout-item">
                <span className="legacy-payout-label">SWIPE Potential Payout:</span>
                <span className="legacy-payout-value potential-payout">
                  {formatEth(prediction.userStakes.SWIPE.potentialPayout)} SWIPE
                </span>
              </div>
              <div className="legacy-payout-item">
                <span className="legacy-payout-label">SWIPE Potential Profit:</span>
                <span className={`legacy-payout-value ${prediction.userStakes.SWIPE.potentialProfit >= 0 ? 'positive' : 'negative'}`}>
                  {prediction.userStakes.SWIPE.potentialProfit >= 0 ? '+' : ''}{formatEth(prediction.userStakes.SWIPE.potentialProfit)} SWIPE
                </span>
              </div>
            </div>

            {/* SWIPE Claim Status */}
            <div className="legacy-claim-status">
              {prediction.userStakes.SWIPE.claimed ? (
                <div className="legacy-claimed">
                  <span className="legacy-claimed-icon">✅</span>
                  <span className="legacy-claimed-text">SWIPE Claimed</span>
                </div>
              ) : prediction.userStakes.SWIPE.canClaim ? (
                <div className="legacy-claimable">
                  <span className="legacy-claimable-icon">💰</span>
                  <span className="legacy-claimable-text">SWIPE Ready to Claim</span>
                </div>
              ) : (
                <div className="legacy-pending">
                  <span className="legacy-pending-icon">⏳</span>
                  <span className="legacy-pending-text">
                    {prediction.status === 'active' ? 'SWIPE Wait for Resolution' : 'SWIPE Cannot Claim'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Card Actions */}
      <div className="legacy-card-actions">
        {/* ETH Claim Button - show if user has ETH stake, disable if not resolved or already claimed */}
        {prediction.userStakes?.ETH && (prediction.userStakes.ETH.yesAmount > 0 || prediction.userStakes.ETH.noAmount > 0) && (
          <button 
            onClick={() => onClaimReward(prediction.id, 'ETH')}
            disabled={isTransactionLoading || prediction.status === 'active' || prediction.userStakes.ETH.claimed}
            className={`legacy-claim-btn eth-claim-btn ${prediction.status === 'active' || prediction.userStakes.ETH.claimed ? 'disabled' : ''}`}
            title={
              prediction.status === 'active' 
                ? 'Prediction is still active - wait for resolution' 
                : prediction.userStakes.ETH.claimed 
                  ? 'Already claimed' 
                  : 'Claim ETH reward'
            }
          >
            {isTransactionLoading ? 'Processing...' : 
             prediction.userStakes.ETH.claimed ? '✅ ETH Claimed' :
             prediction.status === 'active' ? '⏳ Claim ETH (Active)' : '💰 Claim ETH'}
          </button>
        )}
        
        {/* SWIPE Claim Button - show if user has SWIPE stake, disable if not resolved or already claimed */}
        {prediction.userStakes?.SWIPE && (prediction.userStakes.SWIPE.yesAmount > 0 || prediction.userStakes.SWIPE.noAmount > 0) && (
          <button 
            onClick={() => onClaimReward(prediction.id, 'SWIPE')}
            disabled={isTransactionLoading || prediction.status === 'active' || prediction.userStakes.SWIPE.claimed}
            className={`legacy-claim-btn swipe-claim-btn ${prediction.status === 'active' || prediction.userStakes.SWIPE.claimed ? 'disabled' : ''}`}
            title={
              prediction.status === 'active' 
                ? 'Prediction is still active - wait for resolution' 
                : prediction.userStakes.SWIPE.claimed 
                  ? 'Already claimed' 
                  : 'Claim SWIPE reward'
            }
          >
            {isTransactionLoading ? 'Processing...' : 
             prediction.userStakes.SWIPE.claimed ? '✅ SWIPE Claimed' :
             prediction.status === 'active' ? '⏳ Claim SWIPE (Active)' : '💰 Claim SWIPE'}
          </button>
        )}
      </div>
    </div>
  );
}

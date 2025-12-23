"use client";

import React from 'react';
import { RedisPrediction } from '../../../lib/types/redis';
import './LegacyCard.css';

interface LegacyCardProps {
  prediction: {
    // Core data
    id: string;
    question: string;
    description: string;
    category: string;
    imageUrl: string;
    deadline: number;
    creator: string;
    verified: boolean;
    needsApproval: boolean;
    resolved: boolean;
    outcome?: boolean;
    cancelled: boolean;
    yesTotalAmount: number;
    noTotalAmount: number;
    swipeYesTotalAmount: number;
    swipeNoTotalAmount: number;
    totalStakes: number;
    
    // Enhanced data
    includeChart?: boolean;
    selectedCrypto?: string;
    endDate?: string;
    endTime?: string;
    participants: string[];
    createdAt: number;
    approved: boolean;
    
    // User stakes
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

  // Convert URLs in text to clickable links
  const formatDescription = (text: string) => {
    const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
    const parts = text.split(urlPattern);
    
    return parts.map((part, index) => {
      if (part.match(urlPattern)) {
        return (
          <a 
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="legacy-link"
            onClick={(e) => e.stopPropagation()}
          >
            🔗 {part.length > 40 ? part.substring(0, 40) + '...' : part}
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  // Format SWIPE with K/M suffixes
  const formatSwipe = (wei: number): string => {
    const swipe = wei / Math.pow(10, 18);
    if (swipe === 0) return '0';
    
    const absSwipe = Math.abs(swipe);
    const sign = swipe < 0 ? '-' : '';
    
    if (absSwipe >= 1000000) {
      return `${sign}${(absSwipe / 1000000).toFixed(2)}M`;
    } else if (absSwipe >= 1000) {
      return `${sign}${(absSwipe / 1000).toFixed(2)}K`;
    } else if (absSwipe >= 1) {
      return `${sign}${absSwipe.toFixed(2)}`;
    } else {
      return `${sign}${absSwipe.toFixed(4)}`;
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

  const getStatusText = (status: string): string => {
    switch (status) {
      case 'active': return 'ACTIVE';
      case 'resolved': return 'RESOLVED';
      case 'expired': return 'EXPIRED';
      case 'cancelled': return 'CANCELLED';
      default: return 'UNKNOWN';
    }
  };

  // Get crypto logo based on question/description text
  const getCryptoLogo = (question: string, description: string): string | null => {
    const text = `${question} ${description}`.toLowerCase();
    
    // Check for specific cryptocurrencies
    if (text.includes('btc') || text.includes('bitcoin')) {
      return '/bt3.png';
    }
    if (text.includes('eth') || text.includes('ethereum')) {
      return '/Ethereum-icon-purple.svg';
    }
    if (text.includes('sol') || text.includes('solana')) {
      return '/sol.png';
    }
    
    return null; // No crypto detected
  };

  // Determine which image to show for the avatar
  const getAvatarImage = (): string => {
    // If it's a chart prediction, try to get crypto logo from question
    if (prediction.includeChart) {
      const cryptoLogo = getCryptoLogo(prediction.question, prediction.description);
      if (cryptoLogo) return cryptoLogo;
    }
    
    // Fall back to imageUrl or splash
    // For geckoterminal URLs, try to detect crypto from question
    if (prediction.imageUrl?.includes('geckoterminal.com')) {
      const cryptoLogo = getCryptoLogo(prediction.question, prediction.description);
      if (cryptoLogo) return cryptoLogo;
      return '/splash.png'; // Fallback for unknown crypto
    }
    
    return prediction.imageUrl || '/splash.png';
  };

  // Calculate total staked for user
  const ethStake = prediction.userStakes?.ETH;
  const swipeStake = prediction.userStakes?.SWIPE;
  const ethTotalStaked = ethStake ? (ethStake.yesAmount + ethStake.noAmount) : 0;
  const swipeTotalStaked = swipeStake ? (swipeStake.yesAmount + swipeStake.noAmount) : 0;

  // Determine if user has any stakes
  const hasEthStake = ethTotalStaked > 0;
  const hasSwipeStake = swipeTotalStaked > 0;

  return (
    <div className="legacy-card">
      {/* Status Badge - Top Right Corner */}
      <div className={`legacy-badge legacy-badge-${prediction.status}`}>
        <span className="legacy-status-icon">{getStatusIcon(prediction.status)}</span>
        <span className="legacy-status-text">{getStatusText(prediction.status)}</span>
      </div>

      {/* Header with Avatar */}
      <div className="legacy-card-header">
        {/* Avatar - use crypto logo for chart predictions */}
        <div className="legacy-avatar">
          <img 
            src={getAvatarImage()} 
            alt="Prediction" 
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/splash.png';
            }}
          />
        </div>
        
        {/* Question */}
        <div className="legacy-header-content">
          <h3 className="legacy-question">{prediction.question}</h3>
        </div>
      </div>

      {/* Description */}
      <p className="legacy-description">{formatDescription(prediction.description)}</p>

      {/* Outcome Banner - Show result if resolved */}
      {prediction.resolved && prediction.outcome !== undefined && (
        <div className={`legacy-outcome-banner ${prediction.outcome ? 'outcome-yes' : 'outcome-no'}`}>
          <span className="outcome-icon">{prediction.outcome ? '✅' : '❌'}</span>
          <span className="outcome-text">
            Result: <strong>{prediction.outcome ? 'YES' : 'NO'}</strong>
          </span>
        </div>
      )}

      {/* Meta Information */}
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

      {/* Pool Info */}
      <div className="legacy-pool-info">
        <div className="legacy-pool-item yes">
          <span className="legacy-pool-label">YES Pool:</span>
          <span className="legacy-pool-value">{formatEth(prediction.yesTotalAmount)} ETH</span>
        </div>
        <div className="legacy-pool-item no">
          <span className="legacy-pool-label">NO Pool:</span>
          <span className="legacy-pool-value">{formatEth(prediction.noTotalAmount)} ETH</span>
        </div>
      </div>

      {/* User Stakes Stats Table - like the screenshot */}
      {(hasEthStake || hasSwipeStake) && (
        <div className="legacy-stats-table">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Staked</th>
                <th>Payout</th>
                <th>Profit</th>
              </tr>
            </thead>
            <tbody>
              {/* ETH Row */}
              {hasEthStake && (
                <tr className="eth-row">
                  <td className="token-cell">
                    <img src="/eth.png" alt="ETH" className="token-icon" />
                  </td>
                  <td className="value-cell staked">{formatEth(ethTotalStaked)}</td>
                  <td className="value-cell payout">{formatEth(ethStake?.potentialPayout || 0)}</td>
                  <td className={`value-cell profit ${(ethStake?.potentialProfit || 0) >= 0 ? 'positive' : 'negative'}`}>
                    {(ethStake?.potentialProfit || 0) >= 0 ? '+' : ''}{formatEth(ethStake?.potentialProfit || 0)}
                  </td>
                </tr>
              )}
              {/* SWIPE Row */}
              {hasSwipeStake && (
                <tr className="swipe-row">
                  <td className="token-cell">
                    <img src="/splash.png" alt="SWIPE" className="token-icon swipe" />
                  </td>
                  <td className="value-cell staked">{formatSwipe(swipeTotalStaked)}</td>
                  <td className="value-cell payout">{formatSwipe(swipeStake?.potentialPayout || 0)}</td>
                  <td className={`value-cell profit ${(swipeStake?.potentialProfit || 0) >= 0 ? 'positive' : 'negative'}`}>
                    {(swipeStake?.potentialProfit || 0) >= 0 ? '+' : ''}{formatSwipe(swipeStake?.potentialProfit || 0)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Card Actions */}
      <div className="legacy-card-actions">
        {/* ETH Claim Button */}
        {hasEthStake && (
          <button 
            onClick={() => onClaimReward(prediction.id, 'ETH')}
            disabled={isTransactionLoading || ethStake?.claimed || !ethStake?.canClaim}
            className={`legacy-claim-btn eth-claim-btn ${ethStake?.claimed || !ethStake?.canClaim ? 'disabled' : ''}`}
            title={
              ethStake?.claimed 
                ? 'Already claimed' 
                : !ethStake?.canClaim
                  ? prediction.status === 'active' 
                    ? 'Wait for prediction to be resolved'
                    : 'Cannot claim - you lost this prediction'
                  : 'Claim ETH reward'
            }
          >
            {isTransactionLoading ? '...' : 
             ethStake?.claimed ? '✅ ETH Claimed' :
             ethStake?.canClaim ? '💰 Claim ETH' : 
             prediction.status === 'active' ? '⏳ Wait' : '❌ Lost'}
          </button>
        )}
        
        {/* SWIPE Claim Button */}
        {hasSwipeStake && (
          <button 
            onClick={() => onClaimReward(prediction.id, 'SWIPE')}
            disabled={isTransactionLoading || swipeStake?.claimed || !swipeStake?.canClaim}
            className={`legacy-claim-btn swipe-claim-btn ${swipeStake?.claimed || !swipeStake?.canClaim ? 'disabled' : ''}`}
            title={
              swipeStake?.claimed 
                ? 'Already claimed' 
                : !swipeStake?.canClaim
                  ? prediction.status === 'active' 
                    ? 'Wait for prediction to be resolved'
                    : 'Cannot claim - you lost this prediction'
                  : 'Claim SWIPE reward'
            }
          >
            {isTransactionLoading ? '...' : 
             swipeStake?.claimed ? '✅ SWIPE Claimed' :
             swipeStake?.canClaim ? '💰 Claim SWIPE' : 
             prediction.status === 'active' ? '⏳ Wait' : '❌ Lost'}
          </button>
        )}
      </div>
    </div>
  );
}

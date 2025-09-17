'use client';

import React from 'react';
import './PredictionEmbed.css';

interface PredictionEmbedProps {
  prediction: {
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
    imageUrl?: string;
  };
}

// Helper function to get category emoji
const getCategoryEmoji = (category: string): string => {
  const categoryEmojis: { [key: string]: string } = {
    'crypto': '₿',
    'politics': '🗳️',
    'sports': '⚽',
    'technology': '💻',
    'entertainment': '🎬',
    'economics': '📈',
    'weather': '🌤️',
    'science': '🔬',
    'health': '🏥',
    'education': '🎓',
    'business': '💼',
    'social': '👥',
    'gaming': '🎮',
    'travel': '✈️',
    'food': '🍕',
    'fashion': '👗',
    'art': '🎨',
    'music': '🎵',
    'books': '📚',
    'movies': '🎬',
    'tv': '📺',
    'news': '📰',
    'other': '🔮'
  };
  
  return categoryEmojis[category.toLowerCase()] || '🔮';
};

// Helper function to calculate time left
const getTimeLeft = (deadline: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const timeLeft = deadline - now;
  
  if (timeLeft <= 0) {
    return 'Expired';
  }
  
  const days = Math.floor(timeLeft / (24 * 60 * 60));
  const hours = Math.floor((timeLeft % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((timeLeft % (60 * 60)) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
};

export default function PredictionEmbed({ prediction }: PredictionEmbedProps) {
  const totalAmount = prediction.yesTotalAmount + prediction.noTotalAmount;
  const yesPercentage = totalAmount > 0 ? (prediction.yesTotalAmount / totalAmount * 100).toFixed(1) : '0';
  const noPercentage = totalAmount > 0 ? (prediction.noTotalAmount / totalAmount * 100).toFixed(1) : '0';
  
  const timeLeft = getTimeLeft(prediction.deadline);
  
  return (
    <div className="embed-container">
      
      <div className="embed-card">
        <div className="embed-header">
          <div className="embed-icon">
            {getCategoryEmoji(prediction.category)}
          </div>
          <h1 className="embed-title">
            {prediction.question}
          </h1>
          <div className="embed-category">
            <span>{getCategoryEmoji(prediction.category)}</span>
            <span>{prediction.category.toUpperCase()}</span>
          </div>
        </div>
        
        <div className="embed-stats">
          <div className="stat-card yes">
            <div className="stat-label yes">YES</div>
            <div className="stat-amount">
              {(prediction.yesTotalAmount || 0).toFixed(4)} ETH
            </div>
            <div className="stat-percentage">
              {yesPercentage}%
            </div>
          </div>
          
          <div className="stat-card no">
            <div className="stat-label no">NO</div>
            <div className="stat-amount">
              {(prediction.noTotalAmount || 0).toFixed(4)} ETH
            </div>
            <div className="stat-percentage">
              {noPercentage}%
            </div>
          </div>
        </div>
        
        <div className="embed-time">
          ⏰ {timeLeft}
        </div>
        
        <div className="embed-cta">
          <a 
            href={typeof window !== 'undefined' ? window.location.origin : '#'}
            className="cta-button"
          >
            🎯 Join the Game!
          </a>
        </div>
        
        <div className="embed-footer">
          <div className="footer-logo">
            Swipe Prediction Market
          </div>
          <p>Predict the future and win rewards!</p>
        </div>
      </div>
    </div>
  );
}
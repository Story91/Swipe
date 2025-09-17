'use client';

import React from 'react';
import { formatTimeLeft } from '../../components/Main/TinderCard';

interface PredictionData {
  id: string | number;
  question: string;
  category: string;
  deadline: number;
  yesTotalAmount: number;
  noTotalAmount: number;
  imageUrl?: string;
  creator?: string;
  verified?: boolean;
  approved?: boolean;
}

interface PredictionEmbedProps {
  prediction: PredictionData;
}

export default function PredictionEmbed({ prediction }: PredictionEmbedProps) {
  const totalPool = (prediction.yesTotalAmount || 0) + (prediction.noTotalAmount || 0);
  const yesPercentage = totalPool > 0 ? Math.round(((prediction.yesTotalAmount || 0) / totalPool) * 100) : 50;
  const noPercentage = totalPool > 0 ? Math.round(((prediction.noTotalAmount || 0) / totalPool) * 100) : 50;
  
  const timeLeft = formatTimeLeft(prediction.deadline);
  
  const getCategoryEmoji = (category: string) => {
    const categoryMap: { [key: string]: string } = {
      sports: '⚽',
      crypto: '₿',
      politics: '🏛️',
      technology: '💻',
      entertainment: '🎬',
      default: '🔮'
    };
    return categoryMap[category.toLowerCase()] || categoryMap.default;
  };

  return (
    <div className="prediction-embed">
      <style jsx>{`
        .prediction-embed {
          width: 100%;
          min-height: 100vh;
          background: linear-gradient(135deg, #d4ff00 0%, #a8cc00 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          font-family: 'Orbitron', 'Source Code Pro', sans-serif;
        }
        
        .embed-card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          padding: 40px;
          max-width: 600px;
          width: 100%;
          box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.1),
            0 0 0 1px rgba(255, 255, 255, 0.2);
          text-align: center;
        }
        
        .embed-header {
          margin-bottom: 30px;
        }
        
        .embed-icon {
          font-size: 48px;
          margin-bottom: 16px;
          animation: bounce 2s infinite;
        }
        
        .embed-title {
          font-family: 'Orbitron', sans-serif;
          font-weight: 700;
          font-size: 28px;
          color: #1a1a1a;
          margin: 0 0 16px 0;
          line-height: 1.3;
        }
        
        .embed-category {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
        }
        
        .embed-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin: 30px 0;
        }
        
        .stat-card {
          background: rgba(255, 255, 255, 0.8);
          border-radius: 16px;
          padding: 20px;
          border: 2px solid transparent;
          transition: all 0.3s ease;
        }
        
        .stat-card.yes {
          border-color: #4CAF50;
          background: linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(76, 175, 80, 0.05) 100%);
        }
        
        .stat-card.no {
          border-color: #F44336;
          background: linear-gradient(135deg, rgba(244, 67, 54, 0.1) 0%, rgba(244, 67, 54, 0.05) 100%);
        }
        
        .stat-label {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        .stat-label.yes {
          color: #4CAF50;
        }
        
        .stat-label.no {
          color: #F44336;
        }
        
        .stat-amount {
          font-family: 'Orbitron', sans-serif;
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 4px;
        }
        
        .stat-percentage {
          font-size: 18px;
          font-weight: 600;
          opacity: 0.8;
        }
        
        .embed-time {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 12px;
          padding: 16px;
          margin: 20px 0;
          font-family: 'Source Code Pro', monospace;
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }
        
        .embed-cta {
          margin-top: 30px;
        }
        
        .cta-button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 16px;
          padding: 16px 32px;
          font-family: 'Orbitron', sans-serif;
          font-weight: 600;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.3s ease;
          text-decoration: none;
          display: inline-block;
        }
        
        .cta-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
        }
        
        .embed-footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid rgba(0, 0, 0, 0.1);
          font-size: 14px;
          color: #666;
        }
        
        .footer-logo {
          font-family: 'Orbitron', sans-serif;
          font-weight: 700;
          font-size: 18px;
          color: #333;
          margin-bottom: 8px;
        }
        
        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-10px);
          }
          60% {
            transform: translateY(-5px);
          }
        }
        
        @media (max-width: 768px) {
          .embed-card {
            padding: 30px 20px;
            margin: 10px;
          }
          
          .embed-title {
            font-size: 24px;
          }
          
          .embed-stats {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          
          .stat-amount {
            font-size: 20px;
          }
        }
      `}</style>
      
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
            Dexter Prediction Market
          </div>
          <p>Predict the future and win rewards!</p>
        </div>
      </div>
    </div>
  );
}

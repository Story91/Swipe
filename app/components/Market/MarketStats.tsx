"use client";

import React, { useState } from 'react';
import './MarketStats.css';

export function MarketStats() {
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1H' | '24H' | '7D' | '30D'>('24H');
  const [marketData] = useState({
    totalPredictions: 1247,
    activePredictions: 89,
    totalVolume: 456.78,
    predictionsToday: 23,
    volumeToday: 12.34,
    topCategory: 'Crypto',
    trendingPredictions: [
      {
        id: 1,
        question: "Bitcoin hits $100,000 by end of 2024?",
        volume: 45.67,
        participants: 234,
        change: '+12.5%',
        isPositive: true
      },
      {
        id: 2,
        question: "Ethereum hits $5,000 by Q1 2024?",
        volume: 32.18,
        participants: 189,
        change: '+8.3%',
        isPositive: true
      },
      {
        id: 3,
        question: "Solana flips Ethereum in market cap by 2025?",
        volume: 28.91,
        participants: 156,
        change: '+15.2%',
        isPositive: true
      },
      {
        id: 4,
        question: "Manchester United wins Premier League 2024?",
        volume: 18.45,
        participants: 98,
        change: '-5.7%',
        isPositive: false
      },
      {
        id: 5,
        question: "Will I get rich quick from this prediction?",
        volume: 15.23,
        participants: 67,
        change: '+22.1%',
        isPositive: true
      }
    ]
  });

  return (
    <div className="market-stats">
      <div className="stats-header">
        <h1>📊 Market Statistics</h1>
        <p>Real-time market data and trending predictions</p>
      </div>

      {/* Time Frame Selector */}
      <div className="timeframe-selector">
        {(['1H', '24H', '7D', '30D'] as const).map((timeframe) => (
          <button
            key={timeframe}
            className={selectedTimeframe === timeframe ? 'active' : ''}
            onClick={() => setSelectedTimeframe(timeframe)}
          >
            {timeframe}
          </button>
        ))}
      </div>

      {/* Key Metrics */}
      <div className="key-metrics">
        <div className="metric-card">
          <div className="metric-icon">📈</div>
          <div className="metric-content">
            <div className="metric-value">{marketData.totalPredictions.toLocaleString()}</div>
            <div className="metric-label">Total Predictions</div>
            <div className="metric-change positive">+8.2%</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">💰</div>
          <div className="metric-content">
            <div className="metric-value">{marketData.totalVolume.toFixed(2)} ETH</div>
            <div className="metric-label">Total Volume</div>
            <div className="metric-change positive">+15.7%</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">🎯</div>
          <div className="metric-content">
            <div className="metric-value">{marketData.activePredictions}</div>
            <div className="metric-label">Active Predictions</div>
            <div className="metric-change positive">+3.1%</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <div className="metric-value">{marketData.topCategory}</div>
            <div className="metric-label">Top Category</div>
            <div className="metric-change neutral">Trending</div>
          </div>
        </div>
      </div>

      {/* Today's Activity */}
      <div className="today-activity">
        <h2>Today&apos;s Activity</h2>
        <div className="activity-metrics">
          <div className="activity-item">
            <div className="activity-icon">🎯</div>
            <div className="activity-content">
              <div className="activity-value">{marketData.predictionsToday}</div>
              <div className="activity-label">New Predictions</div>
            </div>
          </div>

          <div className="activity-item">
            <div className="activity-icon">💰</div>
            <div className="activity-content">
              <div className="activity-value">{marketData.volumeToday.toFixed(2)} ETH</div>
              <div className="activity-label">Volume</div>
            </div>
          </div>

          <div className="activity-item">
            <div className="activity-icon">👥</div>
            <div className="activity-content">
              <div className="activity-value">
                {marketData.trendingPredictions.reduce((sum, p) => sum + p.participants, 0)}
              </div>
              <div className="activity-label">New Participants</div>
            </div>
          </div>
        </div>
      </div>

      {/* Trending Predictions */}
      <div className="trending-predictions">
        <h2>🔥 Trending Predictions</h2>
        <div className="predictions-list">
          {marketData.trendingPredictions.map((prediction, index) => (
            <div key={prediction.id} className="prediction-item">
              <div className="prediction-rank">#{index + 1}</div>

              <div className="prediction-content">
                <h3 className="prediction-question">{prediction.question}</h3>
                <div className="prediction-stats">
                  <span className="stat">
                    💰 {prediction.volume.toFixed(2)} ETH
                  </span>
                  <span className="stat">
                    👥 {prediction.participants}
                  </span>
                  <span className={`stat change ${prediction.isPositive ? 'positive' : 'negative'}`}>
                    {prediction.change}
                  </span>
                </div>
              </div>

              <div className="prediction-trend">
                <div className="trend-bar">
                  <div
                    className={`trend-fill ${prediction.isPositive ? 'positive' : 'negative'}`}
                    style={{ width: `${Math.min(100, (prediction.volume / marketData.trendingPredictions[0].volume) * 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Market Overview */}
      <div className="market-overview">
        <h2>📈 Market Overview</h2>
        <div className="overview-grid">
          <div className="overview-card">
            <h3>Volume Distribution</h3>
            <div className="distribution-chart">
              <div className="distribution-item">
                <span className="category">Crypto</span>
                <div className="bar">
                  <div className="fill" style={{ width: '45%' }}></div>
                </div>
                <span className="percentage">45%</span>
              </div>
              <div className="distribution-item">
                <span className="category">Sports</span>
                <div className="bar">
                  <div className="fill" style={{ width: '28%' }}></div>
                </div>
                <span className="percentage">28%</span>
              </div>
              <div className="distribution-item">
                <span className="category">Politics</span>
                <div className="bar">
                  <div className="fill" style={{ width: '15%' }}></div>
                </div>
                <span className="percentage">15%</span>
              </div>
              <div className="distribution-item">
                <span className="category">Other</span>
                <div className="bar">
                  <div className="fill" style={{ width: '12%' }}></div>
                </div>
                <span className="percentage">12%</span>
              </div>
            </div>
          </div>

          <div className="overview-card">
            <h3>Prediction Status</h3>
            <div className="status-chart">
              <div className="status-item">
                <span className="status-label">Active</span>
                <span className="status-value">89</span>
                <div className="status-bar">
                  <div className="status-fill active" style={{ width: '71%' }}></div>
                </div>
              </div>
              <div className="status-item">
                <span className="status-label">Resolved</span>
                <span className="status-value">1,089</span>
                <div className="status-bar">
                  <div className="status-fill resolved" style={{ width: '87%' }}></div>
                </div>
              </div>
              <div className="status-item">
                <span className="status-label">Pending Approval</span>
                <span className="status-value">69</span>
                <div className="status-bar">
                  <div className="status-fill pending" style={{ width: '5.5%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

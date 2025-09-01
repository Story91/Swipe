"use client";

import React, { useState } from 'react';
import './PlatformAnalytics.css';

export function PlatformAnalytics() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  // Mock analytics data
  const analyticsData = {
    totalPredictions: 1247,
    activePredictions: 89,
    totalVolume: 456.78,
    totalParticipants: 3456,
    averageStake: 0.45,
    platformFees: 12.34,
    successRate: 68.5,
    topCategories: [
      { name: 'Crypto', count: 45, volume: 234.56 },
      { name: 'Sports', count: 23, volume: 89.12 },
      { name: 'Politics', count: 12, volume: 67.89 },
      { name: 'Entertainment', count: 9, volume: 65.21 }
    ],
    dailyStats: [
      { date: '2024-08-20', predictions: 12, volume: 45.67, participants: 89 },
      { date: '2024-08-21', predictions: 15, volume: 52.34, participants: 102 },
      { date: '2024-08-22', predictions: 8, volume: 28.91, participants: 67 },
      { date: '2024-08-23', predictions: 18, volume: 67.23, participants: 124 },
      { date: '2024-08-24', predictions: 22, volume: 78.45, participants: 156 },
      { date: '2024-08-25', predictions: 19, volume: 71.12, participants: 134 },
      { date: '2024-08-26', predictions: 25, volume: 89.67, participants: 178 }
    ]
  };

  return (
    <div className="platform-analytics">
      <div className="analytics-header">
        <h2>📈 Platform Analytics</h2>
        <div className="time-range-selector">
          <button
            className={timeRange === '7d' ? 'active' : ''}
            onClick={() => setTimeRange('7d')}
          >
            7 Days
          </button>
          <button
            className={timeRange === '30d' ? 'active' : ''}
            onClick={() => setTimeRange('30d')}
          >
            30 Days
          </button>
          <button
            className={timeRange === '90d' ? 'active' : ''}
            onClick={() => setTimeRange('90d')}
          >
            90 Days
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <div className="metric-value">{analyticsData.totalPredictions.toLocaleString()}</div>
            <div className="metric-label">Total Predictions</div>
            <div className="metric-change positive">+12.5%</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">💰</div>
          <div className="metric-content">
            <div className="metric-value">{analyticsData.totalVolume.toFixed(2)} ETH</div>
            <div className="metric-label">Total Volume</div>
            <div className="metric-change positive">+18.3%</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">👥</div>
          <div className="metric-content">
            <div className="metric-value">{analyticsData.totalParticipants.toLocaleString()}</div>
            <div className="metric-label">Total Participants</div>
            <div className="metric-change positive">+24.7%</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">🎯</div>
          <div className="metric-content">
            <div className="metric-value">{analyticsData.successRate}%</div>
            <div className="metric-label">Prediction Success Rate</div>
            <div className="metric-change neutral">±2.1%</div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="charts-section">
        <div className="chart-container">
          <h3>📈 Daily Activity</h3>
          <div className="daily-chart">
            {analyticsData.dailyStats.map((day) => (
              <div key={day.date} className="chart-bar">
                <div
                  className="bar-fill"
                  style={{ height: `${(day.volume / 100) * 100}%` }}
                  title={`${day.date}: ${day.predictions} predictions, ${day.volume.toFixed(2)} ETH, ${day.participants} participants`}
                ></div>
                <div className="bar-label">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="chart-container">
          <h3>📊 Top Categories</h3>
          <div className="categories-chart">
            {analyticsData.topCategories.map((category) => (
              <div key={category.name} className="category-item">
                <div className="category-info">
                  <span className="category-name">{category.name}</span>
                  <span className="category-stats">{category.count} predictions</span>
                </div>
                <div className="category-bar">
                  <div
                    className="category-fill"
                    style={{
                      width: `${(category.volume / analyticsData.topCategories[0].volume) * 100}%`,
                      backgroundColor: `hsl(${analyticsData.topCategories.indexOf(category) * 90}, 70%, 60%)`
                    }}
                  ></div>
                  <span className="category-volume">{category.volume.toFixed(2)} ETH</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Additional Stats */}
      <div className="additional-stats">
        <div className="stat-card">
          <h4>💰 Financial Overview</h4>
          <div className="stat-grid">
            <div className="stat-item">
              <span className="stat-label">Platform Fees Collected</span>
              <span className="stat-value">{analyticsData.platformFees.toFixed(2)} ETH</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Average Stake</span>
              <span className="stat-value">{analyticsData.averageStake.toFixed(2)} ETH</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Active Predictions</span>
              <span className="stat-value">{analyticsData.activePredictions}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Avg. Participants/Prediction</span>
              <span className="stat-value">{Math.round(analyticsData.totalParticipants / analyticsData.totalPredictions)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

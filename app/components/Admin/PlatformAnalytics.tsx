"use client";

import React, { useState, useEffect } from 'react';
import './PlatformAnalytics.css';

interface AnalyticsData {
  totalPredictions: number;
  activePredictions: number;
  totalVolume: number;
  totalParticipants: number;
  averageStake: number;
  platformFees: number;
  successRate: number;
  topCategories: Array<{
    name: string;
    count: number;
    volume: number;
  }>;
  dailyStats: Array<{
    date: string;
    predictions: number;
    volume: number;
    participants: number;
  }>;
}

export function PlatformAnalytics() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/market/stats');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.success) {
          const stats = result.data;

          // Transform API data to match component format
          const transformedData: AnalyticsData = {
            totalPredictions: stats.totalPredictions || 0,
            activePredictions: stats.activePredictions || 0,
            totalVolume: stats.totalVolume || 0,
            totalParticipants: stats.totalParticipants || 0,
            averageStake: stats.performance?.averageStakeSize || 0,
            platformFees: stats.collectedFees || 0,
            successRate: stats.performance?.resolutionRate ? stats.performance.resolutionRate * 100 : 0,
            topCategories: stats.categories?.topCategories?.map((cat: any) => ({
              name: cat.category,
              count: cat.count,
              volume: Math.random() * 100 + 50 // Mock volume for now
            })) || [
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
            ] // Keep mock daily stats for now
          };

          setAnalyticsData(transformedData);
        } else {
          throw new Error(result.error || 'Failed to fetch analytics');
        }
      } catch (err) {
        console.error('❌ Failed to fetch analytics:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch analytics data');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();

    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchAnalytics, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="platform-analytics">
        <div className="analytics-header">
          <h2>📈 Platform Analytics</h2>
          <p>Loading analytics data...</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="platform-analytics">
        <div className="analytics-header">
          <h2>📈 Platform Analytics</h2>
          <p>Real-time platform analytics</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: 'red' }}>
          <div>❌ Failed to load analytics</div>
          <div style={{ fontSize: '14px', marginTop: '10px' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="platform-analytics">
        <div className="analytics-header">
          <h2>📈 Platform Analytics</h2>
          <p>No analytics data available</p>
        </div>
      </div>
    );
  }

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

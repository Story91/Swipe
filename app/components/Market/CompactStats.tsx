"use client";

import React, { useState, useEffect } from 'react';
import './CompactStats.css';

interface CompactStatsData {
  totalPredictions: number;
  activePredictions: number;
  totalVolumeETH: number;
  totalVolumeSWIPE: number;
  predictionsToday: number;
  volumeToday: number;
  topCategory: string;
  successRate: number;
  totalParticipants: number;
  trendingPredictions: Array<{
    id: string;
    question: string;
    volumeETH: number;
    volumeSWIPE: number;
    participants: number;
    isPositive: boolean;
  }>;
}

export function CompactStats() {
  const [statsData, setStatsData] = useState<CompactStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('🔄 Fetching compact stats...');
        // Single API call to get all data
        const response = await fetch('/api/market/compact-stats');
        console.log('📊 Compact stats response status:', response.status);
        
        if (!response.ok) {
          console.warn('⚠️ Compact stats API failed, using fallback data');
          // Use fallback data if API fails
          setStatsData({
            totalPredictions: 0,
            activePredictions: 0,
            totalVolumeETH: 0,
            totalVolumeSWIPE: 0,
            predictionsToday: 0,
            volumeToday: 0,
            topCategory: 'General',
            successRate: 0,
            totalParticipants: 0,
            trendingPredictions: []
          });
        } else {
          const result = await response.json();
          console.log('📊 Compact stats result:', result);
          
          if (result.success) {
            // Data is already in the correct format
            setStatsData(result.data);
          } else {
            console.warn('⚠️ Compact stats API returned error:', result.error);
            // Use fallback data
            setStatsData({
              totalPredictions: 0,
              activePredictions: 0,
              totalVolumeETH: 0,
              totalVolumeSWIPE: 0,
              predictionsToday: 0,
              volumeToday: 0,
              topCategory: 'General',
              successRate: 0,
              totalParticipants: 0,
              trendingPredictions: []
            });
          }
        }

        
        console.log('✅ All data fetched successfully');
      } catch (err) {
        console.error('❌ Error fetching stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch stats');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="compact-stats">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading market data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="compact-stats">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <p>Failed to load stats</p>
          <button onClick={() => window.location.reload()} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!statsData) {
    return (
      <div className="compact-stats">
        <div className="no-data">
          <p>No data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="compact-stats">
      {/* Header */}
      <div className="stats-header">
        <h1>Market Stats</h1>
      </div>

      {/* Key Metrics Grid */}
      <div className="metrics-grid">
        <div className="metric-card primary">
          <div className="metric-content">
            <div className="metric-value" style={{ color: '#d4ff00' }}>{statsData.totalPredictions.toLocaleString()}</div>
            <div className="metric-label" style={{ color: '#d4ff00' }}>Total Predictions</div>
          </div>
        </div>

        <div className="metric-card secondary">
          <div className="metric-content">
            <div className="metric-value-container">
              <img src="/eth.png" alt="ETH" className="metric-logo" />
              <div className="metric-value small-font" style={{ color: '#d4ff00' }}>{(statsData.totalVolumeETH / 1e18).toFixed(5)} ETH</div>
            </div>
            <div className="metric-label" style={{ color: '#d4ff00' }}>Total ETH Stakes</div>
          </div>
        </div>

        <div className="metric-card accent">
          <div className="metric-content">
            <div className="metric-value" style={{ color: '#d4ff00' }}>{statsData.activePredictions}</div>
            <div className="metric-label" style={{ color: '#d4ff00' }}>Active Now</div>
          </div>
        </div>

        <div className="metric-card success">
          <div className="metric-content">
            <div className="metric-value-container">
              <img src="/logo.png" alt="SWIPE" className="metric-logo" />
              <div className="metric-value small-font" style={{ color: '#d4ff00' }}>{(statsData.totalVolumeSWIPE / 1e18).toFixed(0)} SWIPE</div>
            </div>
            <div className="metric-label" style={{ color: '#d4ff00' }}>Total SWIPE Stakes</div>
          </div>
        </div>
      </div>

      {/* Today's Activity */}
      <div className="today-section">
        <h3>Today's Activity</h3>
        <div className="activity-cards">
          <div className="activity-card">
            <div className="activity-value">{statsData.predictionsToday}</div>
            <div className="activity-label">Ending Today</div>
          </div>
          <div className="activity-card">
            <div className="activity-value">{statsData.totalParticipants}</div>
            <div className="activity-label">Participants</div>
          </div>
        </div>
      </div>

      {/* Top Category */}
      <div className="category-section">
        <h3>Top Category</h3>
        <div className="category-card">
          <div className="category-name">{statsData.topCategory}</div>
          <div className="category-stats">
            <span className="category-count">{statsData.activePredictions} active</span>
          </div>
        </div>
      </div>

      {/* Trending Predictions */}
      {statsData.trendingPredictions.length > 0 && (
        <div className="trending-section">
          <h3>Trending Now</h3>
          <div className="trending-list">
            {statsData.trendingPredictions.map((prediction, index) => (
              <div key={prediction.id} className="trending-item">
                <div className="trending-rank">#{index + 1}</div>
                <div className="trending-content">
                  <div className="trending-question">{prediction.question}</div>
                  <div className="trending-stats">
                    <span className="trending-volume">
                      <img src="/eth.png" alt="ETH" className="trending-logo" />
                      {(prediction.volumeETH / 1e18).toFixed(5)} ETH
                      {prediction.volumeSWIPE > 0 && (
                        <>
                          <span className="trending-separator"> • </span>
                          <img src="/logo.png" alt="SWIPE" className="trending-logo" />
                          {(prediction.volumeSWIPE / 1e18).toFixed(0)} SWIPE
                        </>
                      )}
                    </span>
                    <span className="trending-participants">{prediction.participants} participants</span>
                  </div>
                </div>
                <div className={`trending-indicator ${prediction.isPositive ? 'positive' : 'negative'}`}>
                  {prediction.isPositive ? '↗' : '↘'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats Footer */}
      <div className="quick-stats">
        <div className="quick-stat">
          <span className="quick-label">Win Rate</span>
          <span className="quick-value" style={{ color: '#d4ff00' }}>{statsData.successRate.toFixed(1)}%</span>
        </div>
        <div className="quick-stat">
          <span className="quick-label">Avg. Stake</span>
          <span className="quick-value" style={{ color: '#d4ff00' }}>
            <img src="/eth.png" alt="ETH" className="quick-logo" />
            0.00045 ETH
            <span className="quick-separator"> • </span>
            <img src="/logo.png" alt="SWIPE" className="quick-logo" />
            14300 SWIPE
          </span>
        </div>
      </div>
    </div>
  );
}

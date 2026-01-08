"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
        <Card className="stats-loading-card">
          <CardContent className="loading-container">
            <div className="loading-logo">
              <img src="/splash.png" alt="Loading..." className="spinning-logo" />
            </div>
            <p className="loading-text">Loading market data...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="compact-stats">
        <Card className="stats-error-card">
          <CardContent className="error-container">
            <div className="error-icon">⚠️</div>
            <p>Failed to load stats</p>
            <button onClick={() => window.location.reload()} className="retry-button">
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!statsData) {
    return (
      <div className="compact-stats">
        <Card className="stats-empty-card">
          <CardContent className="no-data">
            <p>No data available</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="compact-stats">

      {/* Key Metrics Grid */}
      <div className="metrics-grid">
        <Card className="metric-card-new primary">
          <CardContent className="metric-content-new">
            <div className="metric-value-new">{statsData.totalPredictions.toLocaleString()}</div>
            <Badge variant="secondary" className="metric-badge">Total Predictions</Badge>
          </CardContent>
        </Card>

        <Card className="metric-card-new secondary">
          <CardContent className="metric-content-new">
            <div className="metric-value-container-new">
              <img src="/Ethereum-icon-purple.svg" alt="ETH" className="metric-logo-new" />
              <div className="metric-value-new small">{(statsData.totalVolumeETH / 1e18).toFixed(5)}</div>
            </div>
            <Badge variant="secondary" className="metric-badge">ETH Volume</Badge>
          </CardContent>
        </Card>

        <Card className="metric-card-new accent">
          <CardContent className="metric-content-new">
            <div className="metric-value-new">{statsData.activePredictions}</div>
            <Badge variant="default" className="metric-badge active">Active Now</Badge>
          </CardContent>
        </Card>

        <Card className="metric-card-new success">
          <CardContent className="metric-content-new">
            <div className="metric-value-container-new">
              <img src="/logo.png" alt="SWIPE" className="metric-logo-new" />
              <div className="metric-value-new small">{(statsData.totalVolumeSWIPE / 1e18).toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
            </div>
            <Badge variant="secondary" className="metric-badge">SWIPE Volume</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Today's Activity */}
      <Card className="section-card">
        <CardHeader className="section-header">
          <CardTitle className="section-title">⚡ Today&apos;s Activity</CardTitle>
        </CardHeader>
        <CardContent className="activity-grid">
          <div className="activity-item">
            <div className="activity-value-new">{statsData.predictionsToday}</div>
            <span className="activity-label-new">Ending Today</span>
          </div>
          <div className="activity-divider"></div>
          <div className="activity-item">
            <div className="activity-value-new">{statsData.totalParticipants}</div>
            <span className="activity-label-new">Participants</span>
          </div>
        </CardContent>
      </Card>

      {/* Top Category */}
      <Card className="section-card category">
        <CardHeader className="section-header">
          <CardTitle className="section-title">🏆 Top Category</CardTitle>
        </CardHeader>
        <CardContent className="category-content">
          <Badge variant="default" className="category-badge">{statsData.topCategory}</Badge>
          <span className="category-active-count">{statsData.activePredictions} active</span>
        </CardContent>
      </Card>

      {/* Trending Predictions */}
      {statsData.trendingPredictions.length > 0 && (
        <Card className="section-card trending">
          <CardHeader className="section-header">
            <CardTitle className="section-title">🔥 Trending Now</CardTitle>
          </CardHeader>
          <CardContent className="trending-list-new">
            {statsData.trendingPredictions.map((prediction, index) => (
              <div key={prediction.id} className="trending-item-new">
                <Badge variant="outline" className="trending-rank-badge">#{index + 1}</Badge>
                <div className="trending-content-new">
                  <div className="trending-question-new">{prediction.question}</div>
                  <div className="trending-meta">
                    <span className="trending-volume-new">
                      <img src="/Ethereum-icon-purple.svg" alt="ETH" className="trending-logo-new" />
                      {(prediction.volumeETH / 1e18).toFixed(5)}
                    </span>
                    {prediction.volumeSWIPE > 0 && (
                      <span className="trending-volume-new swipe">
                        <img src="/logo.png" alt="SWIPE" className="trending-logo-new" />
                        {(prediction.volumeSWIPE / 1e18).toFixed(0)}
                      </span>
                    )}
                    <Badge variant="secondary" className="participants-badge">{prediction.participants} 👥</Badge>
                  </div>
                </div>
                <div className={`trending-arrow ${prediction.isPositive ? 'up' : 'down'}`}>
                  {prediction.isPositive ? '📈' : '📉'}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Quick Stats Footer */}
      <Card className="footer-card">
        <CardContent className="footer-content">
          <div className="footer-stat">
            <span className="footer-label">Win Rate</span>
            <Badge variant="default" className="footer-value-badge">{statsData.successRate.toFixed(1)}%</Badge>
          </div>
          <div className="footer-divider"></div>
          <div className="footer-stat">
            <span className="footer-label">Avg. Stake</span>
            <div className="footer-values">
              <span className="footer-value-item">
                <img src="/Ethereum-icon-purple.svg" alt="ETH" className="footer-logo" />
                0.00045
              </span>
              <span className="footer-value-item">
                <img src="/logo.png" alt="SWIPE" className="footer-logo" />
                14.3K
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

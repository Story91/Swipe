"use client";

import React, { useState, useEffect } from 'react';
import './MarketStats.css';

interface MarketStatsData {
  totalPredictions: number;
  activePredictions: number;
  totalVolume: number;
  predictionsToday: number;
  volumeToday: number;
  topCategory: string;
  trendingPredictions: Array<{
    id: number;
    question: string;
    volume: number;
    participants: number;
    change: string;
    isPositive: boolean;
  }>;
}

export function MarketStats() {
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1H' | '24H' | '7D' | '30D'>('24H');
  const [marketData, setMarketData] = useState<MarketStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarketStats = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/market/stats');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.success) {
          // Transform API data to match component format
          const stats = result.data;

          // Get all predictions for total volume calculation
          const allPredictionsResponse = await fetch('/api/predictions');
          const allPredictionsResult = await allPredictionsResponse.json();

          // Get active predictions for trending data
          const activePredictionsResponse = await fetch('/api/predictions?status=active');
          const activePredictionsResult = await activePredictionsResponse.json();

          if (allPredictionsResult.success && activePredictionsResult.success) {
            const allPredictions = allPredictionsResult.data;
            const allActivePredictions = activePredictionsResult.data; // All active predictions
            const activePredictions = activePredictionsResult.data.slice(0, 5); // Top 5 for trending

            // Calculate total volume from ALL predictions
            const totalVolumeFromPredictions = allPredictions.reduce((total: number, pred: any) => {
              const yesAmount = pred.yesTotalAmount ? Number(pred.yesTotalAmount) / 1e18 : 0;
              const noAmount = pred.noTotalAmount ? Number(pred.noTotalAmount) / 1e18 : 0;
              return total + yesAmount + noAmount;
            }, 0);

            // Calculate today's volume from active predictions (last 7 days)
            const todayVolumeFromPredictions = activePredictions.reduce((total: number, pred: any) => {
              const yesAmount = pred.yesTotalAmount ? Number(pred.yesTotalAmount) / 1e18 : 0;
              const noAmount = pred.noTotalAmount ? Number(pred.noTotalAmount) / 1e18 : 0;
              return total + yesAmount + noAmount;
            }, 0);

            // Count active predictions from Redis
            const activePredictionsCount = allActivePredictions.length;

            const transformedData: MarketStatsData = {
              totalPredictions: stats.totalPredictions || 0,
              activePredictions: activePredictionsCount,
              totalVolume: totalVolumeFromPredictions,
              predictionsToday: stats.recentActivity?.predictionsLast7Days || 0,
              volumeToday: todayVolumeFromPredictions,
              topCategory: stats.performance?.mostActiveCategory || 'Crypto',
              trendingPredictions: activePredictions.map((pred: any) => {
                // Convert BigInt hex values to decimal ETH
                const yesAmount = pred.yesTotalAmount ? Number(pred.yesTotalAmount) / 1e18 : 0;
                const noAmount = pred.noTotalAmount ? Number(pred.noTotalAmount) / 1e18 : 0;
                const totalVolume = yesAmount + noAmount;
                

                
                return {
                  id: pred.id,
                  question: pred.question,
                  volume: totalVolume,
                  participants: pred.participants?.length || 0,
                  change: '0%', // No mock data - only real data
                  isPositive: true // Neutral for now
                };
              })
            };

            setMarketData(transformedData);
          }
        } else {
          throw new Error(result.error || 'Failed to fetch market stats');
        }
      } catch (err) {
        console.error('❌ Failed to fetch market stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch market statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchMarketStats();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchMarketStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="market-stats">
        <div className="loading-container">
          <div className="loading-logo">
            <img src="/splash.png" alt="Loading..." className="spinning-logo" />
          </div>
          <p>Loading market data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="market-stats">
        <div className="error-message" style={{ textAlign: 'center', padding: '40px', color: 'red' }}>
          <div>❌ Failed to load market statistics</div>
          <div style={{ fontSize: '14px', marginTop: '10px' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!marketData) {
    return (
      <div className="market-stats">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>No market data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className="market-stats">

      {/* Key Metrics */}
      <div className="key-metrics">
        <div className="metric-card">
          <div className="metric-icon">📈</div>
          <div className="metric-content">
            <div className="metric-value">{marketData.totalPredictions.toLocaleString()}</div>
            <div className="metric-label">Total Predictions</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">💰</div>
          <div className="metric-content">
            <div className="metric-value">{marketData.totalVolume.toFixed(4)} ETH</div>
            <div className="metric-label">Total Volume</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">🎯</div>
          <div className="metric-content">
            <div className="metric-value">{marketData.activePredictions}</div>
            <div className="metric-label">Active Predictions</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <div className="metric-value">{marketData.topCategory}</div>
            <div className="metric-label">Top Category</div>
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
              <div className="activity-value">{marketData.volumeToday.toFixed(4)} ETH</div>
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
                    💰 {prediction.volume.toFixed(4)} ETH
                  </span>
                  <span className="stat">
                    👥 {prediction.participants}
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


    </div>
  );
}

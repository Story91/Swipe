"use client";

import React, { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar';
import { useFarcasterProfiles } from '../../../lib/hooks/useFarcasterProfiles';
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

interface LargestStakesUser {
  rank: number;
  address: string;
  totalStaked: number;
  totalStakedETH: number;
  predictionsParticipated: number;
  avgStakePerPrediction: number;
}

export function MarketStats() {
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1H' | '24H' | '7D' | '30D'>('24H');
  const [marketData, setMarketData] = useState<MarketStatsData | null>(null);
  const [largestStakes, setLargestStakes] = useState<LargestStakesUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get Farcaster profiles for largest stakes users
  const largestStakesAddresses = largestStakes.map(user => user.address);
  const { profiles: largestStakesProfiles } = useFarcasterProfiles(largestStakesAddresses);

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

        // Fetch largest stakes data
        const largestStakesResponse = await fetch('/api/market/largest-stakes?limit=10');
        if (largestStakesResponse.ok) {
          const largestStakesResult = await largestStakesResponse.json();
          if (largestStakesResult.success) {
            setLargestStakes(largestStakesResult.data);
          }
        }
      } catch (err) {
        console.error('❌ Failed to fetch market stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch market statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchMarketStats();

    // No auto-refresh - data loads once on page load
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

      {/* Largest Stakes Leaderboard */}
      <div className="largest-stakes-leaderboard">
        <h2>🏆 Largest Stakes</h2>
        <div className="leaderboard-list">
          {largestStakes.map((user) => {
            const profile = largestStakesProfiles.find(p => p.address === user.address);
            const hasFarcasterProfile = profile && profile.fid;
            
            // Generate avatar color based on address
            const getAvatarColor = (addr: string) => {
              const colors = [
                'bg-blue-500',
                'bg-green-500', 
                'bg-purple-500',
                'bg-pink-500',
                'bg-yellow-500',
                'bg-red-500',
                'bg-indigo-500',
                'bg-teal-500'
              ];
              const hash = addr.split('').reduce((a, b) => {
                a = ((a << 5) - a) + b.charCodeAt(0);
                return a & a;
              }, 0);
              return colors[Math.abs(hash) % colors.length];
            };

            // Get initials from profile or address
            const getInitials = () => {
              if (profile?.display_name) {
                return profile.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
              }
              return user.address.slice(2, 4).toUpperCase();
            };

            return (
              <div key={user.address} className="leaderboard-item">
                <div className="leaderboard-rank">#{user.rank}</div>

                <div className="leaderboard-user">
                  <Avatar className="leaderboard-avatar">
                    <AvatarImage 
                      src={hasFarcasterProfile ? (profile?.pfp_url || undefined) : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.address.slice(2, 8)}`} 
                      alt={hasFarcasterProfile ? (profile?.display_name || `User ${user.address.slice(2, 6)}`) : `Wallet ${user.address.slice(2, 6)}`}
                    />
                    <AvatarFallback className={getAvatarColor(user.address)}>
                      <span className="text-white text-xs font-semibold">
                        {getInitials()}
                      </span>
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="leaderboard-user-info">
                    <div className="leaderboard-username">
                      {hasFarcasterProfile ? (profile?.display_name || `User ${user.address.slice(2, 6)}`) : `Wallet ${user.address.slice(2, 6)}`}
                    </div>
                    <div className="leaderboard-user-handle">
                      {hasFarcasterProfile ? `@${profile?.username}` : `${user.address.slice(0, 6)}...${user.address.slice(-4)}`}
                    </div>
                  </div>
                </div>

                <div className="leaderboard-stats">
                  <div className="leaderboard-stat">
                    <div className="stat-value">{user.totalStakedETH.toFixed(4)} ETH</div>
                    <div className="stat-label">Total Staked</div>
                  </div>
                  <div className="leaderboard-stat">
                    <div className="stat-value">{user.predictionsParticipated}</div>
                    <div className="stat-label">Predictions</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

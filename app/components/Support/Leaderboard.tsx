"use client";

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

interface LeaderboardUser {
  rank: number;
  address: string;
  displayName: string;
  avatar?: string;
  totalProfit: number;
  totalBets: number;
  winRate: number;
  totalStaked: number;
  predictionsCreated: number;
  isCurrentUser?: boolean;
}

export function Leaderboard() {
  const { address } = useAccount();
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | 'all'>('30d');
  const [sortBy, setSortBy] = useState<'profit' | 'winRate' | 'bets'>('profit');
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/leaderboard?timeframe=${timeframe}&limit=20`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.success) {
          // Mark current user if they're in the leaderboard
          const updatedData = result.data.map((user: LeaderboardUser) => ({
            ...user,
            isCurrentUser: user.address.toLowerCase() === address?.toLowerCase()
          }));

          setLeaderboard(updatedData);
        } else {
          throw new Error(result.error || 'Failed to fetch leaderboard');
        }
      } catch (err) {
        console.error('❌ Failed to fetch leaderboard:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch leaderboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();

    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchLeaderboard, 60000);
    return () => clearInterval(interval);
  }, [address, timeframe]);

  if (loading) {
    return (
      <div className="leaderboard">
        <div className="leaderboard-header">
          <h1>🏆 Leaderboard</h1>
          <p>Loading leaderboard data...</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="leaderboard">
        <div className="leaderboard-header">
          <h1>🏆 Leaderboard</h1>
          <p>Top performers on Dexter</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: 'red' }}>
          <div>❌ Failed to load leaderboard</div>
          <div style={{ fontSize: '14px', marginTop: '10px' }}>{error}</div>
        </div>
      </div>
    );
  }

  // Sort leaderboard based on selected criteria
  const sortedLeaderboard = [...leaderboard].sort((a, b) => {
    switch (sortBy) {
      case 'profit':
        return b.totalProfit - a.totalProfit;
      case 'winRate':
        return b.winRate - a.winRate;
      case 'bets':
        return b.totalBets - a.totalBets;
      default:
        return a.rank - b.rank;
    }
  });

  const timeframeLabels = {
    '7d': 'Last 7 Days',
    '30d': 'Last 30 Days',
    'all': 'All Time'
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1: return 'rank-gold';
      case 2: return 'rank-silver';
      case 3: return 'rank-bronze';
      default: return 'rank-normal';
    }
  };

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <h1>🏆 Leaderboard</h1>
        <p>Top performers on Dexter</p>
      </div>

      {/* Controls */}
      <div className="leaderboard-controls">
        <div className="timeframe-selector">
          <label>Timeframe:</label>
          <div className="timeframe-buttons">
            {Object.entries(timeframeLabels).map(([key, label]) => (
              <button
                key={key}
                className={`timeframe-button ${timeframe === key ? 'active' : ''}`}
                onClick={() => setTimeframe(key as '7d' | '30d' | 'all')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="sort-selector">
          <label>Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'profit' | 'winRate' | 'bets')}
            className="sort-select"
          >
            <option value="profit">Total Profit</option>
            <option value="winRate">Win Rate</option>
            <option value="bets">Total Bets</option>
          </select>
        </div>
      </div>

      {/* Top 3 Podium */}
      <div className="podium-section">
        {sortedLeaderboard.slice(0, 3).map((user, index) => (
          <div key={user.address} className={`podium-item podium-${index + 1}`}>
            <div className="podium-avatar">
              {user.avatar || '👤'}
            </div>
            <div className="podium-rank">
              {getRankIcon(user.rank)}
            </div>
            <div className="podium-name">
              {user.displayName}
            </div>
            <div className="podium-profit">
              +{user.totalProfit.toFixed(2)} ETH
            </div>
            <div className="podium-stats">
              <span>{user.winRate.toFixed(1)}% win rate</span>
              <span>{user.totalBets} bets</span>
            </div>
          </div>
        ))}
      </div>

      {/* Full Leaderboard */}
      <div className="leaderboard-table">
        <div className="table-header">
          <div className="col-rank">Rank</div>
          <div className="col-user">User</div>
          <div className="col-profit">Profit</div>
          <div className="col-winrate">Win Rate</div>
          <div className="col-bets">Bets</div>
          <div className="col-created">Created</div>
        </div>

        {sortedLeaderboard.map((user) => (
          <div key={user.address} className={`table-row ${user.isCurrentUser ? 'current-user' : ''}`}>
            <div className="col-rank">
              <span className={`rank-badge ${getRankStyle(user.rank)}`}>
                {getRankIcon(user.rank)}
              </span>
            </div>

            <div className="col-user">
              <div className="user-info">
                <div className="user-avatar">
                  {user.avatar || '👤'}
                </div>
                <div className="user-details">
                  <div className="user-name">
                    {user.displayName}
                    {user.isCurrentUser && <span className="current-user-badge">You</span>}
                  </div>
                  <div className="user-address">
                    {user.address.slice(0, 6)}...{user.address.slice(-4)}
                  </div>
                </div>
              </div>
            </div>

            <div className="col-profit">
              <div className="profit-amount">
                +{user.totalProfit.toFixed(3)} ETH
              </div>
              <div className="profit-staked">
                {user.totalStaked.toFixed(1)} ETH staked
              </div>
            </div>

            <div className="col-winrate">
              <div className="winrate-value">{user.winRate.toFixed(1)}%</div>
              <div className="winrate-bar">
                <div
                  className="winrate-fill"
                  style={{ width: `${user.winRate}%` }}
                ></div>
              </div>
            </div>

            <div className="col-bets">
              {user.totalBets}
            </div>

            <div className="col-created">
              {user.predictionsCreated}
            </div>
          </div>
        ))}
      </div>

      {/* Stats Summary */}
      <div className="leaderboard-summary">
        <div className="summary-card">
          <div className="summary-icon">👥</div>
          <div className="summary-content">
            <div className="summary-value">{leaderboard.length}</div>
            <div className="summary-label">Active Users</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon">💰</div>
          <div className="summary-content">
            <div className="summary-value">
              {leaderboard.reduce((sum, user) => sum + user.totalProfit, 0).toFixed(2)} ETH
            </div>
            <div className="summary-label">Total Profits</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon">🎯</div>
          <div className="summary-content">
            <div className="summary-value">
              {(leaderboard.reduce((sum, user) => sum + user.winRate, 0) / leaderboard.length).toFixed(1)}%
            </div>
            <div className="summary-label">Avg Win Rate</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon">📊</div>
          <div className="summary-content">
            <div className="summary-value">
              {leaderboard.reduce((sum, user) => sum + user.totalBets, 0)}
            </div>
            <div className="summary-label">Total Bets</div>
          </div>
        </div>
      </div>
    </div>
  );
}

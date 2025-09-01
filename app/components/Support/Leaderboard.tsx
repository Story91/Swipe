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

  // Mock leaderboard data
  useEffect(() => {
    const mockData: LeaderboardUser[] = [
      {
        rank: 1,
        address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        displayName: 'CryptoWhale',
        avatar: '🐋',
        totalProfit: 15.67,
        totalBets: 45,
        winRate: 78.5,
        totalStaked: 28.3,
        predictionsCreated: 12
      },
      {
        rank: 2,
        address: '0x987Fcba5213D9085c453C3B5eE5D1d9f8c7b2A1f',
        displayName: 'PredictionMaster',
        avatar: '🎯',
        totalProfit: 12.34,
        totalBets: 38,
        winRate: 82.1,
        totalStaked: 22.1,
        predictionsCreated: 8
      },
      {
        rank: 3,
        address: '0x456Def789Abc1234567890Abcdef123456789012',
        displayName: 'OracleSeer',
        avatar: '🔮',
        totalProfit: 9.87,
        totalBets: 52,
        winRate: 71.2,
        totalStaked: 31.5,
        predictionsCreated: 15
      },
      {
        rank: 4,
        address: '0x123Abc456Def78901234567890Abcdef12345678',
        displayName: 'BettingBull',
        avatar: '🐂',
        totalProfit: 8.92,
        totalBets: 29,
        winRate: 86.2,
        totalStaked: 18.7,
        predictionsCreated: 5
      },
      {
        rank: 5,
        address: '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd',
        displayName: 'DexterAdmin',
        avatar: '👑',
        totalProfit: 7.45,
        totalBets: 67,
        winRate: 65.7,
        totalStaked: 42.1,
        predictionsCreated: 25
      },
      {
        rank: 6,
        address: '0x1111222233334444555566667777888899990000',
        displayName: 'LuckyTrader',
        avatar: '🍀',
        totalProfit: 6.78,
        totalBets: 33,
        winRate: 69.7,
        totalStaked: 19.8,
        predictionsCreated: 3
      },
      {
        rank: 7,
        address: '0xAAAA1111BBBB2222CCCC3333DDDD4444EEEE5555',
        displayName: 'MarketMaverick',
        avatar: '📈',
        totalProfit: 5.43,
        totalBets: 41,
        winRate: 73.2,
        totalStaked: 24.6,
        predictionsCreated: 7
      },
      {
        rank: 8,
        address: '0x9999888877776666555544443333222211110000',
        displayName: 'ProphetAI',
        avatar: '🤖',
        totalProfit: 4.56,
        totalBets: 28,
        winRate: 75.0,
        totalStaked: 16.2,
        predictionsCreated: 2
      },
      {
        rank: 9,
        address: '0x77776666555544443333222211110000AAAA9999',
        displayName: 'SportsSage',
        avatar: '⚽',
        totalProfit: 3.21,
        totalBets: 35,
        winRate: 68.6,
        totalStaked: 21.3,
        predictionsCreated: 4
      },
      {
        rank: 10,
        address: '0x44443333222211110000AAAA9999888877776666',
        displayName: 'TechPredictor',
        avatar: '💻',
        totalProfit: 2.89,
        totalBets: 22,
        winRate: 77.3,
        totalStaked: 13.4,
        predictionsCreated: 6
      }
    ];

    // Mark current user if they're in the leaderboard
    const updatedData = mockData.map(user => ({
      ...user,
      isCurrentUser: user.address.toLowerCase() === address?.toLowerCase()
    }));

    setLeaderboard(updatedData);
  }, [address]);

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

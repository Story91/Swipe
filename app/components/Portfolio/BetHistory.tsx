"use client";

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

interface HistoricalBet {
  id: number;
  question: string;
  category: string;
  stakeAmount: number;
  choice: 'YES' | 'NO';
  outcome: 'YES' | 'NO';
  status: 'won' | 'lost';
  payout: number;
  profit: number;
  createdAt: number;
  resolvedAt: number;
  imageUrl: string;
  poolSize: number;
  yourPercentage: number;
}

export function BetHistory() {
  const { address } = useAccount();
  const [bets, setBets] = useState<HistoricalBet[]>([]);
  const [filter, setFilter] = useState<'all' | 'won' | 'lost'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'profit' | 'stake'>('date');
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  // Mock historical bets data
  useEffect(() => {
    const mockData: HistoricalBet[] = [
      {
        id: 1,
        question: "Will Bitcoin reach $100,000 by end of 2024?",
        category: "Crypto",
        stakeAmount: 1.0,
        choice: 'YES',
        outcome: 'YES',
        status: 'won',
        payout: 1.33,
        profit: 0.33,
        createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
        resolvedAt: Date.now() - 6 * 24 * 60 * 60 * 1000, // 6 days ago
        imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop",
        poolSize: 15.5,
        yourPercentage: 6.5
      },
      {
        id: 2,
        question: "Manchester United wins Premier League 2024?",
        category: "Sports",
        stakeAmount: 1.5,
        choice: 'NO',
        outcome: 'NO',
        status: 'won',
        payout: 2.25,
        profit: 0.75,
        createdAt: Date.now() - 14 * 24 * 60 * 60 * 1000, // 14 days ago
        resolvedAt: Date.now() - 12 * 24 * 60 * 60 * 1000, // 12 days ago
        imageUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=300&fit=crop",
        poolSize: 22.0,
        yourPercentage: 6.8
      },
      {
        id: 3,
        question: "Will Tesla stock reach $300 by Q4 2024?",
        category: "Finance",
        stakeAmount: 0.8,
        choice: 'YES',
        outcome: 'NO',
        status: 'lost',
        payout: 0,
        profit: -0.8,
        createdAt: Date.now() - 21 * 24 * 60 * 60 * 1000, // 21 days ago
        resolvedAt: Date.now() - 18 * 24 * 60 * 60 * 1000, // 18 days ago
        imageUrl: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400&h=300&fit=crop",
        poolSize: 12.3,
        yourPercentage: 6.5
      },
      {
        id: 4,
        question: "Will Ethereum 2.0 launch successfully in 2024?",
        category: "Crypto",
        stakeAmount: 0.6,
        choice: 'YES',
        outcome: 'YES',
        status: 'won',
        payout: 0.84,
        profit: 0.24,
        createdAt: Date.now() - 28 * 24 * 60 * 60 * 1000, // 28 days ago
        resolvedAt: Date.now() - 25 * 24 * 60 * 60 * 1000, // 25 days ago
        imageUrl: "https://images.unsplash.com/photo-1640839198195-2f8c8f4c8f7a?w=400&h=300&fit=crop",
        poolSize: 18.7,
        yourPercentage: 3.2
      },
      {
        id: 5,
        question: "Will Solana reach $200 by end of 2024?",
        category: "Crypto",
        stakeAmount: 1.2,
        choice: 'YES',
        outcome: 'NO',
        status: 'lost',
        payout: 0,
        profit: -1.2,
        createdAt: Date.now() - 35 * 24 * 60 * 60 * 1000, // 35 days ago
        resolvedAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
        imageUrl: "https://images.unsplash.com/photo-1639762681057-408e52192e55?w=400&h=300&fit=crop",
        poolSize: 25.8,
        yourPercentage: 4.7
      },
      {
        id: 6,
        question: "Will Apple release AR glasses in 2024?",
        category: "Technology",
        stakeAmount: 0.4,
        choice: 'YES',
        outcome: 'YES',
        status: 'won',
        payout: 0.52,
        profit: 0.12,
        createdAt: Date.now() - 42 * 24 * 60 * 60 * 1000, // 42 days ago
        resolvedAt: Date.now() - 38 * 24 * 60 * 60 * 1000, // 38 days ago
        imageUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=400&h=300&fit=crop",
        poolSize: 8.9,
        yourPercentage: 4.5
      },
      {
        id: 7,
        question: "Will US inflation drop below 3% by Q4?",
        category: "Finance",
        stakeAmount: 0.9,
        choice: 'NO',
        outcome: 'YES',
        status: 'lost',
        payout: 0,
        profit: -0.9,
        createdAt: Date.now() - 49 * 24 * 60 * 60 * 1000, // 49 days ago
        resolvedAt: Date.now() - 45 * 24 * 60 * 60 * 1000, // 45 days ago
        imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=300&fit=crop",
        poolSize: 14.2,
        yourPercentage: 6.3
      },
      {
        id: 8,
        question: "Will Netflix subscriber growth return in 2024?",
        category: "Entertainment",
        stakeAmount: 0.7,
        choice: 'YES',
        outcome: 'YES',
        status: 'won',
        payout: 0.91,
        profit: 0.21,
        createdAt: Date.now() - 56 * 24 * 60 * 60 * 1000, // 56 days ago
        resolvedAt: Date.now() - 52 * 24 * 60 * 60 * 1000, // 52 days ago
        imageUrl: "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=400&h=300&fit=crop",
        poolSize: 11.6,
        yourPercentage: 6.0
      }
    ];

    setBets(mockData);
  }, []);

  const getTimeRangeFilter = (bet: HistoricalBet) => {
    const now = Date.now();
    const daysSinceResolved = (now - bet.resolvedAt) / (24 * 60 * 60 * 1000);

    switch (timeRange) {
      case '7d': return daysSinceResolved <= 7;
      case '30d': return daysSinceResolved <= 30;
      case '90d': return daysSinceResolved <= 90;
      default: return true;
    }
  };

  const filteredBets = bets.filter(bet => {
    const matchesFilter = filter === 'all' || bet.status === filter;
    const matchesTimeRange = getTimeRangeFilter(bet);
    return matchesFilter && matchesTimeRange;
  });

  const sortedBets = [...filteredBets].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return b.resolvedAt - a.resolvedAt;
      case 'profit':
        return Math.abs(b.profit) - Math.abs(a.profit);
      case 'stake':
        return b.stakeAmount - a.stakeAmount;
      default:
        return b.resolvedAt - a.resolvedAt;
    }
  });

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    if (days > 0) return `${days}d ${hours}h ago`;
    return `${hours}h ago`;
  };

  const totalStats = {
    totalBets: filteredBets.length,
    wonBets: filteredBets.filter(b => b.status === 'won').length,
    lostBets: filteredBets.filter(b => b.status === 'lost').length,
    totalStaked: filteredBets.reduce((sum, b) => sum + b.stakeAmount, 0),
    totalPayout: filteredBets.reduce((sum, b) => sum + b.payout, 0),
    totalProfit: filteredBets.reduce((sum, b) => sum + b.profit, 0),
    winRate: filteredBets.length > 0
      ? (filteredBets.filter(b => b.status === 'won').length / filteredBets.length) * 100
      : 0
  };

  if (!address) {
    return (
      <div className="bet-history">
        <div className="connect-wallet-notice">
          <h2>🔒 Connect Wallet</h2>
          <p>Please connect your wallet to view your bet history.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bet-history">
      <div className="history-header">
        <h1>📚 Bet History</h1>
        <p>Your completed prediction bets</p>
      </div>

      {/* Summary Stats */}
      <div className="history-stats">
        <div className="stat-card">
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <div className="stat-value">{totalStats.totalBets}</div>
            <div className="stat-label">Total Bets</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🏆</div>
          <div className="stat-content">
            <div className="stat-value">{totalStats.winRate.toFixed(1)}%</div>
            <div className="stat-label">Win Rate</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className={`stat-value ${totalStats.totalProfit >= 0 ? 'positive' : 'negative'}`}>
              {totalStats.totalProfit >= 0 ? '+' : ''}{totalStats.totalProfit.toFixed(3)} ETH
            </div>
            <div className="stat-label">Total Profit</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">{totalStats.totalStaked.toFixed(3)} ETH</div>
            <div className="stat-label">Total Staked</div>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="history-controls">
        <div className="filter-group">
          <label>Filter by result:</label>
          <div className="filter-buttons">
            <button
              className={`filter-button ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({totalStats.totalBets})
            </button>
            <button
              className={`filter-button ${filter === 'won' ? 'active' : ''}`}
              onClick={() => setFilter('won')}
            >
              Won ({totalStats.wonBets})
            </button>
            <button
              className={`filter-button ${filter === 'lost' ? 'active' : ''}`}
              onClick={() => setFilter('lost')}
            >
              Lost ({totalStats.lostBets})
            </button>
          </div>
        </div>

        <div className="control-group">
          <div className="sort-control">
            <label>Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'profit' | 'stake')}
              className="sort-select"
            >
              <option value="date">Date Resolved</option>
              <option value="profit">Profit Amount</option>
              <option value="stake">Stake Amount</option>
            </select>
          </div>

          <div className="time-control">
            <label>Time range:</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as '7d' | '30d' | '90d' | 'all')}
              className="time-select"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bet History List */}
      <div className="history-content">
        {sortedBets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>No bets found</h3>
            <p>
              {filter === 'all'
                ? 'You have no completed bets in this time range.'
                : `You have no ${filter} bets in this time range.`
              }
            </p>
          </div>
        ) : (
          <div className="history-list">
            {sortedBets.map((bet) => (
              <div key={bet.id} className="history-item">
                <div className="item-image">
                  <img src={bet.imageUrl} alt={bet.question} />
                  <div className="item-category">{bet.category}</div>
                  <div className={`item-status ${bet.status}`}>
                    {bet.status === 'won' ? '✅' : '❌'}
                  </div>
                </div>

                <div className="item-content">
                  <div className="item-header">
                    <h4>{bet.question}</h4>
                    <div className="item-outcome">
                      <span className="outcome-label">Result:</span>
                      <span className={`outcome-value ${bet.outcome.toLowerCase()}`}>
                        {bet.outcome}
                      </span>
                    </div>
                  </div>

                  <div className="item-details">
                    <div className="detail-row">
                      <span className="label">Your Bet:</span>
                      <span className="value">{bet.stakeAmount} ETH on {bet.choice}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Payout:</span>
                      <span className="value">{bet.payout.toFixed(3)} ETH</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Profit/Loss:</span>
                      <span className={`value ${bet.profit >= 0 ? 'profit' : 'loss'}`}>
                        {bet.profit >= 0 ? '+' : ''}{bet.profit.toFixed(3)} ETH
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Your Share:</span>
                      <span className="value">{bet.yourPercentage.toFixed(1)}%</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Pool Size:</span>
                      <span className="value">{bet.poolSize.toFixed(1)} ETH</span>
                    </div>
                  </div>

                  <div className="item-footer">
                    <div className="item-times">
                      <span className="time-info">
                        <span className="label">Bet:</span>
                        {formatTime(bet.createdAt)}
                      </span>
                      <span className="time-info">
                        <span className="label">Resolved:</span>
                        {formatTime(bet.resolvedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

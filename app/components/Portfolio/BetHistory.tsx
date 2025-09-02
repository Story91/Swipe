"use client";

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

interface HistoricalBet {
  id: string;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBetHistory = async () => {
      if (!address) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/portfolio?userAddress=${address}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.success) {
          const { portfolio } = result.data;

          // Filter for only resolved bets (won/lost) and transform to HistoricalBet format
          const historicalBetsData = portfolio
            .filter((item: any) => item.status === 'won' || item.status === 'lost')
            .map((item: any) => ({
              id: item.id,
              question: item.question,
              category: item.category,
              stakeAmount: item.stakeAmount,
              choice: item.choice,
              outcome: item.choice === 'YES' ? 'YES' : 'NO', // Mock outcome - in real app would come from prediction
              status: item.status,
              payout: item.potentialPayout,
              profit: item.profit,
              createdAt: item.createdAt,
              resolvedAt: item.createdAt + (24 * 60 * 60 * 1000), // Mock resolved time - 1 day after creation
              imageUrl: item.imageUrl,
              poolSize: item.stakeAmount * 3, // Mock pool size
              yourPercentage: Math.floor(Math.random() * 10) + 1 // Mock percentage
            }));

          setBets(historicalBetsData);
        } else {
          throw new Error(result.error || 'Failed to fetch bet history');
        }
      } catch (err) {
        console.error('❌ Failed to fetch bet history:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch bet history data');
      } finally {
        setLoading(false);
      }
    };

    fetchBetHistory();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchBetHistory, 30000);
    return () => clearInterval(interval);
  }, [address]);

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

  if (loading) {
    return (
      <div className="bet-history">
        <div className="history-header">
          <h1>📚 Bet History</h1>
          <p>Loading bet history data...</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bet-history">
        <div className="history-header">
          <h1>📚 Bet History</h1>
          <p>Your completed prediction bets</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: 'red' }}>
          <div>❌ Failed to load bet history</div>
          <div style={{ fontSize: '14px', marginTop: '10px' }}>{error}</div>
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

"use client";

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

interface ActiveBet {
  id: string;
  question: string;
  category: string;
  stakeAmount: number;
  choice: 'YES' | 'NO';
  potentialPayout: number;
  profit: number;
  timeLeft: string;
  createdAt: number;
  imageUrl: string;
  yesPercentage: number;
  noPercentage: number;
  totalPool: number;
}

export function ActiveBets() {
  const { address } = useAccount();
  const [activeBets, setActiveBets] = useState<ActiveBet[]>([]);
  const [filter, setFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'stake' | 'profit'>('time');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchActiveBets = async () => {
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

          // Filter for only active bets and transform to ActiveBet format
          const activeBetsData = portfolio
            .filter((item: any) => item.status === 'active')
            .map((item: any) => ({
              id: item.id,
              question: item.question,
              category: item.category,
              stakeAmount: item.stakeAmount,
              choice: item.choice,
              potentialPayout: item.potentialPayout,
              profit: item.profit,
              timeLeft: calculateTimeLeft(item.createdAt), // Will need to calculate this
              createdAt: item.createdAt,
              imageUrl: item.imageUrl,
              yesPercentage: 50, // Mock for now - would need to calculate from prediction data
              noPercentage: 50,  // Mock for now - would need to calculate from prediction data
              totalPool: item.stakeAmount * 2 // Mock for now
            }));

          setActiveBets(activeBetsData);
        } else {
          throw new Error(result.error || 'Failed to fetch active bets');
        }
      } catch (err) {
        console.error('❌ Failed to fetch active bets:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch active bets data');
      } finally {
        setLoading(false);
      }
    };

    fetchActiveBets();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchActiveBets, 30000);
    return () => clearInterval(interval);
  }, [address]);

  const calculateTimeLeft = (createdAt: number) => {
    // Mock calculation - in real app would get deadline from prediction
    const mockDeadline = createdAt + (7 * 24 * 60 * 60 * 1000); // 7 days from creation
    const now = Date.now();
    const diff = mockDeadline - now;

    if (diff <= 0) return "Ended";

    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const filteredBets = activeBets.filter(bet => {
    if (filter === 'all') return true;
    return bet.choice.toLowerCase() === filter;
  });

  const sortedBets = [...filteredBets].sort((a, b) => {
    switch (sortBy) {
      case 'stake':
        return b.stakeAmount - a.stakeAmount;
      case 'profit':
        return b.profit - a.profit;
      case 'time':
      default:
        return a.createdAt - b.createdAt;
    }
  });

  const getUrgencyColor = (timeLeft: string) => {
    const hours = parseInt(timeLeft.split('h')[0]);
    if (hours <= 24) return 'text-red-600 bg-red-100';
    if (hours <= 72) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m ago`;
    return `${minutes}m ago`;
  };

  if (!address) {
    return (
      <div className="active-bets">
        <div className="connect-wallet-notice">
          <h2>🔒 Connect Wallet</h2>
          <p>Please connect your wallet to view your active bets.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="active-bets">
        <div className="bets-header">
          <h1>⚡ Active Bets</h1>
          <p>Loading active bets data...</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="active-bets">
        <div className="bets-header">
          <h1>⚡ Active Bets</h1>
          <p>Your ongoing prediction investments</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: 'red' }}>
          <div>❌ Failed to load active bets</div>
          <div style={{ fontSize: '14px', marginTop: '10px' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="active-bets">
      <div className="bets-header">
        <h1>⚡ Active Bets</h1>
        <p>Your ongoing prediction investments</p>
      </div>

      {/* Stats Overview */}
      <div className="bets-stats">
        <div className="stat-card">
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <div className="stat-value">{activeBets.length}</div>
            <div className="stat-label">Active Bets</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className="stat-value">
              {activeBets.reduce((sum, bet) => sum + bet.stakeAmount, 0).toFixed(3)} ETH
            </div>
            <div className="stat-label">Total Staked</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <div className="stat-value">
              {activeBets.reduce((sum, bet) => sum + bet.potentialPayout, 0).toFixed(3)} ETH
            </div>
            <div className="stat-label">Potential Payout</div>
          </div>
        </div>
      </div>

      {/* Filters and Sorting */}
      <div className="bets-controls">
        <div className="filter-controls">
          <label>Filter by choice:</label>
          <div className="filter-buttons">
            <button
              className={`filter-button ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({activeBets.length})
            </button>
            <button
              className={`filter-button ${filter === 'yes' ? 'active' : ''}`}
              onClick={() => setFilter('yes')}
            >
              YES ({activeBets.filter(b => b.choice === 'YES').length})
            </button>
            <button
              className={`filter-button ${filter === 'no' ? 'active' : ''}`}
              onClick={() => setFilter('no')}
            >
              NO ({activeBets.filter(b => b.choice === 'NO').length})
            </button>
          </div>
        </div>

        <div className="sort-controls">
          <label>Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'time' | 'stake' | 'profit')}
            className="sort-select"
          >
            <option value="time">Time Created</option>
            <option value="stake">Stake Amount</option>
            <option value="profit">Potential Profit</option>
          </select>
        </div>
      </div>

      {/* Bets List */}
      <div className="bets-content">
        {sortedBets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎯</div>
            <h3>No active bets found</h3>
            <p>
              {filter === 'all'
                ? 'You have no active predictions at the moment.'
                : `You have no active ${filter} predictions.`
              }
            </p>
          </div>
        ) : (
          <div className="bets-grid">
            {sortedBets.map((bet) => (
              <div key={bet.id} className="bet-card">
                <div className="bet-image">
                  <img src={bet.imageUrl} alt={bet.question} />
                  <div className="bet-category">{bet.category}</div>
                </div>

                <div className="bet-content">
                  <div className="bet-header">
                    <h4>{bet.question}</h4>
                    <div className="bet-choice">
                      <span className={`choice-badge ${bet.choice.toLowerCase()}`}>
                        {bet.choice}
                      </span>
                    </div>
                  </div>

                  <div className="bet-stats">
                    <div className="market-progress">
                      <div className="progress-bar">
                        <div
                          className="progress-fill yes-fill"
                          style={{ width: `${bet.yesPercentage}%` }}
                        ></div>
                      </div>
                      <div className="progress-labels">
                        <span>YES {bet.yesPercentage}%</span>
                        <span>NO {bet.noPercentage}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="bet-details">
                    <div className="detail-item">
                      <span className="label">Your Stake:</span>
                      <span className="value">{bet.stakeAmount} ETH</span>
                    </div>
                    <div className="detail-item">
                      <span className="label">Potential Payout:</span>
                      <span className="value">{bet.potentialPayout.toFixed(3)} ETH</span>
                    </div>
                    <div className="detail-item">
                      <span className="label">Profit:</span>
                      <span className="value profit">+{bet.profit.toFixed(3)} ETH</span>
                    </div>
                    <div className="detail-item">
                      <span className="label">Total Pool:</span>
                      <span className="value">{bet.totalPool.toFixed(3)} ETH</span>
                    </div>
                  </div>

                  <div className="bet-footer">
                    <div className="bet-time">
                      <span className={`time-badge ${getUrgencyColor(bet.timeLeft)}`}>
                        ⏰ {bet.timeLeft} left
                      </span>
                      <span className="created-time">
                        Created {formatTime(bet.createdAt)}
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

"use client";

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

interface ActiveBet {
  id: number;
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

  // Mock active bets data
  useEffect(() => {
    const mockData: ActiveBet[] = [
      {
        id: 1,
        question: "Will Bitcoin reach $100,000 by end of 2024?",
        category: "Crypto",
        stakeAmount: 0.5,
        choice: 'YES',
        potentialPayout: 0.73,
        profit: 0.23,
        timeLeft: "2d 14h",
        createdAt: Date.now() - 2 * 60 * 60 * 1000,
        imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop",
        yesPercentage: 65,
        noPercentage: 35,
        totalPool: 5.2
      },
      {
        id: 2,
        question: "Will Tesla stock reach $300 by Q4 2024?",
        category: "Finance",
        stakeAmount: 0.8,
        choice: 'YES',
        potentialPayout: 1.1,
        profit: 0.3,
        timeLeft: "1d 8h",
        createdAt: Date.now() - 30 * 60 * 1000,
        imageUrl: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400&h=300&fit=crop",
        yesPercentage: 58,
        noPercentage: 42,
        totalPool: 3.8
      },
      {
        id: 3,
        question: "Will Ethereum 2.0 launch successfully in 2024?",
        category: "Crypto",
        stakeAmount: 0.25,
        choice: 'NO',
        potentialPayout: 0.45,
        profit: 0.2,
        timeLeft: "5d 22h",
        createdAt: Date.now() - 4 * 60 * 60 * 1000,
        imageUrl: "https://images.unsplash.com/photo-1640839198195-2f8c8f4c8f7a?w=400&h=300&fit=crop",
        yesPercentage: 45,
        noPercentage: 55,
        totalPool: 7.1
      },
      {
        id: 4,
        question: "Will Manchester United win Premier League 2024?",
        category: "Sports",
        stakeAmount: 1.2,
        choice: 'NO',
        potentialPayout: 1.8,
        profit: 0.6,
        timeLeft: "12h 30m",
        createdAt: Date.now() - 6 * 60 * 60 * 1000,
        imageUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=300&fit=crop",
        yesPercentage: 72,
        noPercentage: 28,
        totalPool: 12.5
      }
    ];

    setActiveBets(mockData);
  }, []);

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

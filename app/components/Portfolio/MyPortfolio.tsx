"use client";

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

interface PortfolioStats {
  totalInvested: number;
  totalPayout: number;
  totalProfit: number;
  activeBets: number;
  wonBets: number;
  lostBets: number;
  winRate: number;
}

interface PortfolioItem {
  id: string;
  question: string;
  category: string;
  stakeAmount: number;
  choice: 'YES' | 'NO';
  status: 'active' | 'won' | 'lost' | 'pending';
  potentialPayout: number;
  profit: number;
  createdAt: number;
  imageUrl: string;
}

export function MyPortfolio() {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<'overview' | 'active' | 'history'>('overview');
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [stats, setStats] = useState<PortfolioStats>({
    totalInvested: 0,
    totalPayout: 0,
    totalProfit: 0,
    activeBets: 0,
    wonBets: 0,
    lostBets: 0,
    winRate: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPortfolio = async () => {
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
          const { portfolio, stats: portfolioStats } = result.data;
          setPortfolioItems(portfolio);
          setStats(portfolioStats);
        } else {
          throw new Error(result.error || 'Failed to fetch portfolio');
        }
      } catch (err) {
        console.error('❌ Failed to fetch portfolio:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch portfolio data');
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolio();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchPortfolio, 30000);
    return () => clearInterval(interval);
  }, [address]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-blue-600 bg-blue-100';
      case 'won': return 'text-green-600 bg-green-100';
      case 'lost': return 'text-red-600 bg-red-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  };

  const filteredItems = portfolioItems.filter(item => {
    switch (activeTab) {
      case 'active': return item.status === 'active' || item.status === 'pending';
      case 'history': return item.status === 'won' || item.status === 'lost';
      default: return true;
    }
  });

  if (!address) {
    return (
      <div className="my-portfolio">
        <div className="connect-wallet-notice">
          <h2>🔒 Connect Wallet</h2>
          <p>Please connect your wallet to view your portfolio.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="my-portfolio">
        <div className="portfolio-header">
          <h1>💼 My Portfolio</h1>
          <p>Loading portfolio data...</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-portfolio">
        <div className="portfolio-header">
          <h1>💼 My Portfolio</h1>
          <p>Your prediction investments and performance</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: 'red' }}>
          <div>❌ Failed to load portfolio</div>
          <div style={{ fontSize: '14px', marginTop: '10px' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-portfolio">
      <div className="portfolio-header">
        <h1>💼 My Portfolio</h1>
        <p>Your prediction investments and performance</p>
      </div>

      {/* Overview Stats */}
      <div className="portfolio-stats">
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalInvested.toFixed(3)} ETH</div>
            <div className="stat-label">Total Invested</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalProfit >= 0 ? '+' : ''}{stats.totalProfit.toFixed(3)} ETH</div>
            <div className="stat-label">Total Profit/Loss</div>
            <div className={`stat-change ${stats.totalProfit >= 0 ? 'positive' : 'negative'}`}>
              {stats.totalProfit >= 0 ? '↗' : '↘'}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <div className="stat-value">{stats.winRate.toFixed(1)}%</div>
            <div className="stat-label">Win Rate</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">⚡</div>
          <div className="stat-content">
            <div className="stat-value">{stats.activeBets}</div>
            <div className="stat-label">Active Bets</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="portfolio-tabs">
        <button
          className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button
          className={`tab-button ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          ⚡ Active Bets ({stats.activeBets})
        </button>
        <button
          className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📚 History ({stats.wonBets + stats.lostBets})
        </button>
      </div>

      {/* Content */}
      <div className="portfolio-content">
        {filteredItems.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>No {activeTab === 'active' ? 'active' : 'historical'} bets found</h3>
            <p>
              {activeTab === 'active'
                ? 'Your active predictions will appear here.'
                : 'Your prediction history will appear here once you have completed bets.'
              }
            </p>
          </div>
        ) : (
          <div className="portfolio-items">
            {filteredItems.map((item) => (
              <div key={item.id} className="portfolio-item">
                <div className="item-image">
                  <img src={item.imageUrl} alt={item.question} />
                </div>

                <div className="item-content">
                  <div className="item-header">
                    <h4>{item.question}</h4>
                    <span className={`status-badge ${getStatusColor(item.status)}`}>
                      {item.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="item-details">
                    <div className="detail-row">
                      <span className="label">Category:</span>
                      <span className="value">{item.category}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Your Bet:</span>
                      <span className="value">{item.stakeAmount} ETH on {item.choice}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Potential Payout:</span>
                      <span className="value">{item.potentialPayout.toFixed(3)} ETH</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Profit/Loss:</span>
                      <span className={`value ${item.profit >= 0 ? 'profit' : 'loss'}`}>
                        {item.profit >= 0 ? '+' : ''}{item.profit.toFixed(3)} ETH
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Created:</span>
                      <span className="value">{formatTime(item.createdAt)}</span>
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

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
  id: number;
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

  // Mock portfolio data - in real app this would come from contract
  useEffect(() => {
    const mockData: PortfolioItem[] = [
      {
        id: 1,
        question: "Will Bitcoin reach $100,000 by end of 2024?",
        category: "Crypto",
        stakeAmount: 0.5,
        choice: 'YES',
        status: 'active',
        potentialPayout: 0.73,
        profit: 0.23,
        createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
        imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop"
      },
      {
        id: 2,
        question: "Manchester United wins Premier League 2024?",
        category: "Sports",
        stakeAmount: 1.0,
        choice: 'NO',
        status: 'won',
        potentialPayout: 1.33,
        profit: 0.33,
        createdAt: Date.now() - 5 * 60 * 60 * 1000, // 5 hours ago
        imageUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=300&fit=crop"
      },
      {
        id: 3,
        question: "Will Ethereum 2.0 launch successfully in 2024?",
        category: "Crypto",
        stakeAmount: 0.25,
        choice: 'YES',
        status: 'lost',
        potentialPayout: 0,
        profit: -0.25,
        createdAt: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
        imageUrl: "https://images.unsplash.com/photo-1640839198195-2f8c8f4c8f7a?w=400&h=300&fit=crop"
      },
      {
        id: 4,
        question: "Will Tesla stock reach $300 by Q4 2024?",
        category: "Finance",
        stakeAmount: 0.8,
        choice: 'YES',
        status: 'pending',
        potentialPayout: 1.1,
        profit: 0.3,
        createdAt: Date.now() - 30 * 60 * 1000, // 30 minutes ago
        imageUrl: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400&h=300&fit=crop"
      }
    ];

    setPortfolioItems(mockData);

    // Calculate stats
    const active = mockData.filter(item => item.status === 'active').length;
    const won = mockData.filter(item => item.status === 'won').length;
    const lost = mockData.filter(item => item.status === 'lost').length;
    const totalInvested = mockData.reduce((sum, item) => sum + item.stakeAmount, 0);
    const totalPayout = mockData.reduce((sum, item) => sum + (item.status === 'won' ? item.potentialPayout : 0), 0);
    const totalProfit = mockData.reduce((sum, item) => sum + item.profit, 0);

    setStats({
      totalInvested,
      totalPayout,
      totalProfit,
      activeBets: active,
      wonBets: won,
      lostBets: lost,
      winRate: won + lost > 0 ? (won / (won + lost)) * 100 : 0
    });
  }, []);

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

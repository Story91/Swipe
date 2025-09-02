"use client";

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

interface ActivityItem {
  id: string;
  type: 'prediction_created' | 'bet_placed' | 'prediction_resolved' | 'payout_claimed' | 'prediction_approved' | 'user_joined';
  timestamp: number;
  user: {
    address: string;
    displayName: string;
    avatar?: string;
  };
  prediction?: {
    id: number;
    question: string;
    category: string;
  };
  details?: {
    amount?: number;
    choice?: 'YES' | 'NO';
    outcome?: 'YES' | 'NO';
    payout?: number;
    stake?: number;
  };
  isCurrentUser?: boolean;
}

export function RecentActivity() {
  const { address } = useAccount();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'me' | 'predictions' | 'bets'>('all');
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const mockActivities: ActivityItem[] = [
      {
        id: '1',
        type: 'prediction_resolved',
        timestamp: Date.now() - 5 * 60 * 1000, // 5 minutes ago
        user: {
          address: '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd',
          displayName: 'DexterAdmin',
          avatar: '👑'
        },
        prediction: {
          id: 1,
          question: 'Will Bitcoin reach $100,000 by end of 2024?',
          category: 'Crypto'
        },
        details: {
          outcome: 'YES',
          payout: 25.67
        }
      },
      {
        id: '2',
        type: 'payout_claimed',
        timestamp: Date.now() - 8 * 60 * 1000, // 8 minutes ago
        user: {
          address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
          displayName: 'CryptoWhale',
          avatar: '🐋'
        },
        prediction: {
          id: 1,
          question: 'Will Bitcoin reach $100,000 by end of 2024?',
          category: 'Crypto'
        },
        details: {
          payout: 3.45,
          stake: 1.2
        }
      },
      {
        id: '3',
        type: 'bet_placed',
        timestamp: Date.now() - 12 * 60 * 1000, // 12 minutes ago
        user: {
          address: '0x987Fcba5213D9085c453C3B5eE5D1d9f8c7b2A1f',
          displayName: 'PredictionMaster',
          avatar: '🎯'
        },
        prediction: {
          id: 2,
          question: 'Will Tesla stock reach $300 by Q4 2024?',
          category: 'Finance'
        },
        details: {
          choice: 'YES',
          amount: 0.8
        }
      },
      {
        id: '4',
        type: 'prediction_approved',
        timestamp: Date.now() - 18 * 60 * 1000, // 18 minutes ago
        user: {
          address: '0x987Fcba5213D9085c453C3B5eE5D1d9f8c7b2A1f',
          displayName: 'PredictionMaster',
          avatar: '✅'
        },
        prediction: {
          id: 3,
          question: 'Will Ethereum 2.0 launch successfully in 2024?',
          category: 'Crypto'
        }
      },
      {
        id: '5',
        type: 'prediction_created',
        timestamp: Date.now() - 25 * 60 * 1000, // 25 minutes ago
        user: {
          address: '0x456Def789Abc1234567890Abcdef123456789012',
          displayName: 'OracleSeer',
          avatar: '🔮'
        },
        prediction: {
          id: 3,
          question: 'Will Ethereum 2.0 launch successfully in 2024?',
          category: 'Crypto'
        }
      },
      {
        id: '6',
        type: 'bet_placed',
        timestamp: Date.now() - 32 * 60 * 1000, // 32 minutes ago
        user: {
          address: '0x123Abc456Def78901234567890Abcdef12345678',
          displayName: 'BettingBull',
          avatar: '🐂'
        },
        prediction: {
          id: 4,
          question: 'Will Manchester United win Premier League 2024?',
          category: 'Sports'
        },
        details: {
          choice: 'NO',
          amount: 1.2
        }
      },
      {
        id: '7',
        type: 'user_joined',
        timestamp: Date.now() - 45 * 60 * 1000, // 45 minutes ago
        user: {
          address: '0x1111222233334444555566667777888899990000',
          displayName: 'LuckyTrader',
          avatar: '🍀'
        },
        details: {}
      },
      {
        id: '8',
        type: 'prediction_created',
        timestamp: Date.now() - 55 * 60 * 1000, // 55 minutes ago
        user: {
          address: '0xAAAA1111BBBB2222CCCC3333DDDD4444EEEE5555',
          displayName: 'MarketMaverick',
          avatar: '📈'
        },
        prediction: {
          id: 4,
          question: 'Will Manchester United win Premier League 2024?',
          category: 'Sports'
        },
        details: {}
      },
      {
        id: '9',
        type: 'bet_placed',
        timestamp: Date.now() - 67 * 60 * 1000, // 67 minutes ago
        user: {
          address: '0x9999888877776666555544443333222211110000',
          displayName: 'ProphetAI',
          avatar: '🤖'
        },
        prediction: {
          id: 1,
          question: 'Will Bitcoin reach $100,000 by end of 2024?',
          category: 'Crypto'
        },
        details: {
          choice: 'YES',
          amount: 0.5
        }
      },
      {
        id: '10',
        type: 'prediction_resolved',
        timestamp: Date.now() - 75 * 60 * 1000, // 75 minutes ago
        user: {
          address: '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd',
          displayName: 'DexterAdmin',
          avatar: '👑'
        },
        prediction: {
          id: 5,
          question: 'Will Solana reach $200 by end of 2024?',
          category: 'Crypto'
        },
        details: {
          outcome: 'NO',
          payout: 18.34
        }
      }
    ];

    // Mark current user activities
    const updatedActivities = mockActivities.map(activity => ({
      ...activity,
      isCurrentUser: activity.user.address.toLowerCase() === address?.toLowerCase()
    }));

    setActivities(updatedActivities);
  }, [address]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'prediction_created': return '✨';
      case 'bet_placed': return '🎯';
      case 'prediction_resolved': return '✅';
      case 'payout_claimed': return '💰';
      case 'prediction_approved': return '🔍';
      case 'user_joined': return '👋';
      default: return '📝';
    }
  };

  const formatActivityText = (activity: ActivityItem) => {
    const user = activity.isCurrentUser ? 'You' : activity.user.displayName;

    switch (activity.type) {
      case 'prediction_created':
        return `${user} created prediction "${activity.prediction?.question}"`;
      case 'bet_placed':
        return `${user} bet ${activity.details?.amount || 0} ETH on ${activity.details?.choice || 'UNKNOWN'} for "${activity.prediction?.question}"`;
      case 'prediction_resolved':
        return `${user} resolved "${activity.prediction?.question}" as ${activity.details?.outcome || 'UNKNOWN'}`;
      case 'payout_claimed':
        return `${user} claimed ${activity.details?.payout || 0} ETH payout from "${activity.prediction?.question}"`;
      case 'prediction_approved':
        return `${user} approved prediction "${activity.prediction?.question}"`;
      case 'user_joined':
        return `${user} joined Dexter!`;
      default:
        return `${user} performed an action`;
    }
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  // For now, return activities as-is since filtering is done in API
  // TODO: Implement client-side filtering if needed
  const filteredActivities = activities;

  const handleFilterChange = (newFilter: 'all' | 'me' | 'predictions' | 'bets') => {
    setFilter(newFilter);
  };

  if (loading) {
    return (
      <div className="recent-activity">
        <div className="activity-header">
          <h1>🔔 Recent Activity</h1>
          <p>Loading activity data...</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="recent-activity">
        <div className="activity-header">
          <h1>🔔 Recent Activity</h1>
          <p>Latest happenings on Dexter</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: 'red' }}>
          <div>❌ Failed to load activity</div>
          <div style={{ fontSize: '14px', marginTop: '10px' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="recent-activity">
      <div className="activity-header">
        <h1>🔔 Recent Activity</h1>
        <p>Latest happenings on Dexter</p>
      </div>

      {/* Filters */}
      <div className="activity-filters">
        <div className="filter-group">
          <label>Show:</label>
          <div className="filter-buttons">
            <button
              className={`filter-button ${filter === 'all' ? 'active' : ''}`}
              onClick={() => handleFilterChange('all')}
            >
              All Activity
            </button>
            <button
              className={`filter-button ${filter === 'me' ? 'active' : ''}`}
              onClick={() => handleFilterChange('me')}
            >
              My Activity
            </button>
            <button
              className={`filter-button ${filter === 'predictions' ? 'active' : ''}`}
              onClick={() => handleFilterChange('predictions')}
            >
              Predictions
            </button>
            <button
              className={`filter-button ${filter === 'bets' ? 'active' : ''}`}
              onClick={() => handleFilterChange('bets')}
            >
              Bets & Payouts
            </button>
          </div>
        </div>

        <div className="time-group">
          <label>Time:</label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as '1h' | '24h' | '7d' | '30d')}
            className="time-select"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="activity-feed">
        {filteredActivities.length === 0 ? (
          <div className="no-activity">
            <div className="no-activity-icon">📭</div>
            <h3>No recent activity</h3>
            <p>Try adjusting your filters or check back later.</p>
          </div>
        ) : (
          <div className="activity-list">
            {filteredActivities.map((activity) => (
              <div key={activity.id} className={`activity-item ${activity.isCurrentUser ? 'current-user' : ''}`}>
                <div className="activity-icon">
                  {getActivityIcon(activity.type)}
                </div>

                <div className="activity-content">
                  <div className="activity-text">
                    {formatActivityText(activity)}
                  </div>

                  {activity.prediction && (
                    <div className="activity-prediction">
                      <span className="prediction-category">{activity.prediction.category}</span>
                      <span className="prediction-question">
                        {activity.prediction.question.length > 60
                          ? `${activity.prediction.question.slice(0, 60)}...`
                          : activity.prediction.question
                        }
                      </span>
                    </div>
                  )}

                  <div className="activity-meta">
                    <span className="activity-user">
                      {activity.user.avatar} {activity.user.displayName}
                      {activity.isCurrentUser && <span className="current-user-badge">You</span>}
                    </span>
                    <span className="activity-time">
                      {formatTime(activity.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity Summary */}
      <div className="activity-summary">
        <div className="summary-card">
          <div className="summary-icon">📊</div>
          <div className="summary-content">
            <div className="summary-value">{filteredActivities.length}</div>
            <div className="summary-label">Activities Shown</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon">⚡</div>
          <div className="summary-content">
            <div className="summary-value">
              {filteredActivities.filter(a => a.type === 'bet_placed').length}
            </div>
            <div className="summary-label">Bets Placed</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon">💰</div>
          <div className="summary-content">
            <div className="summary-value">
              {filteredActivities
                .filter(a => a.details?.payout)
                .reduce((sum, a) => sum + (a.details?.payout || 0), 0)
                .toFixed(2)} ETH
            </div>
            <div className="summary-label">Payouts Claimed</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon">✨</div>
          <div className="summary-content">
            <div className="summary-value">
              {filteredActivities.filter(a => a.type === 'prediction_created').length}
            </div>
            <div className="summary-label">Predictions Created</div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar';
import { useFarcasterProfiles } from '../../../lib/hooks/useFarcasterProfiles';
import './Leaderboard.css';

interface LeaderboardUser {
  rank: number;
  address: string;
  totalStakedETH: number;
  totalStakedSWIPE: number;
  predictionsParticipated: number;
}

interface RealLeaderboardData {
  ethLeaderboard: LeaderboardUser[];
  swipeLeaderboard: LeaderboardUser[];
  farcasterProfiles: any[];
  totalUsers: number;
  totalPredictions: number;
  summary: {
    totalETHStaked: number;
    totalSWIPEStaked: number;
    totalPredictionsParticipated: number;
  };
}

// Hardcoded top stakers data
const HARDCODED_LEADERBOARD: LeaderboardUser[] = [
  {
    rank: 1,
    address: "0x1234567890123456789012345678901234567890",
    totalStakedETH: 2.4567,
    totalStakedSWIPE: 150000,
    predictionsParticipated: 12
  },
  {
    rank: 2,
    address: "0x2345678901234567890123456789012345678901",
    totalStakedETH: 1.8901,
    totalStakedSWIPE: 120000,
    predictionsParticipated: 9
  },
  {
    rank: 3,
    address: "0x3456789012345678901234567890123456789012",
    totalStakedETH: 1.5678,
    totalStakedSWIPE: 95000,
    predictionsParticipated: 8
  },
  {
    rank: 4,
    address: "0x4567890123456789012345678901234567890123",
    totalStakedETH: 1.2345,
    totalStakedSWIPE: 78000,
    predictionsParticipated: 7
  },
  {
    rank: 5,
    address: "0x5678901234567890123456789012345678901234",
    totalStakedETH: 0.9876,
    totalStakedSWIPE: 65000,
    predictionsParticipated: 6
  },
  {
    rank: 6,
    address: "0x6789012345678901234567890123456789012345",
    totalStakedETH: 0.8765,
    totalStakedSWIPE: 55000,
    predictionsParticipated: 5
  },
  {
    rank: 7,
    address: "0x7890123456789012345678901234567890123456",
    totalStakedETH: 0.7654,
    totalStakedSWIPE: 45000,
    predictionsParticipated: 4
  },
  {
    rank: 8,
    address: "0x8901234567890123456789012345678901234567",
    totalStakedETH: 0.6543,
    totalStakedSWIPE: 38000,
    predictionsParticipated: 4
  },
  {
    rank: 9,
    address: "0x9012345678901234567890123456789012345678",
    totalStakedETH: 0.5432,
    totalStakedSWIPE: 32000,
    predictionsParticipated: 3
  },
  {
    rank: 10,
    address: "0x0123456789012345678901234567890123456789",
    totalStakedETH: 0.4321,
    totalStakedSWIPE: 28000,
    predictionsParticipated: 3
  }
];

export function Leaderboard() {
  const [selectedTab, setSelectedTab] = useState<'eth' | 'swipe'>('eth');
  const [loading, setLoading] = useState(false);
  const [realData, setRealData] = useState<RealLeaderboardData | null>(null);

  // Get Farcaster profiles for leaderboard users
  const leaderboardAddresses = useMemo(() => 
    HARDCODED_LEADERBOARD.map(user => user.address), 
    [] // Empty dependency array since HARDCODED_LEADERBOARD never changes
  );
  const { profiles: leaderboardProfiles } = useFarcasterProfiles(leaderboardAddresses);

  // Load real leaderboard data from Redis cache only
  useEffect(() => {
    const loadRealData = async () => {
      try {
        setLoading(true);
        console.log('🔍 Fetching cached leaderboard data from Redis...');
        
        const response = await fetch('/api/leaderboard/real-data');
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setRealData(data.data);
            console.log('✅ Loaded cached leaderboard data:', data.data);
          } else {
            console.log('⚠️ No cached data available, using hardcoded fallback');
          }
        } else {
          console.log('⚠️ No cached data available, using hardcoded fallback');
        }
      } catch (error) {
        console.error('❌ Failed to load cached leaderboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadRealData();
  }, []);

  // Use real data if available, otherwise fallback to hardcoded
  const ethLeaderboard = realData?.ethLeaderboard || HARDCODED_LEADERBOARD;
  const swipeLeaderboard = realData?.swipeLeaderboard || HARDCODED_LEADERBOARD;
  const farcasterProfiles = realData?.farcasterProfiles || leaderboardProfiles;
  
  // Get addresses for Farcaster profiles from real data
  const realLeaderboardAddresses = useMemo(() => {
    if (!realData) return [];
    const ethAddresses = realData.ethLeaderboard?.map((user: LeaderboardUser) => user.address) || [];
    const swipeAddresses = realData.swipeLeaderboard?.map((user: LeaderboardUser) => user.address) || [];
    return [...new Set([...ethAddresses, ...swipeAddresses])];
  }, [realData]);
  
  const { profiles: realProfiles } = useFarcasterProfiles(realLeaderboardAddresses);

  // Sort leaderboard based on selected tab
  const sortedLeaderboard = useMemo(() => {
    const currentLeaderboard = selectedTab === 'eth' ? ethLeaderboard : swipeLeaderboard;
    return [...currentLeaderboard].sort((a, b) => {
      if (selectedTab === 'eth') {
        return b.totalStakedETH - a.totalStakedETH;
      } else {
        return b.totalStakedSWIPE - a.totalStakedSWIPE;
      }
    }).map((user, index) => ({
      ...user,
      rank: index + 1
    }));
  }, [selectedTab, ethLeaderboard, swipeLeaderboard]);

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
  const getInitials = (profile: any, address: string) => {
    if (profile?.display_name) {
      return profile.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return address.slice(2, 4).toUpperCase();
  };

  // Format SWIPE amounts to be more compact
  const formatSWIPEAmount = (amount: number) => {
    const ethAmount = amount / 1e18;
    if (ethAmount >= 1e9) {
      return `${(ethAmount / 1e9).toFixed(1)}B`;
    } else if (ethAmount >= 1e6) {
      return `${(ethAmount / 1e6).toFixed(1)}M`;
    } else if (ethAmount >= 1e3) {
      return `${(ethAmount / 1e3).toFixed(1)}K`;
    } else {
      return ethAmount.toFixed(0);
    }
  };

  return (
    <div className="leaderboard-page">
      {/* Header */}
      <div className="leaderboard-header">
        <h1>🏆 Top Stakers</h1>
        <p>Biggest contributors to the prediction market</p>
      </div>

      {/* Tab Selector */}
      <div className="tab-selector">
        <button 
          className={`tab-button ${selectedTab === 'eth' ? 'active' : ''}`}
          onClick={() => setSelectedTab('eth')}
        >
          <img src="/eth.png" alt="ETH" className="tab-icon" />
          ETH Pools
        </button>
        <button 
          className={`tab-button ${selectedTab === 'swipe' ? 'active' : ''}`}
          onClick={() => setSelectedTab('swipe')}
        >
          <img src="/logo.png" alt="SWIPE" className="tab-icon" />
          SWIPE Pools
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="leaderboard-loading">
          <div className="loading-spinner"></div>
          <p>Loading real leaderboard data...</p>
        </div>
      )}

      {/* Leaderboard List */}
      {!loading && (
        <div className="leaderboard-container">
          <div className="leaderboard-list">
          {sortedLeaderboard.map((user) => {
            // Use real profiles if available, otherwise fallback to hardcoded profiles
            const profile = realData ? realProfiles.find(p => p && p.address === user.address) : leaderboardProfiles.find(p => p.address === user.address);
            const hasFarcasterProfile = profile && profile.fid !== null && !profile.isWalletOnly;

            return (
              <div key={user.address} className="leaderboard-item">
                <div className="leaderboard-rank">#{user.rank}</div>

                <div className="leaderboard-user">
                  <div className="relative">
                    <Avatar 
                      className={hasFarcasterProfile 
                        ? "leaderboard-avatar cursor-pointer hover:scale-110 transition-all duration-300 shadow-lg hover:shadow-xl border-2 border-white/20 hover:border-blue-400/60 ring-2 ring-blue-500/20 hover:ring-blue-400/40"
                        : "leaderboard-avatar cursor-pointer hover:scale-105 transition-all duration-300 shadow-md border-2 border-gray-300 hover:border-gray-400"
                      }
                    >
                      <AvatarImage 
                        src={hasFarcasterProfile ? (profile?.pfp_url || undefined) : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.address.slice(2, 8)}`} 
                        alt={hasFarcasterProfile ? (profile?.display_name || `User ${user.address.slice(2, 6)}`) : `Wallet ${user.address.slice(2, 6)}`}
                      />
                      <AvatarFallback className={getAvatarColor(user.address)}>
                        <span className="text-white text-xs font-semibold">
                          {getInitials(profile, user.address)}
                        </span>
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  
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
                    <div className="stat-value">
                      {selectedTab === 'eth' ? (
                        <>
                          <img src="/eth.png" alt="ETH" className="stat-icon" />
                          <span className="amount-text">{(user.totalStakedETH / 1e18).toFixed(4)}</span>
                        </>
                      ) : (
                        <>
                          <img src="/logo.png" alt="SWIPE" className="stat-icon" />
                          <span className="amount-text">{formatSWIPEAmount(user.totalStakedSWIPE)}</span>
                        </>
                      )}
                    </div>
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
      )}

      {/* Footer Info */}
      <div className="leaderboard-footer">
        <p>📊 Real data from blockchain and Farcaster profiles</p>
        <p>🔄 Data refreshed by admin (cached in Redis)</p>
        {realData && (
          <p>👥 {realData.totalUsers} users, {realData.totalPredictions} predictions</p>
        )}
        {!realData && (
          <p>⚠️ Using hardcoded data - admin needs to refresh</p>
        )}
      </div>
    </div>
  );
}

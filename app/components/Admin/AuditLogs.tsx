"use client";

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import './AuditLogs.css';

interface AuditLog {
  id: string;
  timestamp: number;
  action: string;
  user: string;
  details: string;
  type: 'admin' | 'approver' | 'user' | 'system';
  status: 'success' | 'error' | 'warning' | 'info';
}

export function AuditLogs() {
  const { address } = useAccount();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filter, setFilter] = useState<'all' | 'admin' | 'approver' | 'user' | 'system'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Check permissions
  const isAdmin = address && process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase();
  const isApprover = address && (process.env.NEXT_PUBLIC_APPROVER_1?.toLowerCase() === address.toLowerCase() ||
                               process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase());

  // Mock audit logs data
  useEffect(() => {
    const mockLogs: AuditLog[] = [
      {
        id: '1',
        timestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
        action: 'Prediction Created',
        user: '0x742d...a9E2',
        details: 'Created prediction: "Bitcoin hits $100,000 by end of 2024"',
        type: 'user',
        status: 'success'
      },
      {
        id: '2',
        timestamp: Date.now() - 1000 * 60 * 10, // 10 minutes ago
        action: 'Prediction Approved',
        user: '0x987c...d3F4',
        details: 'Approved prediction ID: 1 by approver',
        type: 'approver',
        status: 'success'
      },
      {
        id: '3',
        timestamp: Date.now() - 1000 * 60 * 15, // 15 minutes ago
        action: 'Stake Placed',
        user: '0x1111...aaaa',
        details: 'Placed 0.5 ETH YES stake on prediction ID: 1',
        type: 'user',
        status: 'success'
      },
      {
        id: '4',
        timestamp: Date.now() - 1000 * 60 * 20, // 20 minutes ago
        action: 'Platform Fee Updated',
        user: '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd',
        details: 'Updated platform fee from 1% to 1.5%',
        type: 'admin',
        status: 'success'
      },
      {
        id: '5',
        timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
        action: 'Prediction Rejected',
        user: '0x987c...d3F4',
        details: 'Rejected prediction ID: 2 - Low quality content',
        type: 'approver',
        status: 'warning'
      },
      {
        id: '6',
        timestamp: Date.now() - 1000 * 60 * 45, // 45 minutes ago
        action: 'Contract Emergency Pause',
        user: '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd',
        details: 'Emergency pause activated due to high gas prices',
        type: 'admin',
        status: 'warning'
      },
      {
        id: '7',
        timestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
        action: 'Reward Claimed',
        user: '0x1111...aaaa',
        details: 'Claimed 0.75 ETH reward from prediction ID: 1',
        type: 'user',
        status: 'success'
      },
      {
        id: '8',
        timestamp: Date.now() - 1000 * 60 * 90, // 1.5 hours ago
        action: 'System Error',
        user: 'SYSTEM',
        details: 'Failed to resolve prediction ID: 3 - Network timeout',
        type: 'system',
        status: 'error'
      },
      {
        id: '9',
        timestamp: Date.now() - 1000 * 60 * 120, // 2 hours ago
        action: 'Approver Added',
        user: '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd',
        details: 'Added new approver: 0x987c...d3F4',
        type: 'admin',
        status: 'info'
      },
      {
        id: '10',
        timestamp: Date.now() - 1000 * 60 * 180, // 3 hours ago
        action: 'Prediction Resolved',
        user: '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd',
        details: 'Resolved prediction ID: 1 as YES. Winners: 234 participants',
        type: 'admin',
        status: 'success'
      }
    ];

    setLogs(mockLogs);
  }, []);

  if (!isAdmin && !isApprover) {
    return (
      <div className="audit-logs">
        <div className="access-denied">
          <h2>🔒 Access Denied</h2>
          <p>You don&apos;t have permission to view audit logs.</p>
        </div>
      </div>
    );
  }

  const filteredLogs = logs.filter(log => {
    const matchesFilter = filter === 'all' || log.type === filter;
    const matchesSearch = searchTerm === '' ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'admin': return '👑';
      case 'approver': return '✅';
      case 'user': return '👤';
      case 'system': return '⚙️';
      default: return '📝';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📝';
    }
  };

  const formatTime = (timestamp: number) => {
    const now = new Date();
    const diffMs = now.getTime() - timestamp;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  };

  return (
    <div className="audit-logs">
      <div className="logs-header">
        <h2>🔍 Audit Logs</h2>
        <p>Complete system activity and transaction history</p>
      </div>

      <div className="logs-controls">
        <div className="filter-controls">
          <label>Filter by type:</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'admin' | 'approver' | 'user' | 'system')}>
            <option value="all">All Types</option>
            <option value="admin">Admin Actions</option>
            <option value="approver">Approver Actions</option>
            <option value="user">User Actions</option>
            <option value="system">System Events</option>
          </select>
        </div>

        <div className="search-control">
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="logs-container">
        {filteredLogs.length === 0 ? (
          <div className="no-logs">
            <p>📝 No logs found matching your criteria.</p>
          </div>
        ) : (
          <div className="logs-list">
            {filteredLogs.map((log) => (
              <div key={log.id} className={`log-entry ${log.type} ${log.status}`}>
                <div className="log-icon">
                  {getStatusIcon(log.status)}
                </div>

                <div className="log-content">
                  <div className="log-header">
                    <span className="log-action">{log.action}</span>
                    <span className="log-type-badge">
                      {getTypeIcon(log.type)} {log.type}
                    </span>
                  </div>

                  <div className="log-details">
                    {log.details}
                  </div>

                  <div className="log-meta">
                    <span className="log-user">User: {log.user}</span>
                    <span className="log-time">{formatTime(log.timestamp)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="logs-summary">
        <div className="summary-stats">
          <div className="stat">
            <span className="stat-value">{logs.length}</span>
            <span className="stat-label">Total Logs</span>
          </div>
          <div className="stat">
            <span className="stat-value">{logs.filter(l => l.status === 'success').length}</span>
            <span className="stat-label">Success</span>
          </div>
          <div className="stat">
            <span className="stat-value">{logs.filter(l => l.status === 'error').length}</span>
            <span className="stat-label">Errors</span>
          </div>
          <div className="stat">
            <span className="stat-value">{logs.filter(l => l.status === 'warning').length}</span>
            <span className="stat-label">Warnings</span>
          </div>
        </div>
      </div>
    </div>
  );
}

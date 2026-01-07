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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check permissions
  const isAdmin = address && process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase();
  const isApprover = address && (process.env.NEXT_PUBLIC_APPROVER_1?.toLowerCase() === address.toLowerCase() ||
                               process.env.NEXT_PUBLIC_APPROVER_2?.toLowerCase() === address.toLowerCase() ||
                               process.env.NEXT_PUBLIC_APPROVER_3?.toLowerCase() === address.toLowerCase() ||
                               process.env.NEXT_PUBLIC_APPROVER_4?.toLowerCase() === address.toLowerCase() ||
                               process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase());

  // Real audit logs data from API
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        setError(null);

        const typeParam = filter === 'all' ? '' : `&type=${filter}`;
        const response = await fetch(`/api/audit?limit=50${typeParam}`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.success) {
          setLogs(result.data);
        } else {
          throw new Error(result.error || 'Failed to fetch audit logs');
        }
      } catch (err) {
        console.error('❌ Failed to fetch audit logs:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch audit logs');
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchLogs, 30000);
    return () => clearInterval(interval);
  }, [filter]);

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

  if (loading) {
    return (
      <div className="audit-logs">
        <div className="logs-header">
          <h2>🔍 Audit Logs</h2>
          <p>Loading audit logs...</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="audit-logs">
        <div className="logs-header">
          <h2>🔍 Audit Logs</h2>
          <p>Complete system activity and transaction history</p>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: 'red' }}>
          <div>❌ Failed to load audit logs</div>
          <div style={{ fontSize: '14px', marginTop: '10px' }}>{error}</div>
        </div>
      </div>
    );
  }

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

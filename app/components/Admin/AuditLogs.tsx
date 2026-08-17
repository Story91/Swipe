"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import '../../styles/sheet.css';
import './AuditLogs.css';

/**
 * Audit log, on the shared sheet.
 *
 * Data comes from /api/audit and is unchanged; this is a presentation rewrite.
 * Status moves from an emoji to a coloured rule in the gutter, which is the
 * same information but survives being scanned quickly and keeps every row the
 * same height.
 */

interface AuditLog {
  id: string;
  timestamp: number;
  action: string;
  user: string;
  details: string;
  type: 'admin' | 'approver' | 'user' | 'system';
  status: 'success' | 'error' | 'warning' | 'info';
}

type Filter = 'all' | 'admin' | 'approver' | 'user' | 'system';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'admin', label: 'Admin' },
  { key: 'approver', label: 'Approver' },
  { key: 'user', label: 'User' },
  { key: 'system', label: 'System' },
];

function timeAgo(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function AuditLogs() {
  const { address } = useAccount();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin =
    address && process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase();
  const isApprover =
    address &&
    (process.env.NEXT_PUBLIC_APPROVER_1?.toLowerCase() === address.toLowerCase() ||
      process.env.NEXT_PUBLIC_APPROVER_2?.toLowerCase() === address.toLowerCase() ||
      process.env.NEXT_PUBLIC_APPROVER_3?.toLowerCase() === address.toLowerCase() ||
      process.env.NEXT_PUBLIC_APPROVER_4?.toLowerCase() === address.toLowerCase() ||
      process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase());

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

  const shown = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return logs
      .filter(log => (filter === 'all' ? true : log.type === filter))
      .filter(log =>
        needle === ''
          ? true
          : log.action.toLowerCase().includes(needle) ||
            log.details.toLowerCase().includes(needle) ||
            log.user.toLowerCase().includes(needle)
      );
  }, [logs, filter, searchTerm]);

  const counts = {
    success: logs.filter(l => l.status === 'success').length,
    error: logs.filter(l => l.status === 'error').length,
    warning: logs.filter(l => l.status === 'warning').length,
  };

  const shell = (body: React.ReactNode) => (
    <div className="sheet">
      <div className="sheet-shell">
        <header className="sheet-hero">
          <div className="sheet-hero-top">
            <div>
              <p className="sheet-eyebrow">Audit</p>
              <h1 className="sheet-hero-title">
                What the system <em>did</em>
              </h1>
            </div>
          </div>
          <p className="sheet-hero-lede">
            Actions taken by admins, approvers, users and the system itself,
            newest first. This is the record you check when something happened
            and nobody remembers doing it.
          </p>
        </header>
        <main className="sheet-body">{body}</main>
      </div>
    </div>
  );

  if (!isAdmin && !isApprover) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Log</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Not your log</strong>
            The audit trail is visible to admins and approvers only.
          </div>
        </div>
      </section>
    );
  }

  if (loading) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Log</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Reading the log</strong>
            Pulling the most recent entries.
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Log</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Could not load the log</strong>
            {error}
          </div>
        </div>
      </section>
    );
  }

  return shell(
    <>
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Log</p>
          <p className="sheet-rail-meta">
            {`${shown.length} shown\nof ${logs.length} loaded`}
          </p>
        </div>
        <div>
          <div className="al-controls">
            <div className="al-control-group">
              <span className="al-control-label" id="al-filter-label">Source</span>
              <div className="sheet-segment" role="group" aria-labelledby="al-filter-label">
                {FILTERS.map(f => (
                  <button
                    key={f.key}
                    type="button"
                    className="sheet-segment-item"
                    aria-pressed={filter === f.key}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="al-control-group">
              <label className="al-control-label" htmlFor="al-search">Find</label>
              <input
                id="al-search"
                type="search"
                className="al-search"
                placeholder="action, detail or address"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="sheet-empty">
              <strong>Nothing matches</strong>
              {searchTerm
                ? 'No entry contains that. Try a shorter search.'
                : 'No entries of this kind in the last 50.'}
            </div>
          ) : (
            <div className="al-list">
              {shown.map(log => (
                <div key={log.id} className={`al-row al-row--${log.status}`}>
                  <span className="al-mark" aria-hidden="true" />

                  <div className="al-body">
                    <div className="al-action">
                      <span>{log.action}</span>
                      <span className="al-type">{log.type}</span>
                    </div>
                    {log.details && <div className="al-details">{log.details}</div>}
                    {log.user && <div className="al-actor">{log.user}</div>}
                  </div>

                  <span className="al-time">{timeAgo(log.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Loaded</p>
          <p className="sheet-rail-meta">{`Last ${logs.length}\nentries`}</p>
        </div>
        <div>
          <div className="sheet-board">
            <div className="sheet-settle">
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Succeeded</span>
                <span className="sheet-settle-val">{counts.success}</span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Warnings</span>
                <span className="sheet-settle-val">{counts.warning}</span>
              </div>
              <div className="sheet-settle-row sheet-settle-row--total">
                <span className="sheet-settle-key">Errors</span>
                <span className="sheet-settle-val">{counts.error}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

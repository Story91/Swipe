"use client";

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { AdminDashboard } from './AdminDashboard';
import { ApproverDashboard } from '../Approver/ApproverDashboard';
import './AdminPanel.css';

export type AdminTab = 'dashboard' | 'approver';

interface AdminPanelProps {
  defaultTab?: AdminTab;
}

export function AdminPanel({ defaultTab = 'dashboard' }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>(defaultTab);
  const { address } = useAccount();

  // Real data will be fetched by child components
  // AdminDashboard and ApproverDashboard fetch their own data

  // Check permissions
  const isAdmin = address && process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase();
  const isApprover = address && (process.env.NEXT_PUBLIC_APPROVER_1?.toLowerCase() === address.toLowerCase() ||
                               process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase());

  if (!isAdmin && !isApprover) {
    return (
      <div className="admin-panel">
        <div className="access-denied">
          <h2>🔒 Access Denied</h2>
          <p>You don&apos;t have permission to access the admin panel.</p>
          <p>Please connect with an authorized wallet address.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard' as AdminTab, label: 'Dashboard', icon: '📊', adminOnly: false },
    { id: 'approver' as AdminTab, label: 'Approver', icon: '✅', adminOnly: false }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <AdminDashboard
            predictions={[]} // AdminDashboard fetches its own real data
            onResolvePrediction={(id, outcome) => console.log(`Resolve prediction ${id} as ${outcome}`)}
            onCancelPrediction={(id, reason) => console.log(`Cancel prediction ${id}: ${reason}`)}
            onCreatePrediction={() => console.log('Create prediction')}
            onManageApprovers={() => console.log('Manage approvers')}
            onWithdrawFees={() => console.log('Withdraw fees')}
            onPauseContract={() => console.log('Pause contract')}
          />
        );
      case 'approver':
        return (
          <ApproverDashboard
            predictions={[]} // ApproverDashboard fetches its own real data
            onApprovePrediction={(id) => console.log(`Approve prediction ${id}`)}
            onRejectPrediction={(id, reason) => console.log(`Reject prediction ${id}: ${reason}`)}
          />
        );
      default:
        return (
          <AdminDashboard
            predictions={[]} // AdminDashboard fetches its own real data
            onResolvePrediction={(id, outcome) => console.log(`Resolve prediction ${id} as ${outcome}`)}
            onCancelPrediction={(id, reason) => console.log(`Cancel prediction ${id}: ${reason}`)}
            onCreatePrediction={() => console.log('Create prediction')}
            onManageApprovers={() => console.log('Manage approvers')}
            onWithdrawFees={() => console.log('Withdraw fees')}
            onPauseContract={() => console.log('Pause contract')}
          />
        );
    }
  };

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>🔧 Admin Control Panel</h1>
        <p>Manage platform, predictions, and system settings</p>
      </div>

      <div className="admin-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            {tab.adminOnly && <span className="admin-badge">ADMIN</span>}
          </button>
        ))}
      </div>

      <div className="admin-content">
        {renderTabContent()}
      </div>
    </div>
  );
}

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

  // Mock data for all admin functions
  const mockPredictions = [
    {
      id: 1,
      question: "Bitcoin hits $100,000 by end of 2024?",
      category: "Crypto",
      yesTotalAmount: 10.35,
      noTotalAmount: 4.85,
      deadline: Date.now() / 1000 + 5 * 24 * 60 * 60,
      resolved: false,
      outcome: false,
      cancelled: false,
      participants: 324,
      userYesStake: 0.5,
      userNoStake: 0.0,
      potentialPayout: 0.73,
      potentialProfit: 0.23,
      needsApproval: false,
      approvalCount: 0,
      requiredApprovals: 2,
      description: "Strong accumulation pattern with institutional buying pressure. Key resistance at $100k likely to break on next momentum wave.",
      creator: "0x742d...a9E2",
      createdAt: Date.now() / 1000 - 2 * 60 * 60,
      hasUserApproved: false,
      isRejected: false,
      rejectionReason: "",
      resolutionDeadline: Date.now() / 1000 + 10 * 24 * 60 * 60,
      imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop",
      verified: true,
      approved: true
    },
    {
      id: 2,
      question: "Manchester United wins Premier League 2024?",
      category: "Sports",
      yesTotalAmount: 3.2,
      noTotalAmount: 5.7,
      deadline: Date.now() / 1000 - 1 * 24 * 60 * 60,
      resolved: true,
      outcome: false,
      cancelled: false,
      participants: 156,
      userYesStake: 0.0,
      userNoStake: 1.0,
      potentialPayout: 1.33,
      potentialProfit: 0.33,
      needsApproval: false,
      approvalCount: 0,
      requiredApprovals: 2,
      description: "Based on current form and squad depth analysis.",
      creator: "0x987c...d3F4",
      createdAt: Date.now() / 1000 - 5 * 60 * 60,
      hasUserApproved: false,
      isRejected: false,
      rejectionReason: "",
      resolutionDeadline: Date.now() / 1000 + 5 * 24 * 60 * 60,
      imageUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=300&fit=crop",
      verified: true,
      approved: true
    }
  ];

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
            predictions={mockPredictions}
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
            predictions={mockPredictions}
            onApprovePrediction={(id) => console.log(`Approve prediction ${id}`)}
            onRejectPrediction={(id, reason) => console.log(`Reject prediction ${id}: ${reason}`)}
          />
        );
      default:
        return (
          <AdminDashboard
            predictions={mockPredictions}
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

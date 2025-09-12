"use client";

import React, { useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../lib/contract';
import { AdminDashboard } from './AdminDashboard';
import { ApproverDashboard } from '../Approver/ApproverDashboard';
import { ClaimsDashboard } from './ClaimsDashboard';
import './AdminPanel.css';

export type AdminTab = 'dashboard' | 'approver' | 'claims';

interface AdminPanelProps {
  defaultTab?: AdminTab;
}

export function AdminPanel({ defaultTab = 'dashboard' }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>(defaultTab);
  const { address } = useAccount();
  const { writeContract } = useWriteContract();

  // Admin functions for contract interactions
  const handleResolvePrediction = async (predictionId: string | number, outcome: boolean) => {
    try {
      // Only handle on-chain predictions (numeric IDs)
      if (typeof predictionId === 'number') {
        writeContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'resolvePrediction',
          args: [BigInt(predictionId), outcome],
        }, {
          onSuccess: (tx) => {
            console.log(`✅ Prediction ${predictionId} resolved successfully:`, tx);
            alert(`✅ Prediction resolved successfully! Transaction: ${tx}`);
          },
          onError: (error) => {
            console.error('❌ Resolve prediction failed:', error);
            alert(`❌ Resolution failed: ${error.message || error}`);
          }
        });
      }
      // Redis-based predictions (string IDs) are handled in AdminDashboard
    } catch (error) {
      console.error('Failed to resolve prediction:', error);
      alert(`❌ Resolution failed: ${error}`);
    }
  };

  const handleCancelPrediction = async (predictionId: string | number, reason: string) => {
    try {
      // Only handle on-chain predictions (numeric IDs)
      if (typeof predictionId === 'number') {
        writeContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'cancelPrediction',
          args: [BigInt(predictionId), reason],
        }, {
          onSuccess: (tx) => {
            console.log(`✅ Prediction ${predictionId} cancelled successfully:`, tx);
            alert(`✅ Prediction cancelled successfully! Transaction: ${tx}`);
          },
          onError: (error) => {
            console.error('❌ Cancel prediction failed:', error);
            alert(`❌ Cancellation failed: ${error.message || error}`);
          }
        });
      }
      // Redis-based predictions (string IDs) are handled in AdminDashboard
    } catch (error) {
      console.error('Failed to cancel prediction:', error);
      alert(`❌ Cancellation failed: ${error}`);
    }
  };

  const handleWithdrawFees = async () => {
    try {
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'withdrawFees',
      });
    } catch (error) {
      console.error('Failed to withdraw fees:', error);
    }
  };

  const handlePauseContract = async (pause: boolean) => {
    try {
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: pause ? 'pause' : 'unpause',
      });
    } catch (error) {
      console.error('Failed to pause/unpause contract:', error);
    }
  };

  const handleApprovePrediction = async (predictionId: number) => {
    try {
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'approvePrediction',
        args: [BigInt(predictionId)],
      });
    } catch (error) {
      console.error('Failed to approve prediction:', error);
    }
  };

  const handleRejectPrediction = async (predictionId: number, reason: string) => {
    try {
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'rejectPrediction',
        args: [BigInt(predictionId), reason],
      });
    } catch (error) {
      console.error('Failed to reject prediction:', error);
    }
  };

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
    { id: 'approver' as AdminTab, label: 'Approver', icon: '✅', adminOnly: false },
    { id: 'claims' as AdminTab, label: 'Claims', icon: '💰', adminOnly: true }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <AdminDashboard
            predictions={[]} // AdminDashboard fetches its own real data
            onResolvePrediction={handleResolvePrediction}
            onCancelPrediction={handleCancelPrediction}
            onCreatePrediction={() => console.log('Create prediction')}
            onManageApprovers={() => console.log('Manage approvers')}
            onWithdrawFees={handleWithdrawFees}
            onPauseContract={() => handlePauseContract(true)}
          />
        );
      case 'approver':
        return (
          <ApproverDashboard
            predictions={[]} // ApproverDashboard fetches its own real data
            onApprovePrediction={handleApprovePrediction}
            onRejectPrediction={handleRejectPrediction}
          />
        );
      case 'claims':
        if (!isAdmin) {
          return (
            <div className="access-denied">
              <h2>🔒 Admin Only</h2>
              <p>This feature is only available to administrators.</p>
            </div>
          );
        }
        return <ClaimsDashboard />;
      default:
        return (
          <AdminDashboard
            predictions={[]} // AdminDashboard fetches its own real data
            onResolvePrediction={handleResolvePrediction}
            onCancelPrediction={handleCancelPrediction}
            onCreatePrediction={() => console.log('Create prediction')}
            onManageApprovers={() => console.log('Manage approvers')}
            onWithdrawFees={handleWithdrawFees}
            onPauseContract={() => handlePauseContract(true)}
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
        {tabs
          .filter(tab => !tab.adminOnly || isAdmin)
          .map((tab) => (
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

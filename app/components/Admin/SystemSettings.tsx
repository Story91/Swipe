"use client";

import React, { useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../lib/contract';
import './SystemSettings.css';

export function SystemSettings() {
  const { address } = useAccount();
  const { writeContract } = useWriteContract();

  const [settings, setSettings] = useState({
    platformFee: 1, // percentage
    minStake: 0.001, // ETH
    maxStake: 100, // ETH
    requiredApprovals: 3,
    maxResolutionTime: 30, // days
    publicCreation: true,
    paused: false
  });

  const [isLoading, setIsLoading] = useState<string | null>(null);

  // Check if user is admin
  const isAdmin = address && process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase();

  const handleSettingChange = (key: string, value: string | number | boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const updatePlatformFee = async () => {
    if (!isAdmin) return;
    setIsLoading('platformFee');
    try {
      await writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'setPlatformFee',
        args: [BigInt(settings.platformFee * 100)], // Convert to basis points
      });
      console.log('✅ Platform fee updated successfully');
    } catch (error) {
      console.error('❌ Failed to update platform fee:', error);
    } finally {
      setIsLoading(null);
    }
  };

  const updateStakeLimits = async () => {
    if (!isAdmin) return;
    setIsLoading('stakeLimits');
    try {
      await writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'setStakeLimits',
        args: [
          BigInt(settings.minStake * 10**18), // Convert to wei
          BigInt(settings.maxStake * 10**18)  // Convert to wei
        ],
      });
      console.log('✅ Stake limits updated successfully');
    } catch (error) {
      console.error('❌ Failed to update stake limits:', error);
    } finally {
      setIsLoading(null);
    }
  };

  const updateRequiredApprovals = async () => {
    if (!isAdmin) return;
    setIsLoading('approvals');
    try {
      await writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'setRequiredApprovals',
        args: [BigInt(settings.requiredApprovals)],
      });
      console.log('✅ Required approvals updated successfully');
    } catch (error) {
      console.error('❌ Failed to update required approvals:', error);
    } finally {
      setIsLoading(null);
    }
  };

  const togglePublicCreation = async () => {
    if (!isAdmin) return;
    setIsLoading('publicCreation');
    try {
      await writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'setPublicCreation',
        args: [!settings.publicCreation],
      });
      setSettings(prev => ({ ...prev, publicCreation: !prev.publicCreation }));
      console.log('✅ Public creation setting updated successfully');
    } catch (error) {
      console.error('❌ Failed to update public creation setting:', error);
    } finally {
      setIsLoading(null);
    }
  };

  const toggleContractPause = async () => {
    if (!isAdmin) return;
    setIsLoading('pause');
    try {
      const functionName = settings.paused ? 'unpause' : 'pause';
      await writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName,
      });
      setSettings(prev => ({ ...prev, paused: !prev.paused }));
      console.log(`✅ Contract ${settings.paused ? 'unpaused' : 'paused'} successfully`);
    } catch (error) {
      console.error(`❌ Failed to ${settings.paused ? 'unpause' : 'pause'} contract:`, error);
    } finally {
      setIsLoading(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="system-settings">
        <div className="access-denied">
          <h2>🔒 Access Denied</h2>
          <p>Only administrators can access system settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="system-settings">
      <div className="settings-header">
        <h2>⚙️ System Settings</h2>
        <p>Configure platform parameters and system behavior</p>
      </div>

      <div className="settings-sections">
        {/* Financial Settings */}
        <div className="settings-section">
          <h3>💰 Financial Settings</h3>

          <div className="setting-item">
            <div className="setting-info">
              <label>Platform Fee Percentage</label>
              <p>Fee charged on each prediction resolution</p>
            </div>
            <div className="setting-control">
              <input
                type="number"
                value={settings.platformFee}
                onChange={(e) => handleSettingChange('platformFee', parseFloat(e.target.value))}
                min="0"
                max="10"
                step="0.1"
              />
              <span className="unit">%</span>
              <button
                className="update-btn"
                onClick={updatePlatformFee}
                disabled={isLoading === 'platformFee'}
              >
                {isLoading === 'platformFee' ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <label>Stake Limits</label>
              <p>Minimum and maximum stake amounts</p>
            </div>
            <div className="setting-control-group">
              <div className="input-group">
                <input
                  type="number"
                  value={settings.minStake}
                  onChange={(e) => handleSettingChange('minStake', parseFloat(e.target.value))}
                  min="0.001"
                  step="0.001"
                />
                <span className="unit">ETH min</span>
              </div>
              <div className="input-group">
                <input
                  type="number"
                  value={settings.maxStake}
                  onChange={(e) => handleSettingChange('maxStake', parseFloat(e.target.value))}
                  min="1"
                  step="1"
                />
                <span className="unit">ETH max</span>
              </div>
              <button
                className="update-btn"
                onClick={updateStakeLimits}
                disabled={isLoading === 'stakeLimits'}
              >
                {isLoading === 'stakeLimits' ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        </div>

        {/* Approval Settings */}
        <div className="settings-section">
          <h3>✅ Approval Settings</h3>

          <div className="setting-item">
            <div className="setting-info">
              <label>Required Approvals</label>
              <p>Number of approvals needed before prediction goes live</p>
            </div>
            <div className="setting-control">
              <input
                type="number"
                value={settings.requiredApprovals}
                onChange={(e) => handleSettingChange('requiredApprovals', parseInt(e.target.value))}
                min="1"
                max="10"
              />
              <button
                className="update-btn"
                onClick={updateRequiredApprovals}
                disabled={isLoading === 'approvals'}
              >
                {isLoading === 'approvals' ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        </div>

        {/* System Controls */}
        <div className="settings-section">
          <h3>🔧 System Controls</h3>

          <div className="setting-item">
            <div className="setting-info">
              <label>Public Prediction Creation</label>
              <p>Allow anyone to create predictions or require approval</p>
            </div>
            <div className="setting-control">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.publicCreation}
                  onChange={() => handleSettingChange('publicCreation', !settings.publicCreation)}
                />
                <span className="toggle-slider"></span>
              </label>
              <button
                className="update-btn"
                onClick={togglePublicCreation}
                disabled={isLoading === 'publicCreation'}
              >
                {isLoading === 'publicCreation' ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <label>Contract Status</label>
              <p>Emergency pause/unpause the entire contract</p>
            </div>
            <div className="setting-control">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={!settings.paused}
                  onChange={() => handleSettingChange('paused', !settings.paused)}
                />
                <span className="toggle-slider"></span>
              </label>
              <span className="status-text">
                {settings.paused ? '🚫 Paused' : '✅ Active'}
              </span>
              <button
                className="update-btn danger"
                onClick={toggleContractPause}
                disabled={isLoading === 'pause'}
              >
                {isLoading === 'pause' ? 'Processing...' : (settings.paused ? 'Unpause' : 'Pause')}
              </button>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="settings-section danger-zone">
          <h3>⚠️ Danger Zone</h3>
          <p className="warning-text">These actions are irreversible. Proceed with caution.</p>

          <div className="setting-item">
            <div className="setting-info">
              <label>Emergency Withdraw</label>
              <p>Withdraw all funds from contract (owner only)</p>
            </div>
            <button className="danger-btn">
              🚨 Emergency Withdraw
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

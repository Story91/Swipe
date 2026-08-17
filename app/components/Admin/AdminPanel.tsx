"use client";

import React from 'react';
import { useAccount } from 'wagmi';
import { AdminDashboard } from './AdminDashboard';
import '../../styles/sheet.css';

/**
 * The door to the admin desk.
 *
 * Nothing else. This file used to carry four contract writes of its own,
 * resolve, cancel, withdrawFees and pause, all of them aimed at
 * CONTRACTS.V2 with no chainId pinned. That contract is archived: its owner
 * key is gone and it has no transferOwnership, so every one of those calls
 * would have reverted after the operator had signed it. They are deleted
 * rather than fixed, because there is nothing to fix them into.
 *
 * The gate below is the env allowlist, which is a client-side check and worth
 * being honest about: it decides what the UI offers, not what the server or the
 * contract will accept. Admin API routes verify a signature of their own and
 * registerPrediction is onlyRegistrar on chain. Editing this list in a browser
 * gets you a screen full of buttons that all fail.
 */

function isAllowed(address: string | undefined): boolean {
  if (!address) return false;
  const who = address.toLowerCase();
  const allowed = [
    process.env.NEXT_PUBLIC_ADMIN_1,
    process.env.NEXT_PUBLIC_APPROVER_1,
    process.env.NEXT_PUBLIC_APPROVER_2,
    process.env.NEXT_PUBLIC_APPROVER_3,
    process.env.NEXT_PUBLIC_APPROVER_4,
  ];
  return allowed.some((entry) => entry?.toLowerCase() === who);
}

export function AdminPanel() {
  const { address } = useAccount();

  if (!isAllowed(address)) {
    return (
      <div className="sheet">
        <div className="sheet-shell">
          <header className="sheet-hero">
            <div className="sheet-hero-top">
              <div>
                <p className="sheet-eyebrow">Admin</p>
                <h1 className="sheet-hero-title">
                  Not <em>yours</em>
                </h1>
              </div>
            </div>
            <p className="sheet-hero-lede">
              This wallet is not on the operator list. Connect one that is and the desk loads.
            </p>
          </header>
        </div>
      </div>
    );
  }

  return <AdminDashboard />;
}

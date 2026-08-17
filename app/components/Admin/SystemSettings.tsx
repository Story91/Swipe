"use client";

import React from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { CONTRACTS } from '../../../lib/contract';
import { getChainConfig } from '@/lib/chains';
import '../../styles/sheet.css';
import './SystemSettings.css';

/**
 * System settings, on the shared sheet.
 *
 * This screen used to be a form. It presented seven editable settings with
 * hardcoded starting values - 1% fee, 0.001/100 ETH stake limits, 3 required
 * approvals - none of which were ever read from a contract, and each with a
 * button that wrote to PredictionMarketV2.
 *
 * V2 is archived: its owner key is no longer available, and every one of those
 * setters is onlyOwner. So each button asked an admin to sign a transaction
 * that could only revert, after showing them a "current value" that was really
 * just a default someone typed into useState.
 *
 * It is now a read-only ledger of what the contract actually says, with the
 * reason the controls are gone stated at the top. Writing is not disabled
 * behind a tooltip; it is absent, because there is no key that could perform
 * it. Reads still work, so the figures below are real.
 */

const explorer = getChainConfig().explorer;
const V2 = CONTRACTS.V2.address as `0x${string}`;

/** A contract read that renders honestly while pending or unavailable. */
function useV2<T = bigint>(functionName: string) {
  const { data, isLoading } = useReadContract({
    address: V2,
    abi: CONTRACTS.V2.abi,
    functionName,
  });
  return { value: data as T | undefined, isLoading };
}

export function SystemSettings() {
  const { address } = useAccount();

  const isAdmin =
    address && process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase();

  const fee = useV2<bigint>('getPlatformFee');
  const minEth = useV2<bigint>('ethMinimumStake');
  const maxEth = useV2<bigint>('ethMaximumStake');
  const approvals = useV2<bigint>('requiredApprovals');
  const resolutionTime = useV2<bigint>('maxResolutionTime');
  const owner = useV2<string>('owner');

  const show = (
    read: { value: bigint | undefined; isLoading: boolean },
    format: (v: bigint) => string
  ) => {
    if (read.isLoading) return <span className="ss-unread">reading…</span>;
    if (read.value === undefined) return <span className="ss-unread">unavailable</span>;
    return format(read.value);
  };

  const shell = (body: React.ReactNode) => (
    <div className="sheet">
      <div className="sheet-shell">
        <header className="sheet-hero">
          <div className="sheet-hero-top">
            <div>
              <p className="sheet-eyebrow">System</p>
              <h1 className="sheet-hero-title">
                What the contract <em>says</em>
              </h1>
            </div>
          </div>
          <p className="sheet-hero-lede">
            The live configuration of the archived V2 market, read from the
            chain. Read-only, because the key that could change any of it is no
            longer available.
          </p>
        </header>
        <main className="sheet-body">{body}</main>
      </div>
    </div>
  );

  if (!isAdmin) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Settings</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>Admins only</strong>
            System configuration is visible to administrators.
          </div>
        </div>
      </section>
    );
  }

  return shell(
    <>
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Why read-only</p>
        </div>
        <div>
          <div className="ss-warning">
            <p className="ss-warning-title">These settings cannot be changed</p>
            <p>
              Every setter on this contract is <strong>onlyOwner</strong>, and
              its owner key is no longer available. A transaction sent from any
              other wallet reverts and costs gas for nothing, so the controls
              that used to be here have been removed rather than disabled.
            </p>
            <p>
              The values that used to appear alongside them were{' '}
              <strong>never read from the chain</strong>. They were defaults
              typed into component state, which is why this page showed a 1%
              platform fee regardless of what the contract held.
            </p>
          </div>

          <p className="sheet-p ss-address">
            V2 market:{' '}
            <a
              href={`${explorer}/address/${V2}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {V2}
            </a>
          </p>
          <p className="sheet-p ss-address">
            Owner:{' '}
            {owner.isLoading ? (
              <span className="ss-unread">reading…</span>
            ) : owner.value ? (
              <a
                href={`${explorer}/address/${owner.value}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {owner.value}
              </a>
            ) : (
              <span className="ss-unread">unavailable</span>
            )}
          </p>
        </div>
      </section>

      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Live values</p>
          <p className="sheet-rail-meta">{`Read from\nthe contract`}</p>
        </div>
        <div>
          <div className="sheet-board">
            <div className="sheet-settle">
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Platform fee</span>
                <span className="sheet-settle-val">
                  {show(fee, v => `${(Number(v) / 100).toFixed(2)}%`)}
                </span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Minimum stake</span>
                <span className="sheet-settle-val">
                  {show(minEth, v => `${formatEther(v)} ETH`)}
                </span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Maximum stake</span>
                <span className="sheet-settle-val">
                  {show(maxEth, v => `${formatEther(v)} ETH`)}
                </span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Required approvals</span>
                <span className="sheet-settle-val">
                  {show(approvals, v => String(v))}
                </span>
              </div>
              <div className="sheet-settle-row sheet-settle-row--total">
                <span className="sheet-settle-key">Resolution window</span>
                <span className="sheet-settle-val">
                  {show(resolutionTime, v => `${Number(v) / 86400} days`)}
                </span>
              </div>
            </div>
          </div>

          <div className="sheet-note">
            <p>
              The live market contract runs its own configuration and is
              unaffected by anything here. Its rates are set at deploy time by{' '}
              <strong>scripts/deploy_v4.js</strong> and changed by its own owner,
              on its own contract, one deployment per chain.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

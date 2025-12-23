"use client";

import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { SWIPE_TOKEN, SWIPE_CLAIM_CONFIG } from '../../../lib/contract';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import './SwipeClaim.css';

const SWIPE_CLAIM_ABI = SWIPE_CLAIM_CONFIG.abi;
const SWIPE_CLAIM_CONTRACT = (SWIPE_CLAIM_CONFIG.address as `0x${string}`) || '0x0000000000000000000000000000000000000000';

interface ClaimInfo {
  eligible: boolean;
  betCount: bigint;
  rewardAmount: bigint;
}

export function SwipeClaim() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const [claimInfo, setClaimInfo] = useState<ClaimInfo | null>(null);
  const [hasClaimed, setHasClaimed] = useState<boolean>(false);
  const [claimingEnabled, setClaimingEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: userClaimInfo, refetch: refetchClaimInfo } = useReadContract({
    address: SWIPE_CLAIM_CONTRACT,
    abi: SWIPE_CLAIM_ABI,
    functionName: 'getUserClaimInfo',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && SWIPE_CLAIM_CONTRACT !== '0x0000000000000000000000000000000000000000',
    },
  });

  const { data: claimedStatus } = useReadContract({
    address: SWIPE_CLAIM_CONTRACT,
    abi: SWIPE_CLAIM_ABI,
    functionName: 'hasClaimed',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && SWIPE_CLAIM_CONTRACT !== '0x0000000000000000000000000000000000000000',
    },
  });

  const { data: enabledStatus } = useReadContract({
    address: SWIPE_CLAIM_CONTRACT,
    abi: SWIPE_CLAIM_ABI,
    functionName: 'claimingEnabled',
    query: {
      enabled: SWIPE_CLAIM_CONTRACT !== '0x0000000000000000000000000000000000000000',
    },
  });

  const [redisBetCount, setRedisBetCount] = useState<number | null>(null);
  const [loadingRedisBets, setLoadingRedisBets] = useState(false);
  const [claimHistory, setClaimHistory] = useState<{
    hasClaimed: boolean;
    betCount: number;
    swipeAmount: number;
    swipeAmountFormatted: string;
    tier: string;
    transactionHash?: string;
  } | null>(null);

  const fetchBetCountFromRedis = async () => {
    if (!address) return;
    setLoadingRedisBets(true);
    try {
      const response = await fetch(`/api/swipe-claim/user-bets?address=${address}`);
      const data = await response.json();
      if (data.success && data.data) {
        setRedisBetCount(data.data.betCount);
      }
    } catch (err) {
      console.error('Error fetching bets from Redis:', err);
    } finally {
      setLoadingRedisBets(false);
    }
  };

  const fetchClaimHistory = async () => {
    if (!address) return;
    try {
      const response = await fetch(`/api/swipe-claim/claim-history?address=${address}`);
      const data = await response.json();
      if (data.success && data.data) {
        setClaimHistory(data.data);
      }
    } catch (err) {
      console.error('Error fetching claim history:', err);
    }
  };

  useEffect(() => {
    if (address) {
      if (redisBetCount === null && !loadingRedisBets) {
        fetchBetCountFromRedis();
      }
      fetchClaimHistory();
    }
  }, [address]);

  useEffect(() => {
    const effectiveBetCount = redisBetCount !== null 
      ? BigInt(redisBetCount) 
      : userClaimInfo 
        ? (userClaimInfo as [boolean, bigint, bigint])[1]
        : BigInt(0);

    let rewardAmount = BigInt(0);
    let eligible = false;

    if (effectiveBetCount >= BigInt(100)) {
      rewardAmount = BigInt(25_000_000 * 10**18);
      eligible = true;
    } else if (effectiveBetCount >= BigInt(50)) {
      rewardAmount = BigInt(15_000_000 * 10**18);
      eligible = true;
    } else if (effectiveBetCount >= BigInt(25)) {
      rewardAmount = BigInt(10_000_000 * 10**18);
      eligible = true;
    } else if (effectiveBetCount >= BigInt(10)) {
      rewardAmount = BigInt(1_000_000 * 10**18);
      eligible = true;
    }

    if (effectiveBetCount > BigInt(0) || userClaimInfo) {
      setClaimInfo({ eligible, betCount: effectiveBetCount, rewardAmount });
    }

    if (claimedStatus !== undefined) {
      setHasClaimed(claimedStatus as boolean);
    }
    if (enabledStatus !== undefined) {
      setClaimingEnabled(enabledStatus as boolean);
    }
    
    if (claimedStatus !== undefined && enabledStatus !== undefined) {
      setLoading(false);
    }
  }, [userClaimInfo, claimedStatus, enabledStatus, redisBetCount]);

  useEffect(() => {
    if (isConfirmed && hash) {
      refetchClaimInfo();
      setHasClaimed(true);
      
      // Save claim history to Redis immediately (don't wait for blockchain events)
      if (claimInfo) {
        const betCount = Number(claimInfo.betCount);
        let tier = '—';
        if (betCount >= 100) tier = '100+';
        else if (betCount >= 50) tier = '50+';
        else if (betCount >= 25) tier = '25+';
        else if (betCount >= 10) tier = '10+';

        // Save to Redis via API
        fetch('/api/swipe-claim/save-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: address?.toLowerCase(),
            betCount,
            swipeAmount: claimInfo.rewardAmount.toString(),
            tier,
            transactionHash: hash
          })
        }).catch(err => console.error('Failed to save claim history:', err));

        // Also refresh from blockchain after delay
        setTimeout(() => {
          fetchClaimHistory();
        }, 5000);
      }
    }
  }, [isConfirmed, hash, claimInfo, address, refetchClaimInfo]);

  const formatSwipe = (amount: bigint | number): string => {
    const amountNum = typeof amount === 'bigint' ? Number(amount) / 1e18 : amount;
    if (amountNum >= 1_000_000) {
      return `${(amountNum / 1_000_000).toFixed(1)}M SWIPE`;
    } else if (amountNum >= 1_000) {
      return `${(amountNum / 1_000).toFixed(1)}K SWIPE`;
    }
    return `${amountNum.toFixed(0)} SWIPE`;
  };

  const handleClaim = async () => {
    if (!address || !claimInfo || !claimInfo.eligible) {
      setError('Not eligible to claim');
      return;
    }

    if (hasClaimed) {
      setError('You have already claimed your SWIPE rewards');
      return;
    }

    if (!claimingEnabled) {
      setError('Claiming is currently disabled');
      return;
    }

    try {
      setError(null);
      await writeContract({
        address: SWIPE_CLAIM_CONTRACT,
        abi: SWIPE_CLAIM_ABI,
        functionName: 'claimSwipe',
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to claim SWIPE');
      console.error('Claim error:', err);
    }
  };

  if (!address) {
    return (
      <div className="claim-container">
        <Card className="claim-card">
          <CardHeader className="claim-header">
            <CardTitle className="claim-title">💰 100M $SWIPE to Grab!</CardTitle>
            <CardDescription className="claim-subtitle">Connect wallet to check eligibility</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (SWIPE_CLAIM_CONTRACT === '0x0000000000000000000000000000000000000000') {
    return (
      <div className="claim-container">
        <Card className="claim-card">
          <CardHeader className="claim-header">
            <CardTitle className="claim-title">⚠️ Contract Not Configured</CardTitle>
            <CardDescription className="claim-error-text">SwipeClaim contract address not set</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="claim-container">
        <Card className="claim-card">
          <CardHeader className="claim-header">
            <CardTitle className="claim-title">⏳ Loading...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isLoading = isPending || isConfirming;
  const canClaim = claimInfo?.eligible && !hasClaimed && claimingEnabled && !isLoading;

  return (
    <div className="claim-container">
      <Card className="claim-card">
        <CardHeader className="claim-header">
          <CardTitle className="claim-title">💰 100M $SWIPE to Grab!</CardTitle>
          <CardDescription className="claim-subtitle">
          For previous activities
        </CardDescription>
        <div className="claim-tiers-info">
          <div className="tier-info-item">🥉 10+ bets → 1M</div>
          <div className="tier-info-item">🥈 25+ bets → 10M</div>
          <div className="tier-info-item">🥇 50+ bets → 15M</div>
          <div className="tier-info-item">👑 100+ bets → 25M</div>
        </div>
        </CardHeader>
        <CardContent className="claim-content">
          {error && (
            <div className="claim-alert claim-alert-error">
              {error}
            </div>
          )}

          {isConfirmed && (
            <div className="claim-alert claim-alert-success">
              ✅ Claimed {claimInfo ? formatSwipe(claimInfo.rewardAmount) : ''}! Refreshing...
            </div>
          )}

          {claimHistory?.hasClaimed && (
            <div className="claim-claimed-info">
              <div className="claim-claimed-header">✅ Already Claimed Rewards</div>
              <div className="claim-claimed-details">
                <div className="claim-claimed-item">
                  <span className="claim-claimed-label">Tier:</span>
                  <Badge variant="default" className="claim-tier-badge">{claimHistory.tier}</Badge>
                </div>
                <div className="claim-claimed-item">
                  <span className="claim-claimed-label">Amount Claimed:</span>
                  <span className="claim-claimed-value">{claimHistory.swipeAmountFormatted} SWIPE</span>
                </div>
                <div className="claim-claimed-item">
                  <span className="claim-claimed-label">Bets at Claim:</span>
                  <span className="claim-claimed-value">{claimHistory.betCount}</span>
                </div>
                {claimHistory.transactionHash && (
                  <div className="claim-claimed-item">
                    <span className="claim-claimed-label">Transaction:</span>
                    <a 
                      href={`https://basescan.org/tx/${claimHistory.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="claim-basescan-link"
                    >
                      View on Basescan ↗
                    </a>
                  </div>
                )}
              </div>
              <div className="claim-note" style={{ marginTop: '8px', fontSize: '9px', color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
                ⚠️ One-time claim only • Historical bets counted
              </div>
            </div>
          )}

          {hasClaimed && !claimHistory && (
            <div className="claim-status claim-status-claimed">
              ✅ Already Claimed Rewards
              <div style={{ fontSize: '9px', marginTop: '4px', opacity: 0.8 }}>
                Loading claim details...
              </div>
            </div>
          )}

          {redisBetCount !== null && (
            <div className="claim-bet-info">
              <div className="claim-bet-count">
                <span className="claim-label">Bets:</span>
                <Badge variant="secondary" className="claim-badge">{redisBetCount}</Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchBetCountFromRedis}
                disabled={loadingRedisBets}
                className="claim-refresh-btn"
              >
                {loadingRedisBets ? '⏳' : '🔄'}
              </Button>
            </div>
          )}

          {claimInfo && !hasClaimed && (
            <>
              <div className="claim-stats">
                <div className="claim-stat">
                  <span className="claim-stat-label">Your Bets</span>
                  <span className="claim-stat-value">{claimInfo.betCount.toString()}</span>
                </div>
                <div className="claim-stat">
                  <span className="claim-stat-label">Tier</span>
                  <Badge variant={claimInfo.eligible ? "default" : "secondary"} className="claim-tier-badge">
                    {Number(claimInfo.betCount) >= 100
                      ? '100+'
                      : Number(claimInfo.betCount) >= 50
                      ? '50+'
                      : Number(claimInfo.betCount) >= 25
                      ? '25+'
                      : Number(claimInfo.betCount) >= 10
                      ? '10+'
                      : '—'}
                  </Badge>
                </div>
                <div className="claim-stat claim-stat-reward">
                  <span className="claim-stat-label">Reward</span>
                  <span className="claim-stat-value claim-stat-reward-value">
                    {formatSwipe(claimInfo.rewardAmount)}
                  </span>
                </div>
              </div>

              {(() => {
                const betCount = Number(claimInfo.betCount);
                // Determine current tier based on bet count
                let currentTier: string | null = null;
                if (betCount >= 100) currentTier = '100+';
                else if (betCount >= 50) currentTier = '50+';
                else if (betCount >= 25) currentTier = '25+';
                else if (betCount >= 10) currentTier = '10+';
                
                return (
                  <div className="claim-tiers">
                    <div className={`claim-tier-item ${currentTier === '10+' ? 'claim-tier-active' : ''}`}>
                      <span className="claim-tier-label">10</span>
                      <span className="claim-tier-reward">1M</span>
                    </div>
                    <div className={`claim-tier-item ${currentTier === '25+' ? 'claim-tier-active' : ''}`}>
                      <span className="claim-tier-label">25</span>
                      <span className="claim-tier-reward">10M</span>
                    </div>
                    <div className={`claim-tier-item ${currentTier === '50+' ? 'claim-tier-active' : ''}`}>
                      <span className="claim-tier-label">50</span>
                      <span className="claim-tier-reward">15M</span>
                    </div>
                    <div className={`claim-tier-item ${currentTier === '100+' ? 'claim-tier-active' : ''}`}>
                      <span className="claim-tier-label">100+</span>
                      <span className="claim-tier-reward">25M</span>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {!hasClaimed && !claimHistory && (
            <>
              {!claimingEnabled ? (
                <div className="claim-status claim-status-disabled">
                  ⚠️ Claiming Disabled
                </div>
              ) : !claimInfo?.eligible ? (
                <div className="claim-status claim-status-not-eligible">
                  ❌ Need 10+ Bets
                </div>
              ) : (
                <Button
                  className="claim-button"
                  onClick={handleClaim}
                  disabled={!canClaim}
                  size="lg"
                >
                  {isLoading ? '⏳ Processing...' : `🎁 Claim ${claimInfo ? formatSwipe(claimInfo.rewardAmount) : 'SWIPE'}`}
                </Button>
              )}
            </>
          )}

          {/* Footer with logo and thanks */}
          <div className="claim-footer">
            <div className="claim-thanks">
              <p>Thank you for your support!</p>
            </div>
            <div className="claim-logo">
              <img src="/splash.png" alt="Logo" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

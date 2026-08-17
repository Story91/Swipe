"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { SWIPE_CLAIM_CONFIG } from '../../../lib/contract';
import { getChainConfig } from '@/lib/chains';
import { formatAmount } from './portfolioTokens';
import '../../styles/sheet.css';
import './SwipeClaim.css';

/**
 * The $SWIPE claim, which cannot pay anybody, said out loud.
 *
 * What this screen used to be: a claim flow. Tier badges, a bet counter, and a
 * button reading "Claim 25.0M SWIPE". Measured on Base mainnet on 2026-08-18,
 * against 0x9f5d800e4123e6cE6f429f5A5DD5018a631A2793:
 *
 *   getSwipeBalance()        0
 *   claimingEnabled()        true
 *   owner()                  0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd
 *   PredictionMarketV2 owner 0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd
 *
 * So the claim contract is owned by the same key as the archived V2 market, the
 * key nobody has any more, and the pot is empty. claimSwipe() requires
 * `balanceOf(this) >= rewardAmount` and the smallest tier is a million tokens,
 * so every call reverts. Simulated from a wallet the contract itself rates as
 * eligible (10 bets, 1,000,000 SWIPE): reverted, "Insufficient SWIPE balance".
 *
 * A button that always reverts is worse than no button. It costs a wallet
 * prompt, it reads as the app's fault, and it tells somebody they are owed
 * money that is not there. So the write path is gone. What is left is the
 * record: what this wallet did, what the tiers said it was worth, and the two
 * on-chain numbers that decide whether any of it can be paid. The balance is
 * read live rather than written into the copy, so if the pot is ever refilled
 * this screen reports that instead of insisting on a stale fact.
 *
 * WHY THERE IS NO ?chain= HERE, on a screen where every other read has one.
 * $SWIPE exists on Base and nowhere else. /api/swipe-claim/user-bets hardcodes
 * Base server-side for that reason and takes no chain parameter, and the two
 * contract reads below pin Base's chain id rather than following the wallet, so
 * a user sitting on Robinhood gets Base's answer instead of a failed read
 * against an address that holds no code there. The screen says which chain it
 * is talking about rather than letting the switcher imply another.
 */

const BASE = getChainConfig('base');
const CLAIM_ADDRESS = (SWIPE_CLAIM_CONFIG.address || '') as `0x${string}` | '';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const CONFIGURED = CLAIM_ADDRESS !== '' && CLAIM_ADDRESS !== ZERO_ADDRESS;

/** The contract's own constants, in whole tokens. */
const TIERS = [
  { bets: 10, reward: 1_000_000 },
  { bets: 25, reward: 10_000_000 },
  { bets: 50, reward: 15_000_000 },
  { bets: 100, reward: 25_000_000 },
] as const;

const SMALLEST_REWARD = TIERS[0].reward;

function tierFor(betCount: number) {
  return [...TIERS].reverse().find((tier) => betCount >= tier.bets) ?? null;
}

interface ClaimHistory {
  hasClaimed: boolean;
  betCount: number;
  swipeAmountFormatted: string;
  tier: string;
  transactionHash?: string;
}

export function SwipeClaim() {
  const { address } = useAccount();

  const [betCount, setBetCount] = useState<number | null>(null);
  const [betCountError, setBetCountError] = useState<string | null>(null);
  const [history, setHistory] = useState<ClaimHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Both reads are pinned to Base. Without chainId wagmi uses whatever chain
  // the wallet is on, and on any other chain this address has no code, so the
  // read fails and the screen would report "unknown" for a number it can
  // perfectly well fetch.
  const { data: potBalance, isError: potFailed } = useReadContract({
    address: CONFIGURED ? (CLAIM_ADDRESS as `0x${string}`) : undefined,
    abi: SWIPE_CLAIM_CONFIG.abi,
    functionName: 'getSwipeBalance',
    chainId: BASE.viemChain.id,
    query: { enabled: CONFIGURED },
  });

  const { data: claimedOnChain } = useReadContract({
    address: CONFIGURED ? (CLAIM_ADDRESS as `0x${string}`) : undefined,
    abi: SWIPE_CLAIM_CONFIG.abi,
    functionName: 'hasClaimed',
    args: address ? [address] : undefined,
    chainId: BASE.viemChain.id,
    query: { enabled: CONFIGURED && !!address },
  });

  const loadBets = useCallback(async () => {
    if (!address) return;
    try {
      const response = await fetch(`/api/swipe-claim/user-bets?address=${address}`);
      if (!response.ok) throw new Error(`the bet count service answered ${response.status}`);
      const body = await response.json();
      if (!body?.success || !body.data) throw new Error(body?.error || 'no bet count came back');
      setBetCount(Number(body.data.betCount) || 0);
      setBetCountError(null);
    } catch (err) {
      // The previous count stays. Writing 0 here would tell somebody with a
      // hundred bets on record that they had none, on the one screen whose
      // whole subject is what they did.
      setBetCountError(err instanceof Error ? err.message : 'the bet count could not be read');
    }
  }, [address]);

  const loadHistory = useCallback(async () => {
    if (!address) return;
    try {
      const response = await fetch(`/api/swipe-claim/claim-history?address=${address}`);
      if (!response.ok) throw new Error(`the claim history service answered ${response.status}`);
      const body = await response.json();
      if (!body?.success) throw new Error(body?.error || 'the claim history could not be read');
      // A successful answer with no data means no claim was ever made, which is
      // a fact and is allowed to clear what is held.
      setHistory((body.data as ClaimHistory) ?? null);
      setHistoryError(null);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'the claim history could not be read');
    }
  }, [address]);

  useEffect(() => {
    if (!address) {
      setBetCount(null);
      setHistory(null);
      setBetCountError(null);
      setHistoryError(null);
      return;
    }
    loadBets();
    loadHistory();
  }, [address, loadBets, loadHistory]);

  const pot = potBalance === undefined ? null : Number(potBalance) / 1e18;
  const potKnown = pot !== null;
  const canPayAnyone = potKnown && pot >= SMALLEST_REWARD;
  const reached = betCount === null ? null : tierFor(betCount);

  // The headline follows the balance rather than asserting one. Today the pot
  // reads zero, and if that ever changes the page should not still be telling
  // people there is nothing there.
  const headline = !potKnown
    ? { lead: 'The old $SWIPE', accent: 'claim' }
    : canPayAnyone
      ? { lead: 'Claims are', accent: 'closed' }
      : { lead: 'Nothing left to', accent: 'claim' };

  const lede = !potKnown ? (
    <>
      This paid $SWIPE for bets placed on the old Base contract. What it holds
      today could not be read, so nothing here promises a payout. Claims are not
      sent from this screen either way: the contract belongs to the archived set,
      and its owner key is gone.
    </>
  ) : canPayAnyone ? (
    <>
      This paid $SWIPE for bets placed on the old Base contract, and the pot has
      tokens in it again. Claims are still not sent from here. The contract
      belongs to the archived set, its owner key is gone, and $SWIPE claims are
      moving to the new token on Robinhood Chain.
    </>
  ) : (
    <>
      This paid $SWIPE for bets placed on the old Base contract. The contract is
      still there and still says claiming is switched on, but it holds no
      tokens, so a claim reverts before it does anything. The wallet that funded
      it is the one lost along with the archived markets. What your wallet did
      is below.
    </>
  );

  const shell = (body: React.ReactNode) => (
    <div className="sheet">
      <div className="sheet-shell">
        <header className="sheet-hero">
          <div className="sheet-hero-top">
            <div>
              <p className="sheet-eyebrow">$SWIPE claim</p>
              <h1 className="sheet-hero-title">
                {headline.lead} <em>{headline.accent}</em>
              </h1>
            </div>
          </div>
          <p className="sheet-hero-lede">{lede}</p>
        </header>
        <main className="sheet-body">{body}</main>
      </div>
    </div>
  );

  if (!CONFIGURED) {
    return shell(
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Contract</p>
        </div>
        <div>
          <div className="sheet-empty">
            <strong>No claim contract configured</strong>
            NEXT_PUBLIC_SWIPE_CLAIM_CONTRACT is not set, so this build has no
            address to read. Nothing is being hidden, there is simply nothing
            pointed at.
          </div>
        </div>
      </section>
    );
  }

  return shell(
    <>
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">The pot</p>
          <p className="sheet-rail-meta">{`Read from Base,\nnot from memory`}</p>
        </div>
        <div>
          <div className="sheet-board">
            <div className="sheet-board-head">
              <h2 className="sheet-board-title">SwipeClaim on Base</h2>
              <p className="sheet-board-meta">
                <a
                  className="sc-link"
                  href={`${BASE.explorer}/address/${CLAIM_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {CLAIM_ADDRESS.slice(0, 6)}…{CLAIM_ADDRESS.slice(-4)}
                </a>
              </p>
            </div>
            <div className="sheet-settle">
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">$SWIPE it holds</span>
                <span className="sheet-settle-val">
                  {potKnown ? `${formatAmount(pot, 'SWIPE')} SWIPE` : 'could not read'}
                  {potFailed && (
                    <span className="sheet-settle-sub">the Base node did not answer</span>
                  )}
                </span>
              </div>
              <div className="sheet-settle-row">
                <span className="sheet-settle-key">Smallest claim it can pay</span>
                <span className="sheet-settle-val">
                  {formatAmount(SMALLEST_REWARD, 'SWIPE')} SWIPE
                  <span className="sheet-settle-sub">the 10 bet tier</span>
                </span>
              </div>
              <div className="sheet-settle-row sheet-settle-row--total">
                <span className="sheet-settle-key">Can it pay anyone</span>
                <span className="sheet-settle-val">
                  {!potKnown ? 'unknown' : canPayAnyone ? 'yes' : 'no'}
                </span>
              </div>
            </div>
          </div>

          <div className="sheet-note">
            {canPayAnyone ? (
              <p>
                The pot has tokens in it again. Claims are still not sent from
                here: this contract belongs to the archived set and $SWIPE
                claims are moving to the new token on Robinhood Chain. Anything
                left in it can only be moved by its owner, and that key is gone.
              </p>
            ) : (
              <p>
                Zero tokens against a smallest tier of{' '}
                {formatAmount(SMALLEST_REWARD, 'SWIPE')} is why a claim reverts
                rather than fails politely. The contract checks its own balance
                last, after it has decided you are eligible, so the old screen
                could offer a button with real numbers on it and still have
                nothing behind it.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Your record</p>
          <p className="sheet-rail-meta">{`Bets on the old\nBase contract`}</p>
        </div>
        <div>
          {!address ? (
            <div className="sheet-empty">
              <strong>No wallet connected</strong>
              Connect one and this shows how many bets it placed on the old
              contract, and which tier that reached.
            </div>
          ) : (
            <>
              {betCountError && (
                <div className="sheet-empty">
                  <strong>Could not count your bets</strong>
                  {betCountError}
                </div>
              )}

              <div className="sheet-board">
                <div className="sheet-board-head">
                  <h2 className="sheet-board-title">What this wallet did</h2>
                  <p className="sheet-board-meta">Base, V2 markets</p>
                </div>
                <div className="sheet-settle">
                  <div className="sheet-settle-row">
                    <span className="sheet-settle-key">Markets you bet on</span>
                    <span className="sheet-settle-val">
                      {betCount === null ? 'not read yet' : betCount}
                    </span>
                  </div>
                  <div className="sheet-settle-row">
                    <span className="sheet-settle-key">Tier that reached</span>
                    <span className="sheet-settle-val">
                      {betCount === null
                        ? 'not read yet'
                        : reached
                          ? `${reached.bets}+`
                          : 'below the first tier'}
                    </span>
                  </div>
                  <div className="sheet-settle-row sheet-settle-row--total">
                    <span className="sheet-settle-key">What that tier promised</span>
                    <span className="sheet-settle-val">
                      {reached ? `${formatAmount(reached.reward, 'SWIPE')} SWIPE` : 'nothing'}
                      <span className="sheet-settle-sub">
                        {reached ? 'unpayable, the pot is empty' : '10 bets was the floor'}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {history?.hasClaimed ? (
                <div className="sheet-board sc-claimed">
                  <div className="sheet-board-head">
                    <h2 className="sheet-board-title">You already claimed</h2>
                    <p className="sheet-board-meta">Tier {history.tier}</p>
                  </div>
                  <div className="sheet-settle">
                    <div className="sheet-settle-row">
                      <span className="sheet-settle-key">Received</span>
                      <span className="sheet-settle-val">
                        {history.swipeAmountFormatted} SWIPE
                      </span>
                    </div>
                    <div className="sheet-settle-row">
                      <span className="sheet-settle-key">Bets counted then</span>
                      <span className="sheet-settle-val">{history.betCount}</span>
                    </div>
                    {history.transactionHash && (
                      <div className="sheet-settle-row">
                        <span className="sheet-settle-key">Transaction</span>
                        <span className="sheet-settle-val">
                          <a
                            className="sc-link"
                            href={`${BASE.explorer}/tx/${history.transactionHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            view it
                          </a>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : claimedOnChain ? (
                <div className="sheet-empty">
                  <strong>The contract has you down as claimed</strong>
                  hasClaimed is true for this wallet, so a claim went through at
                  some point. The amount and the transaction are not in the
                  cache, and the event scan only reaches back thirty days.
                </div>
              ) : null}

              {historyError && (
                <div className="sheet-empty">
                  <strong>Could not read the claim history</strong>
                  {historyError}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">The tiers</p>
          <p className="sheet-rail-meta">{`As the contract\nstill has them`}</p>
        </div>
        <div>
          <div className="sc-tiers">
            {TIERS.map((tier) => {
              const isReached = reached?.bets === tier.bets;
              return (
                <div
                  key={tier.bets}
                  className={`sc-tiers__item${isReached ? ' sc-tiers__item--reached' : ''}`}
                >
                  <span className="sc-tiers__count">{tier.bets}+ bets</span>
                  <span className="sc-tiers__reward">
                    {formatAmount(tier.reward, 'SWIPE')}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="sheet-note">
            <p>
              These are the contract&apos;s own constants, kept here so the
              record is checkable rather than remembered. One claim per wallet,
              counted from bets on the V2 markets only. $SWIPE claims are moving
              to the new token on Robinhood Chain, which is why nothing here has
              been repointed at a live contract.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

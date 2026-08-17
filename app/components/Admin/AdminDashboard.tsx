"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { useAdminPredictions } from '@/lib/hooks/useAdminPredictions';
import { useAdminRequest } from '@/lib/auth/useAdminRequest';
import { useActiveChain } from '@/lib/chains/activeChain';
import { useMarketWrite } from '@/lib/chains/useMarketWrite';
import { addressUrl } from '@/lib/chains/market';
import { groupMarkets, settlesOnChain, shortAddress, type AdminMarket } from './adminMarkets';
import { ProposalCard } from './ProposalCard';
import { MarketCard } from './MarketCard';
import '../../styles/sheet.css';
import './AdminDashboard.css';

/**
 * The admin desk.
 *
 * This file was 2606 lines and opened with a grid of twenty sync and debug
 * buttons, above a list of every market it could find. It called window.alert
 * a hundred times. Several of those buttons wrote to Base's V1, V2 or USDC
 * pool, and all three are owned by a key nobody has, so those writes could
 * never have landed. Meanwhile the one thing an operator has to do here,
 * register the markets people propose, had no button at all: the pending list
 * was computed on line 174 and never rendered, and the list it was computed
 * from had already been narrowed to `pred_v1_` and `pred_v2_` ids, which
 * excludes every market the current contract mints.
 *
 * What is left is four sections and five kinds of button. The bucketing lives in
 * adminMarkets.ts with a test on it, because a proposal in the wrong bucket is
 * a proposal nobody can see.
 *
 * Every chain write goes through useMarketWrite, which resolves the address
 * from the selected chain, re-checks at send time that it really is that
 * chain's market, moves the wallet onto the matching chain and pins chainId.
 * Nothing on this screen writes to an address it chose itself.
 */

/**
 * The props the two call sites still pass.
 *
 * TinderCard.tsx mounts this component with its own seven handlers and cannot
 * be edited from here. They are all ignored: five of the seven only ever wrote
 * to archived contracts, and resolve and cancel are done on this screen through
 * the guarded path rather than handed upward. Kept optional so both call sites
 * keep compiling and neither is quietly given a button that does nothing.
 */
export interface AdminDashboardProps {
  predictions?: unknown[];
  onResolvePrediction?: (
    predictionId: string | number,
    outcome: boolean,
    contractVersion?: 'V1' | 'V2'
  ) => void;
  onCancelPrediction?: (
    predictionId: string | number,
    reason: string,
    contractVersion?: 'V1' | 'V2'
  ) => void;
  onCreatePrediction?: () => void;
  onManageApprovers?: () => void;
  onWithdrawFees?: () => void;
  onPauseContract?: () => void;
}

interface Notice {
  tone: 'ok' | 'bad';
  text: string;
  hash?: string;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function AdminDashboard(_props: AdminDashboardProps) {
  const { chainKey, chain } = useActiveChain();
  const marketWrite = useMarketWrite();
  const publicClient = usePublicClient();
  const signAdminRequest = useAdminRequest();

  /**
   * Active and expired markets for the selected chain, proposals included.
   *
   * The hook keeps the last good answer when a read fails and reports the
   * failure separately, so a flaky refresh cannot blank the queue. That has
   * shipped as a bug twice here, so the failure states below are written the
   * same way: a note above the rows while there are rows, and only a full
   * screen message when there is nothing to show.
   */
  const { predictions, loading, error, refreshData } = useAdminPredictions();

  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Registered in this session, before the sync has caught up. */
  const [justRegistered, setJustRegistered] = useState<ReadonlySet<string>>(() => new Set());
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // A market crosses its deadline while somebody is looking at it, and it has to
  // move from open to waiting on a decision without a reload.
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Ids are per chain, so nothing learned about Base's markets is true about
  // Robinhood's. Switching networks clears both.
  useEffect(() => {
    setJustRegistered(new Set());
    setNotice(null);
  }, [chainKey]);

  const groups = useMemo(
    () => groupMarkets(predictions, now, justRegistered),
    [predictions, now, justRegistered]
  );

  /**
   * Pull a market off chain into Redis after a write.
   *
   * The chain travels on the query string, which the route reads before the
   * body. Without it every sync from this screen would land on Base's records
   * whatever network the operator had selected.
   */
  const syncMarket = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/sync/usdc?chain=${chainKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ predictionIds: [id], chain: chainKey }),
        });
      } catch (syncError) {
        console.warn('Sync after the write failed:', syncError);
      }
    },
    [chainKey]
  );

  /**
   * Every chain write on this screen.
   *
   * The receipt is waited for, not the hash. Announcing success on a hash and
   * writing Redis before the transaction mines is what once left Redis claiming
   * a market was registered while the chain disagreed, and every bet on it then
   * failed with "Prediction not registered".
   */
  const sendToMarket = useCallback(
    async (
      market: AdminMarket,
      call: { functionName: string; args: readonly unknown[] },
      done: string
    ): Promise<boolean> => {
      if (!marketWrite.ready) {
        setNotice({
          tone: 'bad',
          text: 'This network has no Swipe market deployed, so there is nothing to write to.',
        });
        return false;
      }

      setBusyId(market.id);
      setNotice(null);
      try {
        const hash = await marketWrite.write(call);
        const receipt = await publicClient?.waitForTransactionReceipt({ hash });
        if (receipt && receipt.status !== 'success') {
          setNotice({ tone: 'bad', text: 'The transaction reverted on chain.', hash });
          return false;
        }
        await syncMarket(market.id);
        await refreshData();
        setNotice({ tone: 'ok', text: done, hash });
        return true;
      } catch (writeError) {
        setNotice({ tone: 'bad', text: messageOf(writeError) });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [marketWrite, publicClient, syncMarket, refreshData]
  );

  const registerProposal = useCallback(
    async (market: AdminMarket) => {
      if (market.number === null) {
        setNotice({ tone: 'bad', text: 'That id cannot be read, so there is no market number to register.' });
        return;
      }
      const target = marketWrite.market?.address;
      const confirmed = window.confirm(
        `Register market ${market.number} on ${target ?? 'this chain'}?\n\n` +
          `${market.question}\n\n` +
          `Creator ${market.creator}\n` +
          'People can bet on it as soon as this lands.'
      );
      if (!confirmed) return;

      const ok = await sendToMarket(
        market,
        {
          functionName: 'registerPrediction',
          args: [BigInt(market.number), market.creator as `0x${string}`, BigInt(market.deadline)],
        },
        `Market ${market.number} is registered. People can bet on it now.`
      );

      // Nothing clears needsApproval on the record, so the sync above is what
      // makes this durable and this set is what makes it immediate.
      if (ok) {
        setJustRegistered((prev) => {
          const next = new Set(prev);
          next.add(market.id);
          return next;
        });
      }
    },
    [marketWrite, sendToMarket]
  );

  /** Legacy ids were never on a contract, so Redis is the only place to settle them. */
  const settleInRedis = useCallback(
    async (market: AdminMarket, body: Record<string, unknown>, method: 'POST' | 'PUT', done: string) => {
      setBusyId(market.id);
      setNotice(null);
      try {
        const response = await fetch(`/api/predictions/resolve?chain=${chainKey}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(await signAdminRequest(method === 'POST' ? 'resolve' : 'cancel')),
          },
          body: JSON.stringify({ ...body, predictionId: market.id, chain: chainKey }),
        });
        if (!response.ok) {
          const failed = await response.json().catch(() => ({}));
          setNotice({ tone: 'bad', text: failed.error || `The server refused with ${response.status}.` });
          return;
        }
        await refreshData();
        setNotice({ tone: 'ok', text: done });
      } catch (apiError) {
        setNotice({ tone: 'bad', text: messageOf(apiError) });
      } finally {
        setBusyId(null);
      }
    },
    [chainKey, signAdminRequest, refreshData]
  );

  /**
   * Nothing on an archived contract can be settled, from here or anywhere.
   *
   * The bucketing already keeps those markets off the screen, so this should be
   * unreachable. It says so out loud rather than falling through to the API,
   * which would answer 400 and leave the operator reading a status code.
   */
  const refuseArchived = useCallback((market: AdminMarket) => {
    setNotice({
      tone: 'bad',
      text: `${market.id} was minted by a contract nobody owns any more. Nothing can settle it.`,
    });
  }, []);

  const resolveMarket = useCallback(
    async (market: AdminMarket, outcome: boolean) => {
      const side = outcome ? 'yes' : 'no';

      if (settlesOnChain(market)) {
        if (market.number === null) return;
        const confirmed = window.confirm(
          `Resolve market ${market.number} as ${side.toUpperCase()}?\n\n` +
            `${market.question}\n\n` +
            'This pays out and it cannot be undone.'
        );
        if (!confirmed) return;

        await sendToMarket(
          market,
          { functionName: 'resolvePrediction', args: [BigInt(market.number), outcome] },
          `Market ${market.number} is resolved ${side}. Winners can claim.`
        );
        return;
      }

      if (market.generation !== 'legacy') {
        refuseArchived(market);
        return;
      }

      if (!window.confirm(`Settle ${market.id} as ${side}? This decides who is paid.`)) return;
      await settleInRedis(
        market,
        { outcome, reason: `Settled ${side} from the admin desk` },
        'POST',
        `${market.id} is settled ${side}.`
      );
    },
    [sendToMarket, settleInRedis, refuseArchived]
  );

  const cancelMarket = useCallback(
    async (market: AdminMarket) => {
      const reason = window.prompt(
        'Why is this market being cancelled? Everyone gets their stake back.'
      );
      if (!reason || !reason.trim()) return;

      if (settlesOnChain(market)) {
        if (market.number === null) return;
        await sendToMarket(
          market,
          { functionName: 'cancelPrediction', args: [BigInt(market.number), reason.trim()] },
          `Market ${market.number} is cancelled. Everyone can claim a refund.`
        );
        return;
      }

      if (market.generation !== 'legacy') {
        refuseArchived(market);
        return;
      }

      await settleInRedis(market, { reason: reason.trim() }, 'PUT', `${market.id} is cancelled.`);
    },
    [sendToMarket, settleInRedis, refuseArchived]
  );

  const working = busyId !== null;
  const contract = marketWrite.market?.address ?? null;
  const symbol = chain.stable.symbol;
  const decimals = chain.stable.decimals;
  const creatorUrl = (address: string) => (address ? addressUrl(chainKey, address) : null);

  /**
   * A row is locked while any row is working, and additionally while there is
   * no contract to write to. The second half is per market rather than global:
   * a legacy market settles in Redis and does not care whether this chain has a
   * market deployed.
   */
  const lockedFor = (market: AdminMarket) =>
    working || (settlesOnChain(market) && !marketWrite.ready);

  const nothingLoaded = predictions.length === 0;

  const body = (() => {
    if (nothingLoaded && loading) {
      return (
        <section className="sheet-block">
          <div className="sheet-rail">
            <p className="sheet-eyebrow">Proposals</p>
          </div>
          <div>
            <div className="sheet-empty">
              <strong>Reading the queue</strong>
              Asking {chain.label} for everything still open.
            </div>
          </div>
        </section>
      );
    }

    if (nothingLoaded && error) {
      return (
        <section className="sheet-block">
          <div className="sheet-rail">
            <p className="sheet-eyebrow">Proposals</p>
          </div>
          <div>
            <div className="sheet-empty">
              <strong>Could not read the queue</strong>
              {error}
              <p>
                <button type="button" className="sheet-action" onClick={refreshData}>
                  Try again
                </button>
              </p>
            </div>
          </div>
        </section>
      );
    }

    return (
      <>
        <section className="sheet-block">
          <div className="sheet-rail">
            <p className="sheet-eyebrow">Proposals</p>
            <p className="sheet-rail-meta">
              {groups.proposal.length === 0
                ? 'nothing waiting'
                : `${groups.proposal.length} waiting`}
            </p>
          </div>
          <div>
            {groups.proposal.length === 0 ? (
              <div className="sheet-empty">
                <strong>Nothing waiting</strong>
                Anyone with a wallet can propose a market. One shows up here the moment they do,
                and it is inert until you register it.
              </div>
            ) : (
              <div className="adm-stack">
                {groups.proposal.map((market) => (
                  <ProposalCard
                    key={market.id}
                    market={market}
                    now={now}
                    creatorUrl={creatorUrl(market.creator)}
                    busy={busyId === market.id}
                    disabled={lockedFor(market)}
                    onRegister={registerProposal}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="sheet-block">
          <div className="sheet-rail">
            <p className="sheet-eyebrow">To settle</p>
            <p className="sheet-rail-meta">
              {groups.settle.length === 0
                ? 'none overdue'
                : `${groups.settle.length} past deadline`}
            </p>
          </div>
          <div>
            {groups.settle.length === 0 ? (
              <div className="sheet-empty">
                <strong>Nothing is waiting on a decision</strong>
                Markets land here the moment their deadline goes by.
              </div>
            ) : (
              <div className="adm-stack">
                {groups.settle.map((market) => (
                  <MarketCard
                    key={market.id}
                    market={market}
                    now={now}
                    overdue
                    symbol={symbol}
                    decimals={decimals}
                    busy={busyId === market.id}
                    disabled={lockedFor(market)}
                    onResolve={resolveMarket}
                    onCancel={cancelMarket}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="sheet-block">
          <div className="sheet-rail">
            <p className="sheet-eyebrow">Open</p>
            <p className="sheet-rail-meta">
              {groups.running.length === 0
                ? 'none open'
                : `${groups.running.length} taking bets`}
            </p>
          </div>
          <div>
            {groups.running.length === 0 ? (
              <div className="sheet-empty">
                <strong>No market is open</strong>
                Register a proposal above and it appears here.
              </div>
            ) : (
              <div className="adm-stack">
                {groups.running.map((market) => (
                  <MarketCard
                    key={market.id}
                    market={market}
                    now={now}
                    overdue={false}
                    symbol={symbol}
                    decimals={decimals}
                    busy={busyId === market.id}
                    disabled={lockedFor(market)}
                    onResolve={resolveMarket}
                    onCancel={cancelMarket}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {groups.archived.length > 0 && (
          <section className="sheet-block">
            <div className="sheet-rail">
              <p className="sheet-eyebrow">Archived</p>
              <p className="sheet-rail-meta">{`${groups.archived.length} markets`}</p>
            </div>
            <div>
              <p className="sheet-p">
                {groups.archived.length} markets still open on this chain were minted by an
                older contract. Their owner key is gone and PredictionMarketV2 has no
                transferOwnership, so none of them can be resolved, cancelled or claimed ever
                again.
              </p>
              <div className="sheet-note">
                <p>
                  So they get a count and nothing else. The old panel drew every one of them as
                  a card with resolve buttons on it, which is how a dead contract came to be the
                  loudest thing on the screen.
                </p>
              </div>
            </div>
          </section>
        )}
      </>
    );
  })();

  return (
    <div className="sheet">
      <div className="sheet-shell">
        <header className="sheet-hero">
          <div className="sheet-hero-top">
            <div>
              <p className="sheet-eyebrow">Admin</p>
              <h1 className="sheet-hero-title">
                Market <em>desk</em>
              </h1>
            </div>
          </div>
          <p className="sheet-hero-lede">
            Four things happen here. Proposals get registered on chain, markets past their
            deadline get an outcome, a market that should not have run gets cancelled, and the
            open ones sit at the bottom where you can watch them. The twenty sync and debug
            buttons that used to fill the top of this screen are gone. Several of them wrote to
            contracts nobody owns.
          </p>

          <div className="adm-toolbar">
            <button
              type="button"
              className="sheet-action"
              onClick={refreshData}
              disabled={loading || working}
            >
              {loading ? 'Reading' : 'Refresh'}
            </button>
            <p className="adm-toolbar-note">
              {chain.label}
              {contract ? (
                <>
                  {', '}
                  <a
                    className="adm-link"
                    href={addressUrl(chainKey, contract)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortAddress(contract)}
                  </a>
                </>
              ) : (
                ', no market deployed'
              )}
            </p>
          </div>

          {marketWrite.wrongNetwork && (
            <div className="adm-notice adm-notice--bad" role="status">
              <p>
                Your wallet is on a different network. Any write below will ask it to switch to{' '}
                {chain.label} first, and it will not send until it does.
              </p>
            </div>
          )}

          {error && !nothingLoaded && (
            <div className="adm-notice adm-notice--bad" role="status">
              <p>
                The last refresh failed, so what is below is from before it. {error}
              </p>
            </div>
          )}

          {/* The container is always in the tree, and only its contents
              change. A live region inserted at the same moment as its text is
              not reliably announced. */}
          <div aria-live="polite">
            {notice && (
              <div className={notice.tone === 'ok' ? 'adm-notice' : 'adm-notice adm-notice--bad'}>
                <p>
                  {notice.text}
                  {notice.hash && <span className="adm-notice__hash">{notice.hash}</span>}
                </p>
              </div>
            )}
          </div>
        </header>

        <main className="sheet-body">{body}</main>
      </div>
    </div>
  );
}

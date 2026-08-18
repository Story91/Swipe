"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { ArrowLeft, Share2 } from "lucide-react";
import sdk from "@farcaster/miniapp-sdk";
import { useComposeCast } from "@coinbase/onchainkit/minikit";
import type { RedisPrediction } from "@/lib/types/redis";
import { useActiveChain, setActiveChain } from "@/lib/chains/activeChain";
import { getMarketContract } from "@/lib/chains/market";
import { isChainKey } from "@/lib/chains/requestChain";
import { useIsDesktop } from "@/lib/hooks/useMediaQuery";
import { OddsChart } from "@/app/components/Markets/MarketDetail/OddsChart";
import { PriceCards } from "@/app/components/Markets/MarketDetail/PriceCards";
import { MarketStatsRow } from "@/app/components/Markets/MarketDetail/MarketStatsRow";
import { BetPanel } from "@/app/components/Markets/MarketDetail/BetPanel";
import { ExitPanel } from "@/app/components/Markets/MarketDetail/ExitPanel";
import { formatPool, yesPriceOf } from "@/app/components/Markets/MarketDetail/marketDetail";
import type { PricePoint } from "@/app/components/Markets/MarketDetail/marketDetail";
import "@/app/components/Markets/MarketDetail/MarketDetail.css";

/**
 * One market, in full.
 *
 * Two things were wrong with the page this replaces and only one of them was
 * the layout.
 *
 * It read `yesTotalAmount` and `swipeTotalAmount`, which are the V2 ETH and
 * SWIPE pools. Nothing has written those since the role split: the sync path
 * at app/api/sync/usdc/route.ts writes `usdcYesTotalAmount` and
 * `usdcNoTotalAmount`, so every market the app can currently bet on rendered
 * here as 0.00000 ETH, "No SWIPE stakes yet", and two odds bars pinned at
 * 50/50. It was not an empty page, it was a page reading the wrong record. The
 * two dead blocks are gone rather than left showing zeros.
 *
 * It also fetched without `?chain=`, and that endpoint defaults an absent chain
 * to Base, so a Robinhood user was shown Base's market of the same number.
 *
 * Betting: on a phone the button is still a router.push into the swipe deck,
 * where staking lives. On desktop the rail carries BetPanel, which stakes here
 * through the same useMarketWrite path the deck uses, behind the same address
 * guard, and pays the price-history POST that keeps the chart above it moving.
 * The exit rows under it are ExitPanel, one row per side held, same rules.
 */
export default function PredictionPageClient() {
  const params = useParams();
  const router = useRouter();
  const search = useSearchParams();
  const predictionId = params.id as string;
  const { setFrameReady, isFrameReady } = useMiniKit();
  const { composeCast: minikitComposeCast } = useComposeCast();
  const { chainKey, chain, isReadOnly } = useActiveChain();
  const isDesktop = useIsDesktop();

  const [prediction, setPrediction] = useState<RedisPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  // Bumped after a confirmed bet or exit, so the record and the price line
  // re-fetch without waiting for a navigation.
  const [refreshTick, setRefreshTick] = useState(0);
  const reload = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  /**
   * A shared link says which chain it is about, and the app follows it.
   *
   * Without this the page opens on whatever chain the switcher happens to hold,
   * which for a cold visit is always the default. Market 5 exists on both
   * chains and they are different questions, so a Robinhood link would render
   * Base's market 5, and the switcher in the nav would agree with the wrong
   * answer. Runs on the id as well as the query, because navigating between two
   * markets on different chains is the same problem a second time.
   */
  useEffect(() => {
    const requested = search?.get('chain');
    if (requested && isChainKey(requested)) {
      setActiveChain(requested);
    }
  }, [search, predictionId]);

  useEffect(() => {
    if (!predictionId) return;
    let cancelled = false;

    const fetchPrediction = async () => {
      try {
        // Only the first load earns the full-page spinner. A refetch after a
        // confirmed bet or exit keeps the page up and swaps the numbers.
        if (refreshTick === 0) setLoading(true);
        // Market 1 exists on both chains and they are different markets, so the
        // id alone does not identify one.
        const response = await fetch(
          `/api/predictions/${predictionId}?chain=${chainKey}`
        );

        if (!response.ok) {
          throw new Error("Prediction not found");
        }

        const data = await response.json();
        if (cancelled) return;
        if (data.success && data.prediction) {
          setPrediction(data.prediction);
          setError(null);
        } else {
          throw new Error(data.error || "Failed to load prediction");
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPrediction();
    return () => {
      cancelled = true;
    };
  }, [predictionId, chainKey, refreshTick]);

  // Unconditional, unlike the card's, which is gated on an expanded state this
  // page does not have. The endpoint answers with an empty history rather than
  // a 404 when a market has no line yet, so there is no error branch to write.
  useEffect(() => {
    if (!predictionId) return;
    let cancelled = false;

    if (refreshTick === 0) setHistoryLoading(true);
    fetch(`/api/predictions/${predictionId}/price-history?chain=${chainKey}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success && data.data?.history) setHistory(data.data.history);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [predictionId, chainKey, refreshTick]);

  const sym = chain.stable.symbol;
  const decimals = chain.stable.decimals;

  // Read-only here: the address and its explorer, so the page can point at
  // the contract holding this market's money. Writes stay in BetPanel and
  // ExitPanel, behind useMarketWrite. Null on a chain with nothing deployed,
  // and the link simply does not render.
  const liveContract = getMarketContract(chainKey);

  const pools = useMemo(() => {
    const yes = prediction?.usdcYesTotalAmount ?? 0;
    const no = prediction?.usdcNoTotalAmount ?? 0;
    return { yes, no, total: yes + no };
  }, [prediction]);

  const yesPrice = yesPriceOf(pools.yes, pools.no);
  const noPrice = 100 - yesPrice;

  const settled = !!prediction?.resolved || !!prediction?.cancelled;
  const archived = isReadOnly && !settled;

  const handleGoBack = useCallback(() => router.push("/"), [router]);

  // Unchanged. Resolved markets go to the results screen, live ones seek the
  // swipe deck to this card, which is where staking lives.
  const handleOpenInApp = useCallback(() => {
    if (prediction?.resolved) {
      router.push("/?dashboard=user");
    } else {
      router.push(`/?prediction=${predictionId}`);
    }
  }, [prediction?.resolved, predictionId, router]);

  const handleShare = async () => {
    if (isSharing || !prediction) return;
    setIsSharing(true);

    try {
      const appUrl = `${window.location.origin}/prediction/${prediction.id}?chain=${chainKey}`;
      // Was the ETH pool, which is zero on every market this app takes bets on,
      // so every share went out advertising an empty market.
      const shareText = `🔮 Check out this prediction: ${prediction.question}\n\n📊 Total Pool: ${formatPool(pools.total, decimals)} ${sym}\n\nJoin and make your prediction! 🎯`;

      try {
        if (minikitComposeCast) {
          await minikitComposeCast({
            text: shareText,
            embeds: [appUrl] as [string],
          });
          return;
        }
      } catch (e) {
        console.log("MiniKit composeCast failed, trying SDK...", e);
      }

      await sdk.actions.composeCast({ text: shareText, embeds: [appUrl] });
    } catch (err) {
      console.error("Error sharing prediction:", err);
    } finally {
      setIsSharing(false);
    }
  };

  if (loading) {
    return (
      <div className="mdet">
        <div className="mdet__shell">
          <div className="mdet__spinner" role="status" aria-label="Loading market" />
        </div>
      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="mdet">
        <div className="mdet__shell">
          <div className="mdet__state" role="alert">
            <h2>Prediction not found</h2>
            <p>{error || "This prediction does not exist on this network."}</p>
            <button type="button" className="mdet-cta" onClick={handleGoBack}>
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const backgroundImageUrl = prediction.ogImageUrl || prediction.imageUrl;
  const bettors =
    prediction.usdcParticipants?.length ??
    prediction.usdcMarketStats?.participantCount ??
    0;

  return (
    <div className="mdet">
      {backgroundImageUrl && (
        <div
          className="mdet__bleed"
          aria-hidden="true"
          style={{ backgroundImage: `url(${backgroundImageUrl})` }}
        />
      )}

      <div className="mdet__shell">
        <div className="mdet__bar">
          <button type="button" className="mdet__btn" onClick={handleGoBack}>
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back
          </button>
          <span className="mdet__bar-spacer" />
          <button
            type="button"
            className="mdet__btn"
            onClick={handleShare}
            disabled={isSharing}
          >
            <Share2 className="w-4 h-4" aria-hidden="true" />
            {isSharing ? "Sharing" : "Share"}
          </button>
        </div>

        <div className="mdet__tags">
          {prediction.category && (
            <span className="mdet__tag">{prediction.category}</span>
          )}
          {prediction.resolved && (
            <span
              className={`mdet__tag ${prediction.outcome ? "mdet__tag--won" : "mdet__tag--lost"}`}
            >
              {prediction.outcome ? "Yes won" : "No won"}
            </span>
          )}
          {prediction.cancelled && (
            <span className="mdet__tag mdet__tag--lost">Cancelled</span>
          )}
        </div>

        <h1 className="mdet__question">{prediction.question}</h1>

        {prediction.description && (
          <p className="mdet__lede">{prediction.description}</p>
        )}

        <div className="mdet__body">
          <div className="mdet__main">
            <OddsChart
              history={history}
              yesPrice={yesPrice}
              noPrice={noPrice}
              totalPool={pools.total}
              loading={historyLoading}
            />

            <PriceCards
              yesPrice={yesPrice}
              noPrice={noPrice}
              onPick={handleOpenInApp}
              disabled={archived || settled}
              hint={
                settled
                  ? "Market settled"
                  : archived
                    ? "No new bets"
                    : "Tap to buy"
              }
            />

            <MarketStatsRow
              totalPool={pools.total}
              bettors={bettors}
              deadline={prediction.deadline}
              decimals={decimals}
              archived={archived}
            />
          </div>

          <div className="mdet__rail">
            {archived ? (
              <section className="mdet-panel mdet-notice">
                <h2 className="mdet-notice__title">Archived market</h2>
                <p className="mdet-notice__body">
                  Kept for reference. It takes no new bets, because this network
                  has no live contract to stake into.
                </p>
              </section>
            ) : settled || !isDesktop ? (
              // Phones keep the route into the swipe deck, where staking
              // lives, and a settled market routes to its results either way.
              <button type="button" className="mdet-cta" onClick={handleOpenInApp}>
                {prediction.resolved ? "View results" : "Place your bet"}
              </button>
            ) : (
              <BetPanel
                predictionId={prediction.id}
                question={prediction.question}
                creator={prediction.creator}
                yesPool={pools.yes}
                noPool={pools.no}
                onPlaced={reload}
              />
            )}

            {/* One exit row per side held, straight from positions() on
                chain. Renders nothing when the connected wallet holds
                nothing here. */}
            {!archived && !settled && (
              <ExitPanel
                predictionId={prediction.id}
                question={prediction.question}
                onExited={reload}
              />
            )}

            <section className="mdet-panel">
              <h2 className="mdet-panel__title">How this settles</h2>
              <dl className="mdet-rules">
                <div>
                  <dt>One pot, no counterparty</dt>
                  <dd>
                    Everyone backing a side puts money in together. At the
                    deadline the winning side splits what the losing side
                    staked, and your own stake comes back whole on top of your
                    share.
                  </dd>
                </div>
                <div>
                  <dt>Betting early counts for more</dt>
                  <dd>
                    Your stake carries a weight fixed the moment it lands, and
                    that weight only ever changes how the losing pool is
                    divided. The earlier it lands, the larger it is.
                  </dd>
                </div>
                <div>
                  <dt>Fees come off the losing side</dt>
                  <dd>
                    The platform cut and the market creator&apos;s cut are taken
                    from the losing pool only, so a winning stake is never
                    shaved. The live rates are read from the contract and shown
                    on the betting screen.
                  </dd>
                </div>
                <div>
                  <dt>Settled in {sym}</dt>
                  <dd>
                    Markets on {chain.label} take and pay {sym}. Each network
                    runs its own contract and its own pools, and nothing is
                    shared between them.
                  </dd>
                </div>
                <div>
                  <dt>You can leave early</dt>
                  <dd>
                    A stake can be pulled out before the deadline, minus a fee
                    the contract sets. In the final quarter of a market&apos;s
                    life an exit that would empty a side&apos;s pool is
                    refused, and the exit control says so before anything is
                    signed.
                  </dd>
                </div>
              </dl>
            </section>

            <p className="mdet__id">
              Market {prediction.id}
              {liveContract && (
                <>
                  {" · "}
                  <a
                    className="mdet__contract"
                    href={`${liveContract.explorer}/address/${liveContract.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    contract on {chain.label}
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

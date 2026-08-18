"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { PNLTable } from "../../components/Portfolio/WinLossPNL/PNLTable";
import type { PredictionWithStakes } from "../../components/Portfolio/WinLossPNL/PNLTable";
import { useActiveChain, setActiveChain } from "@/lib/chains/activeChain";
import { isChainKey } from "@/lib/chains/requestChain";
import {
  STAKES_CONCURRENCY,
  coverageNotice,
  emptyStateMessage,
  findUserStake,
  mapWithLimit,
  readStakes,
  rowFor,
  selectMarkets,
  stakesUrl,
  type ApiPrediction,
  type PnlRow,
  type PnlSummary,
} from "../archivedPnl";

/**
 * The same screen as /pnl, for a wallet named in the path.
 *
 * This is the page a shared P&L card lands on, and it was a line for line copy
 * of /pnl carrying three bugs that /pnl had already had fixed. It read
 * `stakesData.stakes` where the route answers `{ success, data: { stakes } }`,
 * so the guard never passed. It matched on `s.user` where the entry is keyed
 * `userId`, which would have thrown on the first entry if the guard ever had
 * passed. And it read `ethStake` and `swipeStake` off that entry, two names no
 * route has ever returned. Every one of those failures rendered as "No
 * predictions found for this user", so the page looked like it worked and told
 * every visitor the wallet had never bet.
 *
 * Both screens now share ../archivedPnl, which is the only real fix for a bug
 * whose cause was two copies of the same code.
 */

const EMPTY_SUMMARY: PnlSummary = { rows: [], notCovered: 0, unreadable: 0 };

function PNLAddressContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const address = params.address as string;
  const { setFrameReady, isFrameReady } = useMiniKit();
  const { chainKey } = useActiveChain();

  const [summary, setSummary] = useState<PnlSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  /**
   * A shared link says which chain it is about, and the page follows it.
   *
   * Both deployments number their markets from 1, so a card shared from
   * Robinhood opening against Base reads a different set of markets under the
   * same ids and shows their pools as this wallet's money.
   */
  useEffect(() => {
    const requested = searchParams.get('chain');
    if (requested && isChainKey(requested)) {
      setActiveChain(requested);
    }
  }, [searchParams]);

  // Fetch user predictions
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const userAddress = address.toLowerCase();

    const fetchUserPredictions = async () => {
      setLoading(true);
      setError(null);

      try {
        // The listing is per chain. Without ?chain= the endpoint answers with
        // Base's markets whatever chain the link was shared from.
        const response = await fetch(`/api/predictions?chain=${encodeURIComponent(chainKey)}`);
        const predictionsData = await response.json();

        if (!predictionsData.success || !predictionsData.data) {
          throw new Error(predictionsData.error || 'Failed to fetch predictions');
        }

        /**
         * Only the markets worth a request.
         *
         * This loop used to run over every market on the chain, 247 of them on
         * Base, one serial request each, and the stakes route reads the
         * contract once per participant of the market it is asked about. Two
         * filters that cost nothing cut it to the markets that can produce a
         * row: this wallet has to be in the participant list, and the market
         * has to be on V1 or V2.
         */
        const { queryable, liveElsewhere } = selectMarkets(
          predictionsData.data as ApiPrediction[],
          userAddress
        );

        const answers = await mapWithLimit(
          queryable,
          STAKES_CONCURRENCY,
          async (prediction) => {
            try {
              const stakesResponse = await fetch(stakesUrl(prediction.id, chainKey));
              const answer = readStakes(await stakesResponse.json());
              // The route named itself: it cannot price this market, so this
              // is coverage this screen does not have, not an empty position.
              if (answer.archivedOnly) return { row: null, notCovered: true, failed: false };

              const stake = findUserStake(answer.stakes, userAddress);
              return {
                row: stake ? rowFor(prediction, stake) : null,
                notCovered: false,
                failed: false,
              };
            } catch (err) {
              console.error(`Error fetching stakes for prediction ${prediction.id}:`, err);
              return { row: null, notCovered: false, failed: true };
            }
          }
        );

        if (cancelled) return;

        const rows = answers.map((a) => a.row).filter((r): r is PnlRow => r !== null);
        setSummary({
          rows,
          notCovered: liveElsewhere + answers.filter((a) => a.notCovered).length,
          unreadable: answers.filter((a) => a.failed).length,
        });
      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching user predictions:', err);
        setError(err instanceof Error ? err.message : 'Failed to load PNL data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchUserPredictions();
    return () => {
      cancelled = true;
    };
  }, [address, chainKey]);

  const handleGoBack = () => {
    router.push('/?dashboard=user');
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-gradient-to-br from-black via-zinc-900 to-black">
        <div className="w-full max-w-[424px] mx-auto px-4 py-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#d4ff00] border-t-transparent"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !address) {
    return (
      <div className="flex flex-col min-h-screen bg-gradient-to-br from-black via-zinc-900 to-black">
        <div className="w-full max-w-[424px] mx-auto px-4 py-6">
          <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-6 text-center">
            <h2 className="text-xl font-bold text-red-400 mb-2">Error</h2>
            <p className="text-red-300 mb-4">{error || 'No user address provided'}</p>
            <button
              onClick={handleGoBack}
              className="px-4 py-2 bg-[#d4ff00] text-black font-bold rounded-lg hover:bg-[#c4ef00]"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Annotated with PNLTable's own type, so the row shape this page builds and
  // the row shape the table takes cannot drift apart without tsc saying so.
  const rows: PredictionWithStakes[] = summary.rows;
  const notice = coverageNotice(summary);
  const empty = emptyStateMessage(summary);

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-black via-zinc-900 to-black">
      <div className="w-full max-w-[424px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={handleGoBack}
            className="flex items-center gap-2 text-[#d4ff00] hover:text-[#c4ef00] mb-4"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to dashboard
          </button>
          <h1 className="text-2xl font-bold text-white mb-2">P&amp;L overview</h1>
          <p className="text-sm text-gray-400">
            {address.slice(0, 6)}...{address.slice(-4)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Archived ETH and SWIPE bets, on contracts V1 and V2.
          </p>
        </div>

        {/* PNL Table */}
        {rows.length > 0 ? (
          <>
            {notice && (
              <p className="text-xs text-gray-400 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 mb-3">
                {notice}
              </p>
            )}
            <PNLTable allUserPredictions={rows} />
          </>
        ) : (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-gray-400 mb-4">{empty}</p>
            <button
              onClick={handleGoBack}
              className="px-6 py-3 bg-[#d4ff00] text-black font-bold rounded-lg hover:bg-[#c4ef00]"
            >
              Open the dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PNLAddressPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-screen bg-gradient-to-br from-black via-zinc-900 to-black">
        <div className="w-full max-w-[424px] mx-auto px-4 py-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#d4ff00] border-t-transparent"></div>
          </div>
        </div>
      </div>
    }>
      <PNLAddressContent />
    </Suspense>
  );
}

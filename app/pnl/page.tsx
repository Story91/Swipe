"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { PNLTable } from "../components/Portfolio/WinLossPNL/PNLTable";
import type { PredictionWithStakes } from "../components/Portfolio/WinLossPNL/PNLTable";
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
} from "./archivedPnl";

/**
 * P&L for the archived ETH and SWIPE positions on Base.
 *
 * Worth being blunt about what this screen covers, because the name suggests
 * more than it shows. The stakes route it reads answers for the V1 and V2
 * contracts and nothing else, so the collateral positions that every current
 * bet is made in (USDC on Base, USDG on Robinhood) are not in this total at
 * all. PNLTable only has an ETH and a SWIPE tab to put them in. The page says
 * that on screen now rather than reporting an empty wallet.
 *
 * The parsing lives in ./archivedPnl, shared with /pnl/[address], because the
 * two screens having their own copy of it is how one of them stayed broken for
 * as long as it did.
 */

const EMPTY_SUMMARY: PnlSummary = { rows: [], notCovered: 0, unreadable: 0 };

function PNLPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { address: connectedAddress } = useAccount();
  const { setFrameReady, isFrameReady } = useMiniKit();
  const { chainKey } = useActiveChain();
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [summary, setSummary] = useState<PnlSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  /**
   * A link that names a chain wins over whatever the switcher happens to hold.
   *
   * Both deployments number their markets from 1, so without this a shared P&L
   * link opens against the default chain and reads a different set of markets
   * under the same ids.
   */
  useEffect(() => {
    const requested = searchParams.get('chain');
    if (requested && isChainKey(requested)) {
      setActiveChain(requested);
    }
  }, [searchParams]);

  // Get user address from query param or use connected address
  useEffect(() => {
    const addressParam = searchParams.get('user');
    const address = addressParam || connectedAddress;

    if (!address) {
      setError('No user address provided');
      setLoading(false);
      return;
    }

    setUserAddress(address.toLowerCase());
  }, [searchParams, connectedAddress]);

  // Fetch user predictions
  useEffect(() => {
    if (!userAddress) return;
    let cancelled = false;

    const fetchUserPredictions = async () => {
      setLoading(true);
      setError(null);

      try {
        // The listing is per chain. Without ?chain= the endpoint answers with
        // Base's markets whatever the switcher says.
        const response = await fetch(`/api/predictions?chain=${encodeURIComponent(chainKey)}`);
        const predictionsData = await response.json();

        if (!predictionsData.success || !predictionsData.data) {
          throw new Error(predictionsData.error || 'Failed to fetch predictions');
        }

        /**
         * Only the markets worth a request.
         *
         * The loop below used to ask the stakes route about every market on the
         * chain, and that route reads the contract once per participant of
         * each. Base carries 247 markets, so one page load was 247 serial
         * requests and thousands of contract reads. selectMarkets drops the
         * markets this wallet is not in (the participant list is already in
         * this response) and the markets on the live contract, which the stakes
         * route refuses by design.
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
              // The route said it cannot price this market. Not a missing
              // position, a market on a contract it does not read.
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
  }, [userAddress, chainKey]);

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

  if (error || !userAddress) {
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
            {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
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

export default function PNLPage() {
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
      <PNLPageContent />
    </Suspense>
  );
}

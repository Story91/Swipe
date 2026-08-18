"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { PNLTable } from "../components/Portfolio/WinLossPNL/PNLTable";
import type { PredictionWithStakes } from "../components/Portfolio/WinLossPNL/PNLTable";
import { estimatePosition } from "@/lib/positionMath";

/**
 * P&L for the archived ETH and SWIPE positions on Base.
 *
 * Worth being blunt about what this screen covers, because the name suggests
 * more than it shows. Both routes below are pinned to Base and to the V1 and V2
 * contracts, so the collateral positions that every current bet is made in
 * (USDC on Base, USDG on Robinhood) are not in this total at all. PNLTable only
 * has an ETH and a SWIPE tab to put them in.
 */

/** The fields this page reads off /api/predictions. */
interface ApiPrediction {
  id: string;
  question: string;
  deadline: number;
  resolved?: boolean;
  outcome?: boolean;
  cancelled?: boolean;
  participants?: string[];
  yesTotalAmount?: number;
  noTotalAmount?: number;
  swipeYesTotalAmount?: number;
  swipeNoTotalAmount?: number;
}

/**
 * One entry from /api/predictions/[id]/stakes.
 *
 * Read off the route, not guessed. It keys the address as `userId`, puts both
 * token legs flat on the same object in wei, and reports no payout of any kind.
 */
interface RouteStake {
  userId: string;
  yesAmount: number;
  noAmount: number;
  swipeYesAmount: number;
  swipeNoAmount: number;
  claimed: boolean;
}

type PnlLeg = NonNullable<PredictionWithStakes["userStakes"]>["ETH"];

/**
 * PredictionMarket_V2's platform cut, in basis points.
 *
 * These are V1 and V2 markets and nothing else, so the live 300 plus 50 would
 * be the wrong rates here. The archived contract takes 100 bps from the losing
 * pool, pays no creator cut and has no time weighting, which is why the
 * weighted arguments below are just the raw stake.
 */
const ARCHIVED_PLATFORM_FEE_BPS = 100;

/**
 * What one token leg is worth, from the pools the market carries.
 *
 * The page used to read `potentialPayout` and `isWinner` off the stake object.
 * No route has ever returned either, so both were undefined and both fell to
 * their `|| 0` and `|| false`. They are worked out here instead, through
 * estimatePosition, which is the function the portfolio and the swipe card
 * settle with, so this page cannot quote a different payout from the rest of
 * the app for the same position.
 */
function legFor(
  prediction: ApiPrediction,
  token: "ETH" | "SWIPE",
  yesAmount: number,
  noAmount: number
): PnlLeg {
  const staked = yesAmount + noAmount;
  if (staked <= 0) return undefined;

  // Same tie-break as legSides in lib/userStake, so one position is never on
  // YES here and on NO in the portfolio.
  const backedYes = yesAmount > noAmount;
  const backing = backedYes ? yesAmount : noAmount;

  const yesPool =
    (token === "ETH" ? prediction.yesTotalAmount : prediction.swipeYesTotalAmount) ?? 0;
  const noPool =
    (token === "ETH" ? prediction.noTotalAmount : prediction.swipeNoTotalAmount) ?? 0;

  const myPool = backedYes ? yesPool : noPool;
  const losingPool = backedYes ? noPool : yesPool;

  const ifMySideWins = () =>
    estimatePosition({
      mine: backing,
      myWeighted: backing,
      myWeightedPool: myPool,
      losingPool,
      platformFeeBps: ARCHIVED_PLATFORM_FEE_BPS,
      creatorFeeBps: 0,
    }).total;

  let potentialPayout = 0;
  let potentialProfit = 0;
  let isWinner = false;

  if (prediction.cancelled) {
    // A cancelled market hands everyone their own stake back, both sides of it.
    potentialPayout = staked;
  } else if (prediction.resolved) {
    isWinner = prediction.outcome === backedYes;
    if (isWinner) {
      potentialPayout = ifMySideWins();
      potentialProfit = potentialPayout - staked;
    } else {
      potentialProfit = -staked;
    }
  } else if (prediction.deadline > Date.now() / 1000) {
    // Still running, so this is what the pools would pay if this side wins,
    // not a result. Nothing is owed yet.
    potentialPayout = ifMySideWins();
    potentialProfit = potentialPayout - staked;
  }
  // Past its deadline and unresolved is left at zero on purpose. These markets
  // cannot be resolved any more, the owner key is gone, but calling that a
  // realised loss would be this page inventing a settlement.

  return { yesAmount, noAmount, potentialPayout, potentialProfit, isWinner };
}

function PNLPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { address: connectedAddress } = useAccount();
  const { setFrameReady, isFrameReady } = useMiniKit();
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [allUserPredictions, setAllUserPredictions] = useState<PredictionWithStakes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

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
    const fetchUserPredictions = async () => {
      if (!userAddress) return;

      setLoading(true);
      setError(null);

      try {
        // Fetch all predictions and filter by user stakes
        const response = await fetch('/api/predictions');
        const predictionsData = await response.json();

        if (!predictionsData.success || !predictionsData.data) {
          throw new Error(predictionsData.error || 'Failed to fetch predictions');
        }

        /**
         * Only the markets this user is listed in.
         *
         * The loop below used to ask the stakes route about every market on the
         * chain, and that route reads the contract once per participant of
         * each. Several hundred markets meant thousands of RPC calls for a page
         * that needs a handful of them. The participant list is already in this
         * response, and the route itself only ever answers about participants,
         * so nothing is dropped by asking first.
         */
        const allPredictions = predictionsData.data as ApiPrediction[];
        const mine = allPredictions.filter((p) =>
          (p.participants ?? []).some((a) => a.toLowerCase() === userAddress)
        );

        const userPredictionsWithStakes: PredictionWithStakes[] = [];

        for (const prediction of mine) {
          try {
            // No ?userAddress= any more. The route never read it: it answers
            // with every participant's position and the filtering is done here.
            const stakesResponse = await fetch(
              `/api/predictions/${prediction.id}/stakes`
            );
            const stakesData = await stakesResponse.json();

            /**
             * The stakes sit under `data`, one level down.
             *
             * `stakesData.stakes` was undefined on every market, so the guard
             * never passed, nothing was ever pushed, and the page told every
             * user they had no positions at all. The route answers
             * `{ success, data: { predictionId, stakes, totalStakes } }`.
             */
            const stakes: RouteStake[] = stakesData?.data?.stakes ?? [];
            if (!stakesData?.success || stakes.length === 0) continue;

            // Keyed `userId`, not `user`. Reading `s.user.toLowerCase()` would
            // have thrown on the first entry even once the depth was right.
            const userStake = stakes.find(
              (s) => s.userId?.toLowerCase() === userAddress
            );
            if (!userStake) continue;

            // Two flat legs in wei, not an `ethStake` and a `swipeStake`
            // object. A leg the user is not in comes back undefined and is
            // spread away, so a SWIPE-only position does not gain an empty ETH
            // row that PNLTable would count as a bet.
            const eth = legFor(
              prediction,
              'ETH',
              Number(userStake.yesAmount) || 0,
              Number(userStake.noAmount) || 0
            );
            const swipe = legFor(
              prediction,
              'SWIPE',
              Number(userStake.swipeYesAmount) || 0,
              Number(userStake.swipeNoAmount) || 0
            );
            if (!eth && !swipe) continue;

            userPredictionsWithStakes.push({
              id: prediction.id,
              question: prediction.question,
              resolved: prediction.resolved || false,
              outcome: prediction.outcome,
              cancelled: prediction.cancelled || false,
              status: prediction.resolved
                ? 'resolved'
                : prediction.cancelled
                ? 'cancelled'
                : prediction.deadline && prediction.deadline <= Date.now() / 1000
                ? 'expired'
                : 'active',
              userStakes: {
                ...(eth && { ETH: eth }),
                ...(swipe && { SWIPE: swipe }),
              },
            });
          } catch (error) {
            console.error(`Error fetching stakes for prediction ${prediction.id}:`, error);
          }
        }

        setAllUserPredictions(userPredictionsWithStakes);
      } catch (err) {
        console.error('Error fetching user predictions:', err);
        setError(err instanceof Error ? err.message : 'Failed to load PNL data');
      } finally {
        setLoading(false);
      }
    };

    if (userAddress) {
      fetchUserPredictions();
    }
  }, [userAddress]);

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
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-white mb-2">P&L Overview</h1>
          <p className="text-sm text-gray-400">
            {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
          </p>
        </div>

        {/* PNL Table */}
        {allUserPredictions.length > 0 ? (
          <PNLTable allUserPredictions={allUserPredictions} />
        ) : (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-gray-400">No predictions found for this user.</p>
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

"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { PNLTable } from "../components/Portfolio/WinLossPNL/PNLTable";
import type { PredictionWithStakes } from "../components/Portfolio/WinLossPNL/PNLTable";

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

        if (!predictionsData.success || !predictionsData.predictions) {
          throw new Error('Failed to fetch predictions');
        }

        const allPredictions = predictionsData.predictions;
        const userPredictionsWithStakes: PredictionWithStakes[] = [];

        for (const prediction of allPredictions) {
          try {
            // Fetch user stakes for this prediction
            const stakesResponse = await fetch(
              `/api/predictions/${prediction.id}/stakes?userAddress=${userAddress}`
            );
            const stakesData = await stakesResponse.json();

            if (stakesData.success && stakesData.stakes) {
              const userStake = stakesData.stakes.find(
                (s: any) => s.user.toLowerCase() === userAddress.toLowerCase()
              );

              if (userStake) {
                const ethStake = userStake.ethStake;
                const swipeStake = userStake.swipeStake;

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
                    ...(ethStake && {
                      ETH: {
                        yesAmount: ethStake.yesAmount || 0,
                        noAmount: ethStake.noAmount || 0,
                        potentialProfit: ethStake.potentialProfit || 0,
                        potentialPayout: ethStake.potentialPayout || 0,
                        isWinner: ethStake.isWinner || false,
                      },
                    }),
                    ...(swipeStake && {
                      SWIPE: {
                        yesAmount: swipeStake.yesAmount || 0,
                        noAmount: swipeStake.noAmount || 0,
                        potentialProfit: swipeStake.potentialProfit || 0,
                        potentialPayout: swipeStake.potentialPayout || 0,
                        isWinner: swipeStake.isWinner || false,
                      },
                    }),
                  },
                });
              }
            }
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

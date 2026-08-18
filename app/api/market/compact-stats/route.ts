import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../../lib/redis';
import { chainFromRequest } from '@/lib/chains/requestChain';
import { getChainConfig } from '@/lib/chains';
import { marketCensus } from '@/app/components/Panels/marketCensus';

// GET /api/market/compact-stats - Get all compact stats data in one call (cached)
export async function GET(request: NextRequest) {
  try {
    // Absent ?chain= means Base, the identity namespace.
    const requested = chainFromRequest(request);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }
    const chain = requested.chain;

    // Try to get from cache first
    let compactStats = await redisHelpers.getCompactStats(chain);

    // If no cache or cache is expired, generate new data
    if (!compactStats) {
      console.log(`🔄 No compact stats cache found for ${chain}, generating...`);
      await redisHelpers.updateCompactStats(chain);
      compactStats = await redisHelpers.getCompactStats(chain);
    }

    if (!compactStats) {
      return NextResponse.json({
        success: false,
        error: 'Compact stats not available'
      }, { status: 404 });
    }

    // Use cached data directly from Redis (no blockchain calls)
    // The cache is already updated with real data from Redis
    const updatedStats = compactStats;

    /**
     * The honest half, computed here rather than read from the cache.
     *
     * redisHelpers.updateCompactStats holds totalPredictions, activePredictions,
     * totalParticipants, totalVolumeETH and totalVolumeSWIPE, and not one of
     * those five can be printed as a live figure:
     *
     *  - totalPredictions is every record in the namespace, so the 245 archived
     *    V1 and V2 markets and every unaccepted proposal are counted alongside
     *    the markets the live contract holds.
     *  - the two volumes are the archived ETH and SWIPE pools, in wei. The
     *    collateral pools are not in the cache at all, so the only figure the
     *    strip could show was one that stopped moving when those contracts were
     *    archived and named a token the app does not settle in.
     *  - totalParticipants unions `participants` alone, which the archived V2
     *    contract writes. Collateral bettors land in `usdcParticipants` and were
     *    invisible to it.
     *
     * getAllPredictions is served from a per-process snapshot and is the same
     * read /api/activity already makes on this path, so this is not a new scan
     * of Redis per request.
     */
    const predictions = await redisHelpers.getAllPredictions(chain);
    const census = marketCensus(predictions, Math.floor(Date.now() / 1000));
    const { stable } = getChainConfig(chain);

    // Remove lastUpdated from response
    const { lastUpdated, ...responseData } = updatedStats;

    return NextResponse.json({
      success: true,
      data: {
        ...responseData,
        /**
         * Kept beside the cached block rather than replacing it. Two consumers
         * read the archived legs off the old fields: liveMarketStats.ts pulls
         * totalVolumeETH and totalVolumeSWIPE for the "old contracts" card, and
         * removing them would blank that card instead of fixing it.
         *
         * `pooledRaw` is raw six decimal collateral. Hand it to toDisplayUnits
         * with COLLATERAL_LEG; never add it to the wei figures above it.
         */
        census: {
          ...census,
          symbol: stable.symbol,
          decimals: stable.decimals,
        },
      },
      chain,
      timestamp: new Date().toISOString(),
      cached: true
    });

  } catch (error) {
    console.error('❌ Failed to get compact stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch compact statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

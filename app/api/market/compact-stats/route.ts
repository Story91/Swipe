import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../../lib/redis';
import { chainFromRequest } from '@/lib/chains/requestChain';

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

    // Remove lastUpdated from response
    const { lastUpdated, ...responseData } = updatedStats;

    return NextResponse.json({
      success: true,
      data: responseData,
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

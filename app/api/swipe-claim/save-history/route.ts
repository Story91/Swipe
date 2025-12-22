import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_KEYS } from '../../../../lib/redis';

/**
 * POST /api/swipe-claim/save-history
 * Save user's claim history to Redis (called after successful claim)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, betCount, swipeAmount, tier, transactionHash } = body;

    if (!address || !betCount || !swipeAmount || !tier) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields',
        },
        { status: 400 }
      );
    }

    const normalizedAddress = address.toLowerCase();
    const cacheKey = REDIS_KEYS.SWIPE_CLAIM_HISTORY(normalizedAddress);

    const claimHistoryData = {
      hasClaimed: true,
      betCount: Number(betCount),
      swipeAmount: Number(swipeAmount),
      swipeAmountFormatted: (Number(swipeAmount) / 1e18).toFixed(0),
      tier,
      transactionHash: transactionHash || null,
      timestamp: new Date().toISOString()
    };

    // Save to Redis (permanent - no expiration)
    await redis.set(cacheKey, JSON.stringify(claimHistoryData));
    console.log(`💾 Saved claim history to Redis for ${normalizedAddress}`);

    return NextResponse.json({
      success: true,
      message: 'Claim history saved',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to save claim history:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save claim history',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}


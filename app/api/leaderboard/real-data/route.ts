import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../../lib/redis';
import { chainFromRequest } from '@/lib/chains/requestChain';

export async function GET(request: NextRequest) {
  try {
    // Absent ?chain= means Base, where the collected data already sits.
    const requested = chainFromRequest(request);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }

    console.log(`🔍 Getting real leaderboard data from Redis (${requested.chain})...`);

    const realData = await redisHelpers.getRealLeaderboardData(requested.chain);

    if (!realData) {
      return NextResponse.json({
        success: false,
        error: 'No real leaderboard data found. Run "Collect Real Data" first.'
      }, { status: 404 });
    }
    
    console.log('✅ Real leaderboard data retrieved from Redis');
    
    return NextResponse.json({
      success: true,
      data: realData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting real leaderboard data:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../../lib/redis';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Getting real leaderboard data from Redis...');
    
    const realData = await redisHelpers.getRealLeaderboardData();
    
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

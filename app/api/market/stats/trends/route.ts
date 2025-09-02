import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../../../lib/redis';

// GET /api/market/stats/trends - Get market trends over time
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7d'; // 7d, 30d, 90d
    
    const allPredictions = await redisHelpers.getAllPredictions();
    const now = Math.floor(Date.now() / 1000);
    
    let daysBack: number;
    switch (period) {
      case '30d':
        daysBack = 30;
        break;
      case '90d':
        daysBack = 90;
        break;
      default:
        daysBack = 7;
    }
    
    const cutoffTime = now - (daysBack * 24 * 60 * 60);
    const periodPredictions = allPredictions.filter(p => p.createdAt > cutoffTime);
    
    // Group predictions by day
    const dailyStats: Record<string, {
      date: string;
      predictions: number;
      totalStakes: number;
      participants: number;
      categories: Record<string, number>;
    }> = {};
    
    for (const prediction of periodPredictions) {
      const date = new Date(prediction.createdAt * 1000).toISOString().split('T')[0];
      
      if (!dailyStats[date]) {
        dailyStats[date] = {
          date,
          predictions: 0,
          totalStakes: 0,
          participants: 0,
          categories: {}
        };
      }
      
      dailyStats[date].predictions++;
      dailyStats[date].totalStakes += prediction.totalStakes;
      dailyStats[date].participants += prediction.participants.length;
      
      // Count categories
      dailyStats[date].categories[prediction.category] = 
        (dailyStats[date].categories[prediction.category] || 0) + 1;
    }
    
    // Convert to array and sort by date
    const trends = Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date));
    
    // Calculate growth rates
    const growthRates = {
      predictions: trends.length > 1 
        ? ((trends[trends.length - 1].predictions - trends[0].predictions) / trends[0].predictions) * 100 
        : 0,
      stakes: trends.length > 1 
        ? ((trends[trends.length - 1].totalStakes - trends[0].totalStakes) / trends[0].totalStakes) * 100 
        : 0,
      participants: trends.length > 1 
        ? ((trends[trends.length - 1].participants - trends[0].participants) / trends[0].participants) * 100 
        : 0
    };
    
    return NextResponse.json({
      success: true,
      data: {
        period,
        trends,
        growthRates,
        summary: {
          totalDays: trends.length,
          averagePredictionsPerDay: trends.length > 0 
            ? trends.reduce((sum, day) => sum + day.predictions, 0) / trends.length 
            : 0,
          averageStakesPerDay: trends.length > 0 
            ? trends.reduce((sum, day) => sum + day.totalStakes, 0) / trends.length 
            : 0,
          totalPeriodStakes: trends.reduce((sum, day) => sum + day.totalStakes, 0),
          totalPeriodPredictions: trends.reduce((sum, day) => sum + day.predictions, 0)
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to get market trends:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch market trends',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

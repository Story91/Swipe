import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../../lib/redis';
import { RedisMarketStats } from '../../../../lib/types/redis';

// GET /api/market/stats - Get market statistics
export async function GET(request: NextRequest) {
  try {
    // Get current market stats
    let stats = await redisHelpers.getMarketStats();
    
    // If no stats exist, generate them
    if (!stats) {
      await redisHelpers.updateMarketStats();
      stats = await redisHelpers.getMarketStats();
    }
    
    // Get additional real-time data
    const activePredictions = await redisHelpers.getActivePredictions();
    const allPredictions = await redisHelpers.getAllPredictions();
    
    // Calculate additional metrics
    const now = Math.floor(Date.now() / 1000);
    const recentPredictions = allPredictions.filter(p => 
      p.createdAt > now - (7 * 24 * 60 * 60) // Last 7 days
    );
    
    const highStakePredictions = allPredictions.filter(p => 
      p.totalStakes > 10 // Predictions with more than 10 ETH total stakes
    );
    
    const categoryBreakdown = allPredictions.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topCategories = Object.entries(categoryBreakdown)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));
    
    // Enhanced stats object
    const enhancedStats = {
      ...stats,
      recentActivity: {
        predictionsLast7Days: recentPredictions.length,
        totalStakesLast7Days: recentPredictions.reduce((sum, p) => sum + p.totalStakes, 0),
        newParticipantsLast7Days: new Set(recentPredictions.flatMap(p => p.participants)).size
      },
      highStakes: {
        highStakePredictionsCount: highStakePredictions.length,
        totalHighStakes: highStakePredictions.reduce((sum, p) => sum + p.totalStakes, 0),
        averageHighStake: highStakePredictions.length > 0 
          ? highStakePredictions.reduce((sum, p) => sum + p.totalStakes, 0) / highStakePredictions.length 
          : 0
      },
      categories: {
        breakdown: categoryBreakdown,
        topCategories,
        totalCategories: Object.keys(categoryBreakdown).length
      },
      timeBased: {
        predictionsEndingSoon: activePredictions.filter(p => 
          p.deadline - now < (24 * 60 * 60) // Ending within 24 hours
        ).length,
        predictionsEndingToday: activePredictions.filter(p => {
          const endDate = new Date(p.deadline * 1000);
          const today = new Date();
          return endDate.toDateString() === today.toDateString();
        }).length,
        averagePredictionDuration: allPredictions.length > 0 
          ? allPredictions.reduce((sum, p) => sum + (p.deadline - p.createdAt), 0) / allPredictions.length 
          : 0
      },
      performance: {
        resolutionRate: allPredictions.length > 0 
          ? (allPredictions.filter(p => p.resolved).length / allPredictions.length) * 100 
          : 0,
        averageStakeSize: allPredictions.length > 0 
          ? allPredictions.reduce((sum, p) => sum + p.totalStakes, 0) / allPredictions.length 
          : 0,
        mostActiveCategory: topCategories[0]?.category || 'None'
      }
    };
    
    return NextResponse.json({
      success: true,
      data: enhancedStats,
      timestamp: new Date().toISOString(),
      lastUpdated: stats?.lastUpdated ? new Date(stats.lastUpdated * 1000).toISOString() : null
    });
    
  } catch (error) {
    console.error('❌ Failed to get market stats:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch market statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}




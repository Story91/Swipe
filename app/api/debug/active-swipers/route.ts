import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_KEYS } from '../../../../lib/redis';

// GET /api/debug/active-swipers - Check how many active swipers in active predictions
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Checking active swipers...');

    // Get all predictions
    const predictionsSet = await redis.smembers(REDIS_KEYS.PREDICTIONS('base'));
    console.log(`📊 Total predictions in Redis: ${predictionsSet.length}`);

    let activePredictions = 0;
    let totalParticipants = 0;
    const uniqueUsers = new Set<string>();
    const predictionDetails: any[] = [];

    for (const predictionId of predictionsSet) {
      try {
        const predictionData = await redis.get(REDIS_KEYS.PREDICTION(predictionId, 'base'));
        if (!predictionData) continue;

        const prediction = typeof predictionData === 'string' ? JSON.parse(predictionData) : predictionData;
        
        // Check if active (not resolved, not cancelled, deadline not passed)
        const now = Date.now() / 1000;
        const isActive = !prediction.resolved && !prediction.cancelled && prediction.deadline > now;

        if (isActive) {
          activePredictions++;
          
          // Count participants
          const participants = prediction.participants || [];
          totalParticipants += participants.length;
          
          // Add to unique users
          participants.forEach((p: string) => uniqueUsers.add(p.toLowerCase()));

          predictionDetails.push({
            id: predictionId,
            question: prediction.question.substring(0, 60) + '...',
            participants: participants.length,
            deadline: new Date(prediction.deadline * 1000).toISOString(),
            yesPool: prediction.yesTotalAmount / 1e18,
            noPool: prediction.noTotalAmount / 1e18,
            swipeYesPool: (prediction.swipeYesTotalAmount || 0) / 1e18,
            swipeNoPool: (prediction.swipeNoTotalAmount || 0) / 1e18
          });
        }
      } catch (error) {
        console.error(`Failed to process prediction ${predictionId}:`, error);
      }
    }

    // Sort by participants count
    predictionDetails.sort((a, b) => b.participants - a.participants);

    console.log(`✅ Active predictions stats:`);
    console.log(`  📊 Total predictions: ${predictionsSet.length}`);
    console.log(`  🔴 Active predictions: ${activePredictions}`);
    console.log(`  👥 Total participants (with duplicates): ${totalParticipants}`);
    console.log(`  👤 Unique users across all active: ${uniqueUsers.size}`);

    return NextResponse.json({
      success: true,
      data: {
        totalPredictions: predictionsSet.length,
        activePredictions,
        totalParticipants,
        uniqueActiveUsers: uniqueUsers.size,
        averageParticipantsPerPrediction: activePredictions > 0 ? (totalParticipants / activePredictions).toFixed(2) : 0,
        topPredictions: predictionDetails.slice(0, 10), // Top 10 by participants
        allActivePredictions: predictionDetails
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to check active swipers:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check active swipers',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}




















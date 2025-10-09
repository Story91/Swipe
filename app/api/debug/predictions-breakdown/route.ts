import { NextRequest, NextResponse } from 'next/server';
import { redis } from '../../../../lib/redis';

// GET /api/debug/predictions-breakdown - Detailed breakdown of all predictions
export async function GET(request: NextRequest) {
  try {
    const predictionsSet = await redis.smembers('predictions');
    
    let active = 0, resolved = 0, expired = 0, cancelled = 0, needsApproval = 0;
    const now = Date.now() / 1000;
    
    const breakdown = {
      active: [] as any[],
      resolved: [] as any[],
      expired: [] as any[],
      cancelled: [] as any[],
      needsApproval: [] as any[]
    };

    for (const predictionId of predictionsSet) {
      try {
        const predictionData = await redis.get(`prediction:${predictionId}`);
        if (!predictionData) continue;

        const pred = typeof predictionData === 'string' ? JSON.parse(predictionData) : predictionData;
        
        const info = {
          id: predictionId,
          question: pred.question.substring(0, 70) + '...',
          participants: (pred.participants || []).length,
          deadline: new Date(pred.deadline * 1000).toISOString(),
          ethPool: ((pred.yesTotalAmount || 0) + (pred.noTotalAmount || 0)) / 1e18,
          swipePool: ((pred.swipeYesTotalAmount || 0) + (pred.swipeNoTotalAmount || 0)) / 1e18
        };

        if (pred.needsApproval) {
          needsApproval++;
          breakdown.needsApproval.push(info);
        } else if (pred.cancelled) {
          cancelled++;
          breakdown.cancelled.push(info);
        } else if (pred.resolved) {
          resolved++;
          breakdown.resolved.push(info);
        } else if (pred.deadline <= now) {
          expired++;
          breakdown.expired.push(info);
        } else {
          active++;
          breakdown.active.push(info);
        }
      } catch (error) {
        console.error(`Failed to process prediction ${predictionId}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        total: predictionsSet.length,
        counts: {
          active,
          resolved,
          expired,
          cancelled,
          needsApproval
        },
        percentages: {
          active: ((active / predictionsSet.length) * 100).toFixed(1) + '%',
          resolved: ((resolved / predictionsSet.length) * 100).toFixed(1) + '%',
          expired: ((expired / predictionsSet.length) * 100).toFixed(1) + '%',
          cancelled: ((cancelled / predictionsSet.length) * 100).toFixed(1) + '%',
          needsApproval: ((needsApproval / predictionsSet.length) * 100).toFixed(1) + '%'
        },
        breakdown
      }
    });

  } catch (error) {
    console.error('❌ Failed to get predictions breakdown:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get predictions breakdown',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}




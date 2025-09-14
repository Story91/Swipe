import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../lib/redis';
import { RedisPrediction } from '../../../lib/types/redis';

// GET /api/predictions - Get all predictions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const creator = searchParams.get('creator');
    
    let predictions: RedisPrediction[] = [];
    
    if (category) {
      predictions = await redisHelpers.getPredictionsByCategory(category);
    } else if (status === 'active') {
      predictions = await redisHelpers.getActivePredictions();
    } else if (creator) {
      // Get predictions by creator (would need to implement this helper)
      predictions = await redisHelpers.getAllPredictions();
      predictions = predictions.filter(p => p.creator.toLowerCase() === creator.toLowerCase());
    } else {
      predictions = await redisHelpers.getAllPredictions();
    }
    
    return NextResponse.json({
      success: true,
      data: predictions,
      count: predictions.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to get predictions:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch predictions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}




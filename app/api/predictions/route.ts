import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../lib/redis';
import { RedisPrediction } from '../../../lib/types/redis';

// GET /api/predictions - Get all predictions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const creator = searchParams.get('creator');
    
    // If ID is provided, return single prediction
    if (id) {
      const prediction = await redisHelpers.getPrediction(id);
      if (!prediction) {
        return NextResponse.json(
          { success: false, error: 'Prediction not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        data: prediction,
        timestamp: new Date().toISOString()
      });
    }
    
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
    
    // Debug: Log all prediction IDs
    console.log(`📊 API returning ${predictions.length} predictions:`, predictions.map(p => p.id));
    
    // Check for specific predictions 17, 18, 19
    const targetIds = ['pred_17', 'pred_18', 'pred_19', 'pred_v2_17', 'pred_v2_18', 'pred_v2_19'];
    const foundTargets = predictions.filter(p => targetIds.includes(p.id));
    if (foundTargets.length > 0) {
      console.log(`🎯 Found target predictions:`, foundTargets.map(p => ({ id: p.id, question: p.question, resolved: p.resolved })));
    } else {
      console.log(`❌ Target predictions 17, 18, 19 not found in Redis`);
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




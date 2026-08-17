import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../lib/redis';
import { chainFromRequest } from '@/lib/chains/requestChain';
import { RedisPrediction } from '../../../lib/types/redis';

// GET /api/predictions - Get all predictions
export async function GET(request: NextRequest) {
  try {
    // ?chain= says which chain's markets to list. Absent means Base, because
    // Base is the identity namespace and every record written before
    // namespacing lives at an unprefixed key, so an old client keeps working.
    // A chain we do not have is a 400, not a quiet fall back to Base.
    const requested = chainFromRequest(request);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }
    const chain = requested.chain;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const creator = searchParams.get('creator');
    const adminEssential = searchParams.get('admin_essential'); // New parameter for admin optimization
    
    // If ID is provided, return single prediction
    if (id) {
      const prediction = await redisHelpers.getPrediction(id, chain);
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
    
    if (adminEssential === 'true') {
      // Admin essential: only active + expired predictions (fast loading)
      console.log('🚀 Admin essential mode: loading only active + expired predictions');
      const allPredictions = await redisHelpers.getAllPredictions(chain);
      const currentTime = Date.now() / 1000;
      
      predictions = allPredictions.filter(p => {
        // Include active predictions
        const isActive = !p.resolved && !p.cancelled && p.deadline > currentTime;
        // Include expired predictions (need resolution)
        const isExpired = !p.resolved && !p.cancelled && p.deadline <= currentTime;
        
        return isActive || isExpired;
      });
      
      console.log(`✅ Admin essential: ${predictions.length} predictions (active + expired only)`);
    } else if (category) {
      predictions = await redisHelpers.getPredictionsByCategory(category, chain);
    } else if (status === 'active') {
      predictions = await redisHelpers.getActivePredictions(chain);
    } else if (creator) {
      // Get predictions by creator (would need to implement this helper)
      predictions = await redisHelpers.getAllPredictions(chain);
      predictions = predictions.filter(p => p.creator.toLowerCase() === creator.toLowerCase());
    } else {
      // No filter - get ALL predictions (including expired ones for admin)
      predictions = await redisHelpers.getAllPredictions(chain);
    }
    
    // Left-over debugging printed all 244 ids, plus a hunt for three specific
    // predictions, on every single request. Terminal I/O of that size is not
    // free and it drowned real logs.
    console.log(`📊 API returning ${predictions.length} predictions (${chain})`);

    return NextResponse.json({
      success: true,
      data: predictions,
      count: predictions.length,
      chain,
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




import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../../lib/redis';

// POST /api/predictions/resolve - Resolve a Redis-based prediction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { predictionId, outcome, reason } = body;
    
    if (!predictionId) {
      return NextResponse.json(
        { success: false, error: 'Prediction ID is required' },
        { status: 400 }
      );
    }
    
    if (typeof outcome !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Outcome must be true (YES) or false (NO)' },
        { status: 400 }
      );
    }
    
    // Get existing prediction
    const existingPrediction = await redisHelpers.getPrediction(predictionId);
    if (!existingPrediction) {
      return NextResponse.json(
        { success: false, error: 'Prediction not found' },
        { status: 404 }
      );
    }
    
    // Check if prediction is already resolved or cancelled
    if (existingPrediction.resolved) {
      return NextResponse.json(
        { success: false, error: 'Prediction is already resolved' },
        { status: 400 }
      );
    }
    
    if (existingPrediction.cancelled) {
      return NextResponse.json(
        { success: false, error: 'Prediction is cancelled' },
        { status: 400 }
      );
    }
    
    // Check if deadline has passed
    const now = Math.floor(Date.now() / 1000);
    if (now < existingPrediction.deadline) {
      return NextResponse.json(
        { success: false, error: 'Cannot resolve prediction before deadline' },
        { status: 400 }
      );
    }
    
    // Update prediction with resolution
    const updatedPrediction = {
      ...existingPrediction,
      resolved: true,
      outcome: outcome,
      resolvedAt: now,
      resolvedBy: 'admin', // TODO: Get actual admin address
      resolutionReason: reason || 'Admin resolution'
    };
    
    // Save updated prediction
    await redisHelpers.savePrediction(updatedPrediction);
    
    // Update market stats
    await redisHelpers.updateMarketStats();
    
    console.log(`✅ Prediction ${predictionId} resolved as ${outcome ? 'YES' : 'NO'}`);
    
    return NextResponse.json({
      success: true,
      data: updatedPrediction,
      message: `Prediction resolved as ${outcome ? 'YES' : 'NO'}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to resolve prediction:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to resolve prediction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST /api/predictions/resolve/cancel - Cancel a Redis-based prediction
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { predictionId, reason } = body;
    
    if (!predictionId) {
      return NextResponse.json(
        { success: false, error: 'Prediction ID is required' },
        { status: 400 }
      );
    }
    
    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Cancellation reason is required' },
        { status: 400 }
      );
    }
    
    // Get existing prediction
    const existingPrediction = await redisHelpers.getPrediction(predictionId);
    if (!existingPrediction) {
      return NextResponse.json(
        { success: false, error: 'Prediction not found' },
        { status: 404 }
      );
    }
    
    // Check if prediction is already resolved or cancelled
    if (existingPrediction.resolved) {
      return NextResponse.json(
        { success: false, error: 'Cannot cancel resolved prediction' },
        { status: 400 }
      );
    }
    
    if (existingPrediction.cancelled) {
      return NextResponse.json(
        { success: false, error: 'Prediction is already cancelled' },
        { status: 400 }
      );
    }
    
    // Update prediction with cancellation
    const updatedPrediction = {
      ...existingPrediction,
      cancelled: true,
      cancelledAt: Math.floor(Date.now() / 1000),
      cancelledBy: 'admin', // TODO: Get actual admin address
      cancellationReason: reason.trim()
    };
    
    // Save updated prediction
    await redisHelpers.savePrediction(updatedPrediction);
    
    // Update market stats
    await redisHelpers.updateMarketStats();
    
    console.log(`✅ Prediction ${predictionId} cancelled: ${reason}`);
    
    return NextResponse.json({
      success: true,
      data: updatedPrediction,
      message: 'Prediction cancelled successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to cancel prediction:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to cancel prediction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

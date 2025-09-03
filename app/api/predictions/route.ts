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

// POST /api/predictions - Create new prediction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const requiredFields = ['question', 'description', 'category', 'endDate', 'endTime'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Missing required field: ${field}` 
          },
          { status: 400 }
        );
      }
    }
    
    // Create prediction ID (in production, this would come from smart contract)
    const predictionId = `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate deadline from endDate and endTime
    const endDateTime = new Date(`${body.endDate}T${body.endTime}`);
    const deadline = Math.floor(endDateTime.getTime() / 1000);
    
    // Validate deadline is in the future
    const now = Math.floor(Date.now() / 1000);
    if (deadline <= now) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'End date and time must be in the future' 
        },
        { status: 400 }
      );
    }
    
    // Create prediction object
    const prediction: RedisPrediction = {
      id: predictionId,
      question: body.question.trim(),
      description: body.description.trim(),
      category: body.category.trim(),
      imageUrl: body.imageUrl || '',
      includeChart: body.includeChart || false,
      selectedCrypto: body.selectedCrypto || undefined,
      endDate: body.endDate,
      endTime: body.endTime,
      deadline: deadline,
      resolutionDeadline: deadline + (7 * 24 * 60 * 60), // 7 days after deadline for admin to resolve
      yesTotalAmount: 0,
      noTotalAmount: 0,
      resolved: false,
      cancelled: false,
      createdAt: now,
      creator: body.creator || 'anonymous',
      verified: body.verified || false,
      approved: body.approved || false,
      needsApproval: body.needsApproval || false,
      participants: [],
      totalStakes: 0,
      marketStats: {
        yesPercentage: 0,
        noPercentage: 0,
        timeLeft: deadline - now,
        totalPool: 0
      }
    };
    
    // Save to Redis
    await redisHelpers.savePrediction(prediction);
    
    // Update market stats
    await redisHelpers.updateMarketStats();
    
    console.log(`✅ Prediction created: ${predictionId}`);
    
    return NextResponse.json({
      success: true,
      data: prediction,
      message: 'Prediction created successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to create prediction:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create prediction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT /api/predictions - Update prediction
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, updates } = body;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Prediction ID is required' },
        { status: 400 }
      );
    }
    
    // Get existing prediction
    const existingPrediction = await redisHelpers.getPrediction(id);
    if (!existingPrediction) {
      return NextResponse.json(
        { success: false, error: 'Prediction not found' },
        { status: 404 }
      );
    }
    
    // Update fields (only allow certain fields to be updated)
    const allowedUpdates = ['description', 'imageUrl', 'includeChart', 'selectedCrypto'];
    const updatedPrediction = { ...existingPrediction };
    
    for (const field of allowedUpdates) {
      if (updates[field] !== undefined) {
        (updatedPrediction as any)[field] = updates[field];
      }
    }
    
    // Save updated prediction
    await redisHelpers.savePrediction(updatedPrediction);
    
    return NextResponse.json({
      success: true,
      data: updatedPrediction,
      message: 'Prediction updated successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to update prediction:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update prediction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// DELETE /api/predictions - Delete prediction
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Prediction ID is required' },
        { status: 400 }
      );
    }
    
    // Check if prediction exists
    const existingPrediction = await redisHelpers.getPrediction(id);
    if (!existingPrediction) {
      return NextResponse.json(
        { success: false, error: 'Prediction not found' },
        { status: 404 }
      );
    }
    
    // Delete prediction
    await redisHelpers.deletePrediction(id);
    
    // Update market stats
    await redisHelpers.updateMarketStats();
    
    return NextResponse.json({
      success: true,
      message: 'Prediction deleted successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to delete prediction:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete prediction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

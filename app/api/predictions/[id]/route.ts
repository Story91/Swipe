import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '@/lib/redis';

// GET /api/predictions/[id] - Get single prediction by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Prediction ID is required' },
        { status: 400 }
      );
    }

    const prediction = await redisHelpers.getPrediction(id);
    
    if (!prediction) {
      return NextResponse.json(
        { success: false, error: 'Prediction not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      prediction,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to get prediction:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch prediction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}


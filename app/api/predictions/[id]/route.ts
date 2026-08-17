import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '@/lib/redis';
import { chainFromRequest } from '@/lib/chains/requestChain';

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

    // Market 1 exists on both chains and they are different markets, so the id
    // alone does not identify one. Absent ?chain= means Base, which is where
    // every record written before namespacing lives.
    const requested = chainFromRequest(request);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }

    const prediction = await redisHelpers.getPrediction(id, requested.chain);

    if (!prediction) {
      return NextResponse.json(
        { success: false, error: 'Prediction not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      prediction,
      chain: requested.chain,
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


import { NextRequest, NextResponse } from 'next/server';

// POST /api/clear-cache - Clear user cache
export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    console.log(`🗑️ Clearing cache for user: ${userId}`);

    // Return success - the actual cache clearing will be handled by the client
    return NextResponse.json({
      success: true,
      message: 'Cache cleared successfully',
      data: {
        userId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Failed to clear cache:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to clear cache',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}



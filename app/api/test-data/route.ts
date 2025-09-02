import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../lib/redis';

export async function POST(request: NextRequest) {
  try {
    // Create a test prediction
    const testPrediction = {
      id: `test_${Date.now()}`,
      question: "Will Bitcoin reach $100,000 by end of 2024?",
      description: "A test prediction to verify TinderCard is working with real data from Redis.",
      category: "Crypto",
      imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop",
      includeChart: true,
      selectedCrypto: "bitcoin",
      endDate: "2024-12-31",
      endTime: "23:59",
      deadline: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days from now
      yesTotalAmount: 1.5,
      noTotalAmount: 0.8,
      resolved: false,
      cancelled: false,
      createdAt: Math.floor(Date.now() / 1000),
      creator: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      verified: true,
      approved: true,
      needsApproval: false,
      participants: ["0x742d35Cc6634C0532925a3b844Bc454e4438f44e"],
      totalStakes: 2.3,
      marketStats: {
        yesPercentage: 65,
        noPercentage: 35,
        timeLeft: 30 * 24 * 60 * 60,
        totalPool: 2.3
      }
    };

    // Save to Redis
    await redisHelpers.savePrediction(testPrediction);

    // Update market stats
    await redisHelpers.updateMarketStats();

    return NextResponse.json({
      success: true,
      message: 'Test prediction added successfully',
      data: testPrediction
    });

  } catch (error) {
    console.error('❌ Failed to add test data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to add test data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

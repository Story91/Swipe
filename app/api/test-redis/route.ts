import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers } from '../../../lib/redis';
import { RedisPrediction } from '../../../lib/types/redis';

// GET /api/test-redis - Test Redis connectivity and basic operations
export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing Redis connectivity...');
    
    // Test basic Redis operations
    const testKey = 'test:connection';
    const testValue = `test_${Date.now()}`;
    
    // Test SET operation
    await redis.set(testKey, testValue);
    console.log('✅ SET operation successful');
    
    // Test GET operation
    const retrievedValue = await redis.get(testKey);
    console.log('✅ GET operation successful');
    
    // Test DELETE operation
    await redis.del(testKey);
    console.log('✅ DELETE operation successful');
    
    // Test Redis helpers
    const allPredictions = await redisHelpers.getAllPredictions();
    console.log('✅ Redis helpers working, found predictions:', allPredictions.length);

    // Debug: Check all prediction keys in Redis
    const allPredictionKeys = await redis.smembers('predictions');
    console.log('🔍 All prediction keys in Redis:', allPredictionKeys);

    // Check if pred_2 exists
    const pred2Exists = await redis.exists('prediction:pred_2');
    console.log('🔍 Does pred_2 exist in Redis?', pred2Exists ? 'YES' : 'NO');

    // Check all prediction data keys
    const allKeys = await redis.keys('prediction:*');
    console.log('🔍 All prediction data keys:', allKeys);

    // Check each prediction individually
    for (const key of allPredictionKeys) {
      const prediction = await redisHelpers.getPrediction(key);
      if (prediction) {
        console.log(`🔍 Prediction ${key}:`, {
          id: prediction.id,
          question: prediction.question.substring(0, 50),
          resolved: prediction.resolved,
          cancelled: prediction.cancelled,
          creator: prediction.creator,
          isTest: key.startsWith('test_') ||
                  prediction.question.toLowerCase().includes('test') ||
                  prediction.creator === 'anonymous'
        });
      } else {
        console.log(`❌ Prediction ${key} not found or invalid`);
      }
    }
    
    // Test market stats
    const marketStats = await redisHelpers.getMarketStats();
    console.log('✅ Market stats retrieved:', marketStats ? 'Yes' : 'No');
    
    // Test additional Redis operations
    const pingTest = await redis.ping();
    console.log('✅ PING operation successful:', pingTest);
    
    // Test time operation
    const timeTest = await redis.time();
    console.log('✅ TIME operation successful:', timeTest);
    
    return NextResponse.json({
      success: true,
      message: 'Redis connection test successful',
      tests: {
        set: '✅ PASSED',
        get: '✅ PASSED',
        delete: '✅ PASSED',
        ping: '✅ PASSED',
        time: '✅ PASSED',
        helpers: '✅ PASSED',
        marketStats: marketStats ? '✅ PASSED' : '⚠️ No stats yet'
      },
      redisInfo: {
        ping: pingTest,
        time: timeTest,
        predictionsCount: allPredictions.length,
        hasMarketStats: !!marketStats
      },
      predictionsCount: allPredictions.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Redis test failed:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Redis connection test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// POST /api/test-redis - Create test data
export async function POST(request: NextRequest) {
  try {
    console.log('🧪 Creating test prediction data...');
    
    // Create a test prediction
    const testPrediction = {
      id: `test_pred_${Date.now()}`,
      question: 'Will this test prediction work?',
      description: 'This is a test prediction to verify Redis functionality',
      category: 'Test',
      imageUrl: 'https://via.placeholder.com/400x300/4F46E5/FFFFFF?text=Test+Prediction',
      includeChart: false,
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endTime: '23:59',
      deadline: Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000),
      yesTotalAmount: 0,
      noTotalAmount: 0,
      resolved: false,
      cancelled: false,
      createdAt: Math.floor(Date.now() / 1000),
      creator: 'test_user',
      verified: true,
      approved: true,
      needsApproval: false,
      participants: [],
      totalStakes: 0,
      marketStats: {
        yesPercentage: 0,
        noPercentage: 0,
        timeLeft: 24 * 60 * 60,
        totalPool: 0
      }
    };
    
    // Save test prediction
    await redisHelpers.savePrediction(testPrediction);
    console.log('✅ Test prediction created:', testPrediction.id);
    
    // Create test stakes
    const testStakes = [
      {
        userId: 'test_user_1',
        predictionId: testPrediction.id,
        yesAmount: 0.1,
        noAmount: 0,
        claimed: false,
        stakedAt: Math.floor(Date.now() / 1000)
      },
      {
        userId: 'test_user_2',
        predictionId: testPrediction.id,
        yesAmount: 0,
        noAmount: 0.05,
        claimed: false,
        stakedAt: Math.floor(Date.now() / 1000)
      }
    ];
    
    // Save test stakes
    for (const stake of testStakes) {
      await redisHelpers.saveUserStake(stake);
    }
    console.log('✅ Test stakes created:', testStakes.length);
    
    // Update prediction with stakes
    const updatedPrediction: RedisPrediction = { ...testPrediction };
    updatedPrediction.yesTotalAmount = 0.1;
    updatedPrediction.noTotalAmount = 0.05;
    updatedPrediction.totalStakes = 0.15;
    updatedPrediction.participants = ['test_user_1', 'test_user_2'];
    updatedPrediction.marketStats = {
      yesPercentage: 66.67,
      noPercentage: 33.33,
      timeLeft: 24 * 60 * 60,
      totalPool: 0.15
    };
    
    await redisHelpers.savePrediction(updatedPrediction);
    console.log('✅ Test prediction updated with stakes');
    
    // Update market stats
    await redisHelpers.updateMarketStats();
    console.log('✅ Market stats updated');
    
    return NextResponse.json({
      success: true,
      message: 'Test data created successfully',
      data: {
        prediction: updatedPrediction,
        stakes: testStakes,
        predictionId: testPrediction.id
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to create test data:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create test data',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// DELETE /api/test-redis - Clean up test data
export async function DELETE(request: NextRequest) {
  try {
    console.log('🧪 Cleaning up test data...');
    
    // Get all predictions
    const allPredictions = await redisHelpers.getAllPredictions();
    
    // Find test predictions
    const testPredictions = allPredictions.filter(p => 
      p.id.startsWith('test_pred_') || 
      p.creator === 'test_user'
    );
    
    // Delete test predictions
    for (const prediction of testPredictions) {
      await redisHelpers.deletePrediction(prediction.id);
      console.log('✅ Deleted test prediction:', prediction.id);
    }
    
    // Clean up test stakes (this would need a more sophisticated cleanup in production)
    const testStakePatterns = ['user_stakes:test_user_1:*', 'user_stakes:test_user_2:*'];
    
    for (const pattern of testStakePatterns) {
      try {
        const keys = await redis.keys(pattern);
        for (const key of keys) {
          await redis.del(key);
          console.log('✅ Deleted test stake key:', key);
        }
      } catch (error) {
        console.log('⚠️ Could not clean up stake pattern:', pattern);
      }
    }
    
    // Update market stats
    await redisHelpers.updateMarketStats();
    console.log('✅ Market stats updated after cleanup');
    
    return NextResponse.json({
      success: true,
      message: 'Test data cleaned up successfully',
      deleted: {
        predictions: testPredictions.length,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to clean up test data:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to clean up test data',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

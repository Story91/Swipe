import { NextRequest, NextResponse } from 'next/server';
import { redis } from '../../../../lib/redis';

// GET /api/debug/user-stakes?userId=ADDRESS
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      // List all user_stakes keys
      const allKeys = await redis.keys('user_stakes:*');
      
      // Group by user
      const userCounts: { [key: string]: number } = {};
      for (const key of allKeys) {
        const parts = key.split(':');
        if (parts.length >= 2) {
          const user = parts[1];
          userCounts[user] = (userCounts[user] || 0) + 1;
        }
      }
      
      return NextResponse.json({
        success: true,
        totalKeys: allKeys.length,
        sampleKeys: allKeys.slice(0, 20),
        userCounts: Object.entries(userCounts).map(([user, count]) => ({ user, count })).slice(0, 20)
      });
    }
    
    // Get all stakes for specific user
    const userIdLower = userId.toLowerCase();
    const pattern = `user_stakes:${userIdLower}:*`;
    const keys = await redis.keys(pattern);
    
    console.log(`🔍 Debug: Searching for pattern: ${pattern}`);
    console.log(`📊 Debug: Found ${keys.length} keys`);
    
    const stakes: any[] = [];
    for (const key of keys) {
      const data = await redis.get(key);
      stakes.push({
        key,
        data: typeof data === 'string' ? JSON.parse(data) : data
      });
    }
    
    // Also try with original case
    const patternOriginal = `user_stakes:${userId}:*`;
    const keysOriginal = await redis.keys(patternOriginal);
    
    return NextResponse.json({
      success: true,
      userId,
      userIdLower,
      patternUsed: pattern,
      keysFound: keys.length,
      keysFoundOriginalCase: keysOriginal.length,
      stakes
    });
    
  } catch (error) {
    console.error('❌ Debug error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_KEYS } from '@/lib/redis';

/**
 * Save PNL OG image URL to Redis
 * Called after uploading PNL card screenshot to ImgBB
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user, ogImageUrl } = body;

    if (!user || !ogImageUrl) {
      return NextResponse.json(
        { error: 'User address and OG image URL are required' },
        { status: 400 }
      );
    }

    const userAddressLower = user.toLowerCase();
    const cacheKey = REDIS_KEYS.USER_PNL_OG_IMAGE(userAddressLower);
    await redis.set(cacheKey, ogImageUrl);

    console.log(`💾 Saved ogImageUrl to Redis for user: ${userAddressLower}`);

    return NextResponse.json({
      success: true,
      message: 'OG image URL saved to Redis'
    });

  } catch (error) {
    console.error('Error saving PNL OG image URL to Redis:', error);
    return NextResponse.json(
      { error: 'Failed to save OG image URL', details: String(error) },
      { status: 500 }
    );
  }
}

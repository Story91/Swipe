import { NextRequest, NextResponse } from 'next/server';
import { uploadBufferToImgBB } from '@/lib/imgbb';
import { redis, REDIS_KEYS } from '@/lib/redis';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://theswipe.app';

/**
 * Generate PNL OG image and upload to ImgBB
 * Returns permanent URL for sharing on Farcaster/social media
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('user');
    
    if (!userAddress) {
      return NextResponse.json({ error: 'User address required' }, { status: 400 });
    }
    
    console.log(`📸 Generating PNL OG image for user: ${userAddress}`);
    
    // Generate OG image by calling our existing endpoint
    const ogResponse = await fetch(`${BASE_URL}/api/og/pnl?user=${encodeURIComponent(userAddress)}`, {
      headers: {
        'Accept': 'image/png',
      },
      // Don't cache - we want fresh data
      cache: 'no-store',
    });
    
    if (!ogResponse.ok) {
      throw new Error(`Failed to generate OG image: ${ogResponse.status}`);
    }
    
    // Get image as ArrayBuffer
    const imageBuffer = await ogResponse.arrayBuffer();
    
    console.log(`📦 PNL OG image generated, size: ${imageBuffer.byteLength} bytes`);
    
    // Upload to ImgBB with timestamp to ensure unique filename
    const timestamp = Date.now();
    const imgbbResponse = await uploadBufferToImgBB(imageBuffer, `pnl-${userAddress.slice(0, 8)}-${timestamp}.png`);
    const permanentUrl = imgbbResponse.data.url;
    
    console.log(`✅ Uploaded PNL OG image to ImgBB: ${permanentUrl}`);
    
    // Save URL to Redis so layout.tsx can use it for og:image meta tag
    const userAddressLower = userAddress.toLowerCase();
    const cacheKey = REDIS_KEYS.USER_PNL_OG_IMAGE(userAddressLower);
    await redis.set(cacheKey, permanentUrl);
    
    console.log(`💾 Saved ogImageUrl to Redis for user: ${userAddressLower}`);
    
    return NextResponse.json({ 
      success: true, 
      url: permanentUrl,
    });
    
  } catch (error) {
    console.error('Error generating/uploading PNL OG image:', error);
    return NextResponse.json(
      { error: 'Failed to generate PNL OG image', details: String(error) },
      { status: 500 }
    );
  }
}

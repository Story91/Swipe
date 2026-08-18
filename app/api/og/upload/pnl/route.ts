import { NextRequest, NextResponse } from 'next/server';
import { uploadBufferToImgBB } from '@/lib/imgbb';
import { redis, REDIS_KEYS } from '@/lib/redis';
import { chainFromRequest } from '@/lib/chains/requestChain';

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

    // A P&L is one chain's positions, so the card has to be generated for the
    // chain that was asked for. Without this the renderer defaults to Base and
    // a Robinhood user's share showed Base's numbers with Base's currency on
    // them. This is a JSON endpoint, not an image, so an unknown chain is a 400
    // rather than a fallback.
    const requested = chainFromRequest(request);
    if (!requested.ok) {
      return NextResponse.json({ error: requested.error }, { status: 400 });
    }
    const chain = requested.chain;

    console.log(`📸 Generating PNL OG image for user: ${userAddress} (${chain})`);

    // Generate OG image by calling our existing endpoint
    const ogResponse = await fetch(`${BASE_URL}/api/og/pnl?user=${encodeURIComponent(userAddress)}&chain=${chain}`, {
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
    
    // Save URL to Redis so layout.tsx can use it for og:image meta tag.
    //
    // Under the chain this card was rendered for. It used to be one image per
    // address with no chain in it, so a Base card and a Robinhood card for the
    // same wallet overwrote each other and /api/og/pnl redirected to whichever
    // landed last.
    const userAddressLower = userAddress.toLowerCase();
    const cacheKey = REDIS_KEYS.USER_PNL_OG_IMAGE(userAddressLower, chain);
    await redis.set(cacheKey, permanentUrl);

    // And a pointer at the chain, because the share link is /pnl/<address>
    // with nothing else in it. That page's metadata lives in a layout, which
    // Next never hands searchParams, so this is the only thing that can tell it
    // which of the two cards to embed.
    await redis.set(REDIS_KEYS.USER_PNL_OG_CHAIN(userAddressLower), chain);

    console.log(`💾 Saved ogImageUrl to Redis for user: ${userAddressLower} (${chain})`);
    
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

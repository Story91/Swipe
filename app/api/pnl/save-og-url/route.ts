import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_KEYS } from '@/lib/redis';
import { chainFromRequestOrBody } from '@/lib/chains/requestChain';

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

    // The screenshot is of one chain's table, so it is filed under that chain.
    // Query string or body, whichever the caller used. This is JSON rather than
    // an image, so a chain we do not have is a 400 and not a quiet fallback.
    //
    // Saying nothing still means Base, which is what every existing caller
    // says: app/components/Portfolio/WinLossPNL/PNLTable.tsx posts { user,
    // ogImageUrl } and no chain, so a Robinhood screenshot is still filed as a
    // Base card until that component sends one. That call site is another
    // agent's file this round.
    const requested = chainFromRequestOrBody(request, body);
    if (!requested.ok) {
      return NextResponse.json({ error: requested.error }, { status: 400 });
    }
    const chain = requested.chain;

    const userAddressLower = user.toLowerCase();
    const cacheKey = REDIS_KEYS.USER_PNL_OG_IMAGE(userAddressLower, chain);
    await redis.set(cacheKey, ogImageUrl);

    // Same pointer the ImgBB upload path writes, for the same reason: the
    // /pnl/<address> share link carries no chain, and its metadata is generated
    // by a layout that cannot read a query string.
    await redis.set(REDIS_KEYS.USER_PNL_OG_CHAIN(userAddressLower), chain);

    console.log(`💾 Saved ogImageUrl to Redis for user: ${userAddressLower} (${chain})`);

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

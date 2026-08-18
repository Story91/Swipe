import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers } from '@/lib/redis';
import { chainFromRequest, chainFromRequestOrBody } from '@/lib/chains/requestChain';
import {
  predictionLikesKey,
  normaliseLiker,
  isAddressLike,
  type LikeState,
} from '@/lib/predictionLikes';

/**
 * Likes on a proposed market.
 *
 * GET  ?chain=&address=   the count, and whether that address is in it
 * POST { chain, address } toggles the caller's like and returns the new state
 *
 * Liking is only open while a market is waiting to be registered. Once an admin
 * registers it the market has a real signal, which is money in the pool, and a
 * heart next to a live market would compete with it. The count survives
 * registration and stays readable, because "47 people wanted this before it
 * existed" is worth keeping.
 *
 * See lib/predictionLikes.ts for why this is a Set of addresses and why it is
 * deliberately unsigned.
 */

/** Everything both handlers need, or the response that says why not. */
async function resolve(request: NextRequest, id: string, body?: unknown) {
  const requested = body === undefined
    ? chainFromRequest(request)
    : chainFromRequestOrBody(request, body);

  if (!requested.ok) {
    return { error: NextResponse.json({ success: false, error: requested.error }, { status: 400 }) };
  }

  const prediction = await redisHelpers.getPrediction(id, requested.chain);
  if (!prediction) {
    return { error: NextResponse.json({ success: false, error: 'Market not found' }, { status: 404 }) };
  }

  return { chain: requested.chain, prediction };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const resolved = await resolve(request, id);
    if ('error' in resolved) return resolved.error;

    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const key = predictionLikesKey(id, resolved.chain);

    const count = await redis.scard(key);
    const liked = isAddressLike(address)
      ? (await redis.sismember(key, normaliseLiker(address))) === 1
      : false;

    const state: LikeState = { count, liked };
    return NextResponse.json({ success: true, data: state });
  } catch (error) {
    console.error('❌ Failed to read likes:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to read likes' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const resolved = await resolve(request, id, body);
    if ('error' in resolved) return resolved.error;

    const { address } = body ?? {};
    if (!isAddressLike(address)) {
      return NextResponse.json(
        { success: false, error: 'A wallet address is required to like a market' },
        { status: 400 }
      );
    }

    /**
     * Closed once the market is live.
     *
     * needsApproval is what the propose route writes and what an admin clears
     * on registration, so it is the same flag the grid reads to label a card as
     * proposed. Refusing here rather than only hiding the button matters: the
     * button is the polite version and this is the one that holds.
     */
    if (!resolved.prediction.needsApproval) {
      return NextResponse.json(
        { success: false, error: 'This market is already live, so likes are closed on it' },
        { status: 409 }
      );
    }

    const key = predictionLikesKey(id, resolved.chain);
    const liker = normaliseLiker(address);

    // Toggle. sadd and srem both report how many members actually moved, so the
    // new state comes back without a second read and without a race between
    // checking and writing.
    const added = await redis.sadd(key, liker);
    const liked = added === 1;
    if (!liked) await redis.srem(key, liker);

    const count = await redis.scard(key);
    const state: LikeState = { count, liked };
    return NextResponse.json({ success: true, data: state });
  } catch (error) {
    console.error('❌ Failed to toggle like:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record the like' },
      { status: 500 }
    );
  }
}

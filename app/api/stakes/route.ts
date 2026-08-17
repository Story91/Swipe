import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers, REDIS_KEYS } from '../../../lib/redis';
import { chainFromBody, chainFromRequest } from '@/lib/chains/requestChain';
import { RedisUserStake } from '../../../lib/types/redis';
import { stakeLegs, tokenMarket, legSides, type StakeToken } from '@/lib/userStake';

/**
 * Positions, read and marked claimed.
 *
 * The flattening of a stored record into one entry per token used to appear
 * three times in this file, written out by hand each time, and all three listed
 * ETH and SWIPE and stopped there. The collateral leg that V3 and V4 write was
 * in none of them, so a position on the only contracts that take bets came back
 * as no position at all. It is stakeLegs now, once, and a fourth token would
 * arrive here without an edit.
 */

/** Read a stake record from one key and return its legs. */
async function legsAt(key: string): Promise<RedisUserStake[]> {
  try {
    const data = await redis.get(key);
    if (!data) return [];
    const stake = typeof data === 'string' ? JSON.parse(data) : data;
    return stakeLegs(stake) as RedisUserStake[];
  } catch (error) {
    console.error(`Failed to parse stake from key ${key}:`, error);
    return [];
  }
}

// GET /api/stakes - Get stakes for a specific prediction or all user stakes
export async function GET(request: NextRequest) {
  try {
    // Positions are per chain. Absent ?chain= means Base, which is where every
    // stake written before namespacing lives.
    const requested = chainFromRequest(request);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }
    const chain = requested.chain;

    const { searchParams } = new URL(request.url);
    const predictionId = searchParams.get('predictionId');
    const userId = searchParams.get('userId');
    const getAllUserStakes = searchParams.get('getAllUserStakes') === 'true';

    // If getAllUserStakes is true, return all stakes for the user
    if (getAllUserStakes && userId) {
      // Built from REDIS_KEYS so it follows the chain namespace. A literal
      // pattern here would match zero keys the moment a namespace exists, and
      // the route would answer 200 with an empty position list.
      const userStakePattern = REDIS_KEYS.USER_STAKES_PATTERN(userId, chain);
      const stakeKeys = await redis.keys(userStakePattern);

      const perKey = await Promise.all(stakeKeys.map(legsAt));
      const allUserStakes = perKey.flat();

      return NextResponse.json({
        success: true,
        data: allUserStakes,
        count: allUserStakes.length
      });
    }

    if (!predictionId) {
      return NextResponse.json(
        { success: false, error: 'Prediction ID is required' },
        { status: 400 }
      );
    }

    let stakes: RedisUserStake[] = [];

    if (userId) {
      // Get specific user's stake for this prediction
      stakes = await legsAt(REDIS_KEYS.USER_STAKES(userId, predictionId, chain));
    } else {
      // Get all stakes for this prediction
      stakes = await redisHelpers.getUserStakes(predictionId, chain);
    }

    // Get prediction data to calculate canClaim
    const predictionData = await redis.get(REDIS_KEYS.PREDICTION(predictionId, chain));
    let prediction: any = null;
    if (predictionData) {
      prediction = typeof predictionData === 'string' ? JSON.parse(predictionData) : predictionData;
    }

    // Calculate canClaim for each stake
    const stakesWithCanClaim = stakes.map(stake => {
      let canClaim = false;

      if (prediction && !stake.claimed) {
        // Settlement is asked per token. The collateral contract is a different
        // contract from the V2 one and settles on its own schedule, so reading
        // the shared flags for a collateral leg offers a claim on a market that
        // has not resolved there, and hides one on a market that has.
        const token = (stake.tokenType ?? 'ETH') as StakeToken;
        const market = tokenMarket(prediction, token);
        const { choice, staked } = legSides(stake as never);

        if (market.cancelled) {
          // Cancelled refunds everyone who is in it.
          canClaim = staked > 0;
        } else if (market.resolved) {
          canClaim = (choice === 'YES') === market.outcome;
        }
      }

      return {
        ...stake,
        canClaim
      };
    });

    return NextResponse.json({
      success: true,
      data: stakesWithCanClaim,
      count: stakesWithCanClaim.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to get stakes:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch stakes',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}


// PUT /api/stakes - Update stake (e.g., mark as claimed)
// Supports tokenType for partial claims, so one leg can be claimed alone
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, predictionId, updates, tokenType } = body;

    if (!userId || !predictionId) {
      return NextResponse.json(
        { success: false, error: 'User ID and Prediction ID are required' },
        { status: 400 }
      );
    }

    // A claim marks one chain's position claimed. Getting this wrong would mark
    // the other chain's position on the same market number instead, and that
    // one is still unclaimed money.
    const requested = chainFromBody(body);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }
    const chain = requested.chain;

    // Get existing stake
    const stakeKey = REDIS_KEYS.USER_STAKES(userId, predictionId, chain);
    const existingData = await redis.get(stakeKey);

    if (!existingData) {
      return NextResponse.json(
        { success: false, error: 'Stake not found' },
        { status: 404 }
      );
    }

    const existingStake = typeof existingData === 'string' ? JSON.parse(existingData) : existingData;
    const updatedStake = { ...existingStake };
    const claimed = updates?.claimed ?? true;

    // Which legs this record actually has, rather than a hardcoded pair. USDC
    // was missing from the list, so claiming a collateral position wrote
    // nothing and the button stayed live after the money had been collected.
    const present = (['ETH', 'SWIPE', 'USDC'] as StakeToken[]).filter(
      (t) => updatedStake[t] && typeof updatedStake[t] === 'object'
    );

    if (tokenType && present.includes(tokenType)) {
      updatedStake[tokenType] = { ...updatedStake[tokenType], claimed };
    } else if (present.length > 0) {
      // No token named, or one this record does not hold: mark every leg, which
      // is the behaviour callers relied on before partial claims existed.
      for (const t of present) {
        updatedStake[t] = { ...updatedStake[t], claimed };
      }
    } else {
      // The flat V1 shape, which is always ETH and has no legs to pick from.
      if (!tokenType || tokenType === 'ETH') {
        updatedStake.claimed = claimed;
      }
    }

    // Save updated stake
    await redisHelpers.saveUserStake(updatedStake, chain);

    return NextResponse.json({
      success: true,
      data: updatedStake,
      tokenType: tokenType || 'all',
      message: `Stake ${tokenType ? tokenType + ' ' : ''}marked as claimed`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to update stake:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update stake',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_KEYS } from '@/lib/redis';
import { USDCPricePoint, USDCPriceHistory } from '@/lib/types/redis';
import { createChainPublicClient, DEFAULT_CHAIN_KEY } from '@/lib/chains';
import { getMarketContract } from '@/lib/chains/market';
import { parseMarketId } from '@/lib/marketId';

/**
 * The price history behind the odds chart.
 *
 * The pools are read from the contract here, never taken from the request. They
 * used to be whatever the caller put in the body, on an endpoint with no auth,
 * which let anyone draw any odds line they liked on any market. That line is
 * what a trader reads before deciding a side, so a forged one is not cosmetic.
 *
 * The body is still accepted, because the client sends it, and still carries
 * betSide and betAmount as annotations on the point. Those stay unverified and
 * must not be used for anything that decides money. Nothing computes a price
 * from them.
 */

// GET - Retrieve price history for a prediction
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: predictionId } = await params;
    
    // Get price history from Redis
    const historyData = await redis.get(REDIS_KEYS.USDC_PRICE_HISTORY(predictionId));
    
    if (!historyData) {
      // Return empty history if none exists
      return NextResponse.json({
        success: true,
        data: {
          predictionId,
          history: [],
          lastUpdated: 0
        }
      });
    }
    
    const history = typeof historyData === 'string' 
      ? JSON.parse(historyData) 
      : historyData;
    
    return NextResponse.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error fetching price history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch price history' },
      { status: 500 }
    );
  }
}

// POST - Add new price point to history
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: predictionId } = await params;

    // The body is optional now. Only its annotations are read, and a malformed
    // one costs the caller its labels rather than the whole request.
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      body = {};
    }
    const betAmount = typeof body.betAmount === 'number' ? body.betAmount : undefined;
    const betSide = body.betSide === 'yes' || body.betSide === 'no' ? body.betSide : undefined;

    // Only V3 markets have pools this can read. V1 and V2 are archived and take
    // no new stakes, so there is no honest point to append to their history.
    const parsed = parseMarketId(predictionId);
    if (!parsed || parsed.generation !== 'v3') {
      return NextResponse.json(
        { success: false, error: 'Price history is only recorded for V3 markets' },
        { status: 400 }
      );
    }

    const market = getMarketContract(DEFAULT_CHAIN_KEY);
    if (!market) {
      return NextResponse.json(
        { success: false, error: 'No market contract on this chain' },
        { status: 503 }
      );
    }

    // The pools come from the contract. This is the whole point of the route:
    // the caller says which market, and nothing else.
    const client = createChainPublicClient(DEFAULT_CHAIN_KEY);
    const onChain = (await client.readContract({
      address: market.address,
      abi: market.abi,
      functionName: 'getPrediction',
      args: [BigInt(parsed.numericId)],
    })) as readonly [boolean, string, bigint, bigint, bigint, boolean, boolean, boolean, boolean, bigint];

    if (!onChain[0]) {
      return NextResponse.json(
        { success: false, error: 'Market is not registered on chain' },
        { status: 404 }
      );
    }

    const yesPool = Number(onChain[3]);
    const noPool = Number(onChain[4]);

    // Price = pool share, in cents. A market with nothing staked has no implied
    // odds, so it reads 50/50 rather than dividing by zero.
    const totalPool = yesPool + noPool;
    const yesPrice = totalPool > 0 ? Math.round((yesPool / totalPool) * 100) : 50;
    const noPrice = 100 - yesPrice;

    const newPoint: USDCPricePoint = {
      timestamp: Date.now(),
      yesPrice,
      noPrice,
      yesPool,
      noPool,
      totalPool,
      betAmount,
      betSide,
    };

    // Get existing history
    const historyData = await redis.get(REDIS_KEYS.USDC_PRICE_HISTORY(predictionId));
    let history: USDCPricePoint[] = [];
    
    if (historyData) {
      const parsed = typeof historyData === 'string' 
        ? JSON.parse(historyData) 
        : historyData;
      history = parsed.history || [];
    }
    
    // Reading from the chain makes a forged point impossible, but not a
    // repeated one: calling this in a loop would still pack the chart with
    // hundreds of identical readings. If the pools have not moved since the
    // last point, there is nothing new to record.
    const previous = history[history.length - 1];
    if (previous && previous.yesPool === yesPool && previous.noPool === noPool) {
      return NextResponse.json({
        success: true,
        data: { point: previous, totalPoints: history.length, unchanged: true },
      });
    }

    history.push(newPoint);

    // Keep only last 1000 points to prevent unbounded growth
    if (history.length > 1000) {
      history = history.slice(-1000);
    }
    
    // Save updated history
    const updatedHistory: USDCPriceHistory = {
      predictionId,
      history,
      lastUpdated: Date.now()
    };
    
    await redis.set(
      REDIS_KEYS.USDC_PRICE_HISTORY(predictionId),
      JSON.stringify(updatedHistory)
    );
    
    return NextResponse.json({
      success: true,
      data: {
        point: newPoint,
        totalPoints: history.length
      }
    });
  } catch (error) {
    console.error('Error saving price point:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save price point' },
      { status: 500 }
    );
  }
}

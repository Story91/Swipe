import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_KEYS } from '@/lib/redis';
import { USDCPricePoint, USDCPriceHistory } from '@/lib/types/redis';

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
    const body = await request.json();
    
    const { yesPool, noPool, betAmount, betSide, bettor } = body;
    
    if (yesPool === undefined || noPool === undefined) {
      return NextResponse.json(
        { success: false, error: 'yesPool and noPool are required' },
        { status: 400 }
      );
    }
    
    // Calculate prices (in cents, 0-100)
    // Price = pool share (yesPrice = yesPool/totalPool * 100)
    const totalPool = yesPool + noPool;
    const yesPrice = totalPool > 0 ? Math.round((yesPool / totalPool) * 100) : 50;
    const noPrice = 100 - yesPrice;
    
    // Create new price point
    const newPoint: USDCPricePoint = {
      timestamp: Date.now(),
      yesPrice,
      noPrice,
      yesPool,
      noPool,
      totalPool,
      betAmount,
      betSide,
      bettor
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
    
    // Add new point
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

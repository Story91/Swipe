import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS } from '../../../lib/contract';

// GET /api/debug-user-stakes - Debug user stakes on blockchain
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Initialize public client for Base network
    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
    });

    console.log(`🔍 Debugging stakes for user: ${userId}`);

    // Check stakes for recent predictions (including 25 where user is currently)
    const predictionIds = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];
    const userStakes = [];

    for (const predId of predictionIds) {
      try {
        console.log(`🔍 Checking prediction ${predId} for user ${userId}`);
        
        // Get ETH stakes
        const ethStakes = await publicClient.readContract({
          address: CONTRACTS.V2.address as `0x${string}`,
          abi: CONTRACTS.V2.abi,
          functionName: 'userStakes',
          args: [BigInt(predId), userId as `0x${string}`],
        }) as any;

        // Get SWIPE stakes
        const swipeStakes = await publicClient.readContract({
          address: CONTRACTS.V2.address as `0x${string}`,
          abi: CONTRACTS.V2.abi,
          functionName: 'userSwipeStakes',
          args: [BigInt(predId), userId as `0x${string}`],
        }) as any;

        console.log(`📊 Prediction ${predId} - ETH:`, ethStakes);
        console.log(`📊 Prediction ${predId} - SWIPE:`, swipeStakes);

        userStakes.push({
          predictionId: `pred_v2_${predId}`,
          ethStakes: {
            yesAmount: Number(ethStakes.yesAmount || 0),
            noAmount: Number(ethStakes.noAmount || 0),
            claimed: Boolean(ethStakes.claimed || false)
          },
          swipeStakes: {
            yesAmount: Number(swipeStakes.yesAmount || 0),
            noAmount: Number(swipeStakes.noAmount || 0),
            claimed: Boolean(swipeStakes.claimed || false)
          }
        });

      } catch (error) {
        console.error(`❌ Error checking prediction ${predId}:`, error);
        userStakes.push({
          predictionId: `pred_v2_${predId}`,
          error: String(error)
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        userId,
        userStakes,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Failed to debug user stakes:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

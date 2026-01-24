import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// USDC DualPool Contract
const USDC_DUALPOOL_ADDRESS = '0xf5Fa6206c2a7d5473ae7468082c9D260DFF83205';
const USDC_DUALPOOL_ABI = [
  {
    inputs: [{ name: 'predictionId', type: 'uint256' }],
    name: 'getPrediction',
    outputs: [
      { name: 'registered', type: 'bool' },
      { name: 'creator', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'yesPool', type: 'uint256' },
      { name: 'noPool', type: 'uint256' },
      { name: 'resolved', type: 'bool' },
      { name: 'cancelled', type: 'bool' },
      { name: 'outcome', type: 'bool' },
      { name: 'participantCount', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'predictionId', type: 'uint256' },
      { name: 'user', type: 'address' }
    ],
    name: 'getPosition',
    outputs: [
      { name: 'yesAmount', type: 'uint256' },
      { name: 'noAmount', type: 'uint256' },
      { name: 'yesEntryPrice', type: 'uint256' },
      { name: 'noEntryPrice', type: 'uint256' },
      { name: 'claimed', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'predictionId', type: 'uint256' }],
    name: 'getParticipants',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// Create viem client
const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL)
});

// GET /api/debug/usdc-prediction?predictionId=225&user=0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const predictionIdParam = searchParams.get('predictionId');
    const userParam = searchParams.get('user');
    
    if (!predictionIdParam) {
      return NextResponse.json(
        { success: false, error: 'predictionId required' },
        { status: 400 }
      );
    }
    
    const predictionId = parseInt(predictionIdParam, 10);
    if (isNaN(predictionId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid predictionId' },
        { status: 400 }
      );
    }
    
    // Get prediction data
    const predictionData = await client.readContract({
      address: USDC_DUALPOOL_ADDRESS as `0x${string}`,
      abi: USDC_DUALPOOL_ABI,
      functionName: 'getPrediction',
      args: [BigInt(predictionId)]
    });
    
    const [
      registered,
      creator,
      deadline,
      yesPool,
      noPool,
      resolved,
      cancelled,
      outcome,
      participantCount
    ] = predictionData;
    
    // Get participants
    let participants: string[] = [];
    try {
      const participantsData = await client.readContract({
        address: USDC_DUALPOOL_ADDRESS as `0x${string}`,
        abi: USDC_DUALPOOL_ABI,
        functionName: 'getParticipants',
        args: [BigInt(predictionId)]
      });
      participants = (participantsData as any[]).map(p => p.toLowerCase());
    } catch (e) {
      console.error('Failed to get participants:', e);
    }
    
    // Get user position if user address provided
    let userPosition = null;
    if (userParam) {
      try {
        const positionData = await client.readContract({
          address: USDC_DUALPOOL_ADDRESS as `0x${string}`,
          abi: USDC_DUALPOOL_ABI,
          functionName: 'getPosition',
          args: [BigInt(predictionId), userParam as `0x${string}`]
        });
        
        const [yesAmount, noAmount, yesEntryPrice, noEntryPrice, claimed] = positionData as any[];
        
        userPosition = {
          yesAmount: Number(yesAmount),
          noAmount: Number(noAmount),
          yesEntryPrice: Number(yesEntryPrice),
          noEntryPrice: Number(noEntryPrice),
          claimed: Boolean(claimed),
          yesAmountUSD: Number(yesAmount) / 1e6,
          noAmountUSD: Number(noAmount) / 1e6,
          totalStakedUSD: (Number(yesAmount) + Number(noAmount)) / 1e6,
          hasStake: Number(yesAmount) > 0 || Number(noAmount) > 0
        };
        
        // Calculate if user won
        if (resolved && !cancelled) {
          const userWon = outcome ? Number(yesAmount) > 0 : Number(noAmount) > 0;
          userPosition.isWinner = userWon;
          userPosition.outcome = outcome;
        }
      } catch (e) {
        console.error('Failed to get user position:', e);
        userPosition = { error: String(e) };
      }
    }
    
    // Calculate winner side
    let winnerSide = null;
    if (resolved && !cancelled) {
      winnerSide = outcome ? 'YES' : 'NO';
    }
    
    return NextResponse.json({
      success: true,
      predictionId,
      prediction: {
        registered: Boolean(registered),
        creator: String(creator),
        deadline: Number(deadline),
        deadlineDate: new Date(Number(deadline) * 1000).toISOString(),
        yesPool: Number(yesPool),
        noPool: Number(noPool),
        yesPoolUSD: Number(yesPool) / 1e6,
        noPoolUSD: Number(noPool) / 1e6,
        totalPool: Number(yesPool) + Number(noPool),
        totalPoolUSD: (Number(yesPool) + Number(noPool)) / 1e6,
        resolved: Boolean(resolved),
        cancelled: Boolean(cancelled),
        outcome: outcome !== undefined ? Boolean(outcome) : null,
        winnerSide,
        participantCount: Number(participantCount),
        participants: participants,
        participantCountCheck: participants.length
      },
      user: userParam ? {
        address: userParam,
        position: userPosition
      } : null
    });
  } catch (error) {
    console.error('Debug USDC prediction error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch USDC prediction data',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

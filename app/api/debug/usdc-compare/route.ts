import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { redis, REDIS_KEYS } from '@/lib/redis';

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
  }
] as const;

const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL)
});

// GET /api/debug/usdc-compare?predictionId=225&user=0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const predictionIdParam = searchParams.get('predictionId');
    const userParam = searchParams.get('user');
    
    if (!predictionIdParam) {
      return NextResponse.json({ success: false, error: 'predictionId required' }, { status: 400 });
    }
    
    const predictionId = parseInt(predictionIdParam, 10);
    if (isNaN(predictionId)) {
      return NextResponse.json({ success: false, error: 'Invalid predictionId' }, { status: 400 });
    }
    
    const redisId = `pred_v2_${predictionId}`;
    
    // Get from contract
    const contractData = await client.readContract({
      address: USDC_DUALPOOL_ADDRESS as `0x${string}`,
      abi: USDC_DUALPOOL_ABI,
      functionName: 'getPrediction',
      args: [BigInt(predictionId)]
    });
    
    const [registered, creator, deadline, yesPool, noPool, resolved, cancelled, outcome, participantCount] = contractData;
    
    // Get from Redis
    const predData = await redis.get(REDIS_KEYS.PREDICTION(redisId));
    const redisPred = predData ? (typeof predData === 'string' ? JSON.parse(predData) : predData) : null;
    
    // Get user position from contract
    let userPosition = null;
    if (userParam) {
      try {
        const positionData = await client.readContract({
          address: USDC_DUALPOOL_ADDRESS as `0x${string}`,
          abi: USDC_DUALPOOL_ABI,
          functionName: 'getPosition',
          args: [BigInt(predictionId), userParam as `0x${string}`]
        });
        
        const [yesAmount, noAmount, yesEntryPrice, noEntryPrice, claimed] = positionData as unknown as [bigint, bigint, bigint, bigint, boolean];
        userPosition = {
          yesAmount: Number(yesAmount),
          noAmount: Number(noAmount),
          yesAmountUSD: Number(yesAmount) / 1e6,
          noAmountUSD: Number(noAmount) / 1e6,
          totalStakedUSD: (Number(yesAmount) + Number(noAmount)) / 1e6,
          claimed: Boolean(claimed),
          isWinner: resolved && !cancelled ? (outcome ? Number(yesAmount) > 0 : Number(noAmount) > 0) : null
        };
      } catch (e) {
        userPosition = { error: String(e) };
      }
    }
    
    return NextResponse.json({
      success: true,
      predictionId,
      contract: {
        registered: Boolean(registered),
        resolved: Boolean(resolved),
        cancelled: Boolean(cancelled),
        outcome: outcome !== undefined ? Boolean(outcome) : null,
        winnerSide: resolved && !cancelled ? (outcome ? 'YES' : 'NO') : null,
        yesPoolUSD: Number(yesPool) / 1e6,
        noPoolUSD: Number(noPool) / 1e6,
        totalPoolUSD: (Number(yesPool) + Number(noPool)) / 1e6,
        participantCount: Number(participantCount)
      },
      redis: redisPred ? {
        id: redisPred.id,
        question: redisPred.question,
        resolved: redisPred.resolved,
        outcome: redisPred.outcome,
        cancelled: redisPred.cancelled,
        usdcPoolEnabled: redisPred.usdcPoolEnabled,
        usdcResolved: redisPred.usdcResolved,
        usdcCancelled: redisPred.usdcCancelled,
        usdcOutcome: redisPred.usdcOutcome,
        usdcYesTotalAmountUSD: redisPred.usdcYesTotalAmount ? redisPred.usdcYesTotalAmount / 1e6 : 0,
        usdcNoTotalAmountUSD: redisPred.usdcNoTotalAmount ? redisPred.usdcNoTotalAmount / 1e6 : 0
      } : null,
      comparison: {
        resolvedMatch: redisPred ? Boolean(resolved) === Boolean(redisPred.usdcResolved) : 'N/A',
        outcomeMatch: redisPred ? Boolean(outcome) === Boolean(redisPred.usdcOutcome) : 'N/A',
        needsSync: redisPred ? (Boolean(resolved) !== Boolean(redisPred.usdcResolved) || Boolean(outcome) !== Boolean(redisPred.usdcOutcome)) : true
      },
      user: userParam ? {
        address: userParam,
        position: userPosition
      } : null
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

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
      { name: 'entryPrice', type: 'uint256' },
      { name: 'exitedEarly', type: 'bool' },
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

// Sync single prediction USDC data to Redis
async function syncPredictionUSDC(predictionId: number): Promise<{
  success: boolean;
  registered: boolean;
  yesPool?: number;
  noPool?: number;
  participantCount?: number;
}> {
  const redisId = `pred_v2_${predictionId}`;
  
  try {
    // Read from USDC contract
    const usdcData = await client.readContract({
      address: USDC_DUALPOOL_ADDRESS as `0x${string}`,
      abi: USDC_DUALPOOL_ABI,
      functionName: 'getPrediction',
      args: [BigInt(predictionId)]
    });

    if (!usdcData[0]) { // not registered
      return { success: true, registered: false };
    }

    // Get current Redis data
    const predData = await redis.get(REDIS_KEYS.PREDICTION(redisId));
    if (!predData) {
      return { success: false, registered: true };
    }

    const pred = typeof predData === 'string' ? JSON.parse(predData) : predData;

    // Update with USDC data
    const updated = {
      ...pred,
      usdcPoolEnabled: true,
      usdcYesTotalAmount: Number(usdcData[3]), // yesPool (raw 6 decimals)
      usdcNoTotalAmount: Number(usdcData[4]),  // noPool (raw 6 decimals)
      usdcResolved: usdcData[5],
      usdcCancelled: usdcData[6],
      usdcOutcome: usdcData[7],
      usdcParticipantCount: Number(usdcData[8])
    };

    // Also sync USDC participants list and positions
    try {
      const participantCount = Number(usdcData[8]);
      if (participantCount > 0) {
        // Get USDC participants from contract
        const usdcParticipants = await client.readContract({
          address: USDC_DUALPOOL_ADDRESS as `0x${string}`,
          abi: USDC_DUALPOOL_ABI,
          functionName: 'getParticipants',
          args: [BigInt(predictionId)]
        }).catch(() => null) as string[] | null;

        // Save USDC participants separately
        if (usdcParticipants && usdcParticipants.length > 0) {
          updated.usdcParticipants = usdcParticipants.map((p: string) => p.toLowerCase());
        }
        
        // Sync positions for each USDC participant
        const participantsToSync = usdcParticipants || [];
        for (const participant of participantsToSync.slice(0, 100)) { // Limit to 100 to avoid timeout
          try {
            const position = await client.readContract({
              address: USDC_DUALPOOL_ADDRESS as `0x${string}`,
              abi: USDC_DUALPOOL_ABI,
              functionName: 'getPosition',
              args: [BigInt(predictionId), participant.toLowerCase() as `0x${string}`]
            }).catch(() => null);

            if (position) {
              const usdcYesAmount = Number(position[0]) || 0;
              const usdcNoAmount = Number(position[1]) || 0;
              const usdcClaimed = position[4] || false;

              if (usdcYesAmount > 0 || usdcNoAmount > 0) {
                // Get or create user stake
                const stakeKey = REDIS_KEYS.USER_STAKES(participant.toLowerCase(), redisId);
                const existingStake = await redis.get(stakeKey);
                let userStake: any = existingStake ? (typeof existingStake === 'string' ? JSON.parse(existingStake) : existingStake) : {
                  user: participant.toLowerCase(),
                  predictionId: redisId,
                  stakedAt: Math.floor(Date.now() / 1000),
                  contractVersion: 'V2' as const
                };

                // Add/update USDC stake
                userStake.USDC = {
                  yesAmount: usdcYesAmount,
                  noAmount: usdcNoAmount,
                  claimed: usdcClaimed,
                  tokenType: 'USDC' as const,
                  entryPrice: Number(position[2]) || 0,
                  exitedEarly: position[3] || false
                };

                await redis.set(stakeKey, JSON.stringify(userStake));
              }
            }
          } catch (posError) {
            // Skip individual position errors
            console.warn(`Failed to sync USDC position for ${participant} in ${redisId}:`, posError);
          }
        }
      }
    } catch (posSyncError) {
      console.warn(`Failed to sync USDC positions for prediction ${predictionId}:`, posSyncError);
      // Don't fail the whole sync if position sync fails
    }

    // Save updated prediction back to Redis (with USDC participants and all data)
    await redis.set(REDIS_KEYS.PREDICTION(redisId), JSON.stringify(updated));

    return {
      success: true,
      registered: true,
      yesPool: Number(usdcData[3]) / 1e6,
      noPool: Number(usdcData[4]) / 1e6,
      participantCount: Number(usdcData[8])
    };
  } catch (error) {
    console.error(`Error syncing USDC for prediction ${predictionId}:`, error);
    return { success: false, registered: false };
  }
}

// POST - Sync specific prediction(s)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { predictionIds } = body;

    if (!predictionIds || !Array.isArray(predictionIds)) {
      return NextResponse.json(
        { success: false, error: 'predictionIds array required' },
        { status: 400 }
      );
    }

    const results: Record<number, any> = {};
    
    for (const id of predictionIds) {
      const numericId = typeof id === 'string' 
        ? parseInt(id.replace('pred_v2_', ''), 10) 
        : id;
      
      if (!isNaN(numericId)) {
        results[numericId] = await syncPredictionUSDC(numericId);
      }
    }

    return NextResponse.json({
      success: true,
      synced: Object.keys(results).length,
      results
    });
  } catch (error) {
    console.error('USDC sync error:', error);
    return NextResponse.json(
      { success: false, error: 'Sync failed' },
      { status: 500 }
    );
  }
}

// GET - Sync all registered USDC predictions (admin emergency sync)
export async function GET(request: NextRequest) {
  try {
    // Known registered prediction IDs (can be expanded)
    const registeredIds = [224, 225, 226];
    
    // Also check URL params for specific IDs
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');
    
    let idsToSync = registeredIds;
    if (idsParam) {
      idsToSync = idsParam.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
    }

    const results: Record<number, any> = {};
    let syncedCount = 0;

    for (const id of idsToSync) {
      const result = await syncPredictionUSDC(id);
      results[id] = result;
      if (result.success && result.registered) {
        syncedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${syncedCount} USDC predictions`,
      synced: syncedCount,
      total: idsToSync.length,
      results
    });
  } catch (error) {
    console.error('USDC sync all error:', error);
    return NextResponse.json(
      { success: false, error: 'Sync failed' },
      { status: 500 }
    );
  }
}

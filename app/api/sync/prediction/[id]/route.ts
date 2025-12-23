import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS } from '../../../../../lib/contract';
import { redisHelpers } from '../../../../../lib/redis';

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// POST /api/sync/prediction/[id] - Force sync specific prediction from blockchain to Redis
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const predictionId = resolvedParams.id;
    
    console.log(`🔄 Force syncing prediction ${predictionId} from blockchain to Redis...`);
    
    // Extract numeric ID
    let numericId: number;
    if (predictionId.startsWith('pred_v2_')) {
      numericId = parseInt(predictionId.replace('pred_v2_', ''));
    } else if (predictionId.startsWith('pred_v1_')) {
      numericId = parseInt(predictionId.replace('pred_v1_', ''));
    } else {
      numericId = parseInt(predictionId);
    }
    
    if (isNaN(numericId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid prediction ID'
      }, { status: 400 });
    }
    
    // Use V2 contract for all predictions
    const contract = CONTRACTS.V2;
    
    // Get prediction data from blockchain
    const predictionData = await publicClient.readContract({
      address: contract.address as `0x${string}`,
      abi: contract.abi,
      functionName: 'predictions',
      args: [BigInt(numericId)],
    }) as any[];
    
    if (!predictionData || predictionData.length === 0) {
      return NextResponse.json({
        success: false,
        error: `Prediction ${numericId} not found on blockchain`
      }, { status: 404 });
    }
    
    // Extract data from contract response
    const [
      question,
      description,
      category,
      imageUrl,
      deadline,
      yesTotalAmount,
      noTotalAmount,
      swipeYesTotalAmount,
      swipeNoTotalAmount,
      resolved,
      outcome,
      cancelled,
      creator,
      verified,
      needsApproval,
      createdAt
    ] = predictionData;
    
    // Convert BigInt values to numbers
    const yesTotal = Number(yesTotalAmount);
    const noTotal = Number(noTotalAmount);
    const swipeYesTotal = Number(swipeYesTotalAmount);
    const swipeNoTotal = Number(swipeNoTotalAmount);
    const deadlineNum = Number(deadline);
    const createdAtNum = Number(createdAt);
    
    // Convert boolean values
    const resolvedBool = Boolean(resolved);
    const outcomeBool = Boolean(outcome);
    const cancelledBool = Boolean(cancelled);
    const verifiedBool = Boolean(verified);
    const needsApprovalBool = Boolean(needsApproval);
    
    // Get participants
    let participants: string[] = [];
    try {
      participants = await publicClient.readContract({
        address: contract.address as `0x${string}`,
        abi: contract.abi,
        functionName: 'getParticipants',
        args: [BigInt(numericId)],
      }) as string[];
    } catch (error) {
      console.warn(`⚠️ Could not fetch participants for prediction ${numericId}:`, error);
    }
    
    // Create date strings
    const deadlineDate = new Date(deadlineNum * 1000);
    const endDate = deadlineDate.toISOString().split('T')[0];
    const endTimeStr = deadlineDate.toISOString().split('T')[1].split('.')[0];
    
    // Get existing prediction from Redis to preserve non-blockchain fields
    const predictionIdStr = `pred_v2_${numericId}`;
    const existingPrediction = await redisHelpers.getPrediction(predictionIdStr);
    
    // Create Redis prediction object - preserve existing non-blockchain fields
    const redisPrediction = {
      id: predictionIdStr,
      question: String(question),
      description: String(description),
      category: String(category),
      imageUrl: String(imageUrl),
      deadline: deadlineNum,
      yesTotalAmount: yesTotal,
      noTotalAmount: noTotal,
      swipeYesTotalAmount: swipeYesTotal,
      swipeNoTotalAmount: swipeNoTotal,
      resolved: resolvedBool,
      outcome: outcomeBool,
      cancelled: cancelledBool,
      creator: String(creator),
      verified: verifiedBool,
      needsApproval: needsApprovalBool,
      approved: true, // V2 predictions are auto-approved
      // Preserve existing non-blockchain fields, or use defaults for new predictions
      includeChart: existingPrediction?.includeChart ?? false,
      selectedCrypto: existingPrediction?.selectedCrypto ?? '',
      endDate: endDate,
      endTime: endTimeStr,
      participants: participants.map(p => String(p).toLowerCase()),
      totalStakes: participants.length,
      createdAt: createdAtNum,
      contractVersion: 'V2' as const
    };
    
    // Save to Redis
    await redisHelpers.savePrediction(redisPrediction);
    
    console.log(`✅ Successfully force synced prediction ${numericId} to Redis:`, {
      question: String(question).substring(0, 50) + '...',
      yesTotal: `${(yesTotal / 1e18).toFixed(0)} ETH`,
      noTotal: `${(noTotal / 1e18).toFixed(0)} ETH`,
      swipeYesTotal: `${(swipeYesTotal / 1e18).toFixed(0)} SWIPE`,
      swipeNoTotal: `${(swipeNoTotal / 1e18).toFixed(0)} SWIPE`,
      participants: participants.length
    });
    
    return NextResponse.json({
      success: true,
      message: `Prediction ${numericId} force synced successfully`,
      data: {
        predictionId: numericId,
        redisId: `pred_v2_${numericId}`,
        blockchainData: {
          question: String(question),
          yesTotalAmount: yesTotal,
          noTotalAmount: noTotal,
          swipeYesTotalAmount: swipeYesTotal,
          swipeNoTotalAmount: swipeNoTotal,
          participants: participants.length,
          resolved: resolvedBool,
          deadline: deadlineNum
        },
        redisData: redisPrediction
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Failed to force sync prediction:`, error);
    return NextResponse.json({
      success: false,
      error: `Failed to force sync prediction: ${error instanceof Error ? error.message : 'Unknown error'}`
    }, { status: 500 });
  }
}
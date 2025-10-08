import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS } from '../../../../../lib/contract';

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// GET /api/blockchain/prediction/[id] - Get prediction data from blockchain
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const predictionId = resolvedParams.id;
    
    // Extract numeric ID from prediction ID string
    const numericId = predictionId.replace('pred_v2_', '').replace('pred_v1_', '').replace('pred_', '');
    
    // Validate numeric ID
    if (!numericId || isNaN(Number(numericId))) {
      return NextResponse.json(
        { success: false, error: 'Invalid prediction ID format' },
        { status: 400 }
      );
    }
    
    const predictionIdBigInt = BigInt(numericId);
    
    console.log(`🔍 Fetching prediction ${predictionId} (numeric: ${numericId}) from V2 contract...`);
    
    // Fetch prediction data from contract using V2 ABI (predictions function returns full data)
    console.log('Contract address:', CONTRACTS.V2.address);
    console.log('ABI length:', CONTRACTS.V2.abi?.length);
    
    let predictionData, participantCount;
    
    try {
      predictionData = await publicClient.readContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
        functionName: 'predictions',
        args: [predictionIdBigInt],
      });
      
      // Fetch additional data
      participantCount = await publicClient.readContract({
        address: CONTRACTS.V2.address as `0x${string}`,
        abi: CONTRACTS.V2.abi,
        functionName: 'getParticipants',
        args: [predictionIdBigInt],
      });
    } catch (contractError) {
      console.error('Contract read error:', contractError);
      return NextResponse.json(
        { success: false, error: `Contract read failed: ${contractError}` },
        { status: 500 }
      );
    }
    
    // Parse the prediction data (V2 predictions function returns full structure)
    // Correct order based on Prediction struct in PredictionMarket_V2.sol
    const [
      question, description, category, imageUrl,
      yesTotalAmount, noTotalAmount, swipeYesTotalAmount, swipeNoTotalAmount,
      deadline, resolutionDeadline,
      resolved, outcome, cancelled, createdAt, creator,
      verified, approved, needsApproval, creationToken, creationTokenAmount
    ] = predictionData as any[];
    
    console.log('Raw blockchain data:', {
      deadline: deadline,
      deadlineType: typeof deadline,
      deadlineValue: deadline?.toString(),
      yesTotalAmount: yesTotalAmount?.toString(),
      noTotalAmount: noTotalAmount?.toString(),
      swipeYesTotalAmount: swipeYesTotalAmount?.toString(),
      swipeNoTotalAmount: swipeNoTotalAmount?.toString(),
    });
    
    const prediction = {
      id: predictionId,
      question,
      description,
      category,
      imageUrl: String(imageUrl),
      deadline: Number(deadline) > 0 ? Number(deadline) : 0,
      creator: String(creator),
      verified: Boolean(verified),
      needsApproval: Boolean(needsApproval),
      resolved: Boolean(resolved),
      outcome: Boolean(outcome),
      cancelled: Boolean(cancelled),
      yesTotalAmount: Number(yesTotalAmount) / 1e18, // Convert from wei
      noTotalAmount: Number(noTotalAmount) / 1e18, // Convert from wei
      swipeYesTotalAmount: Number(swipeYesTotalAmount) / 1e18, // Convert from wei
      swipeNoTotalAmount: Number(swipeNoTotalAmount) / 1e18, // Convert from wei
      totalStakes: (Number(yesTotalAmount) + Number(noTotalAmount)) / 1e18, // Calculate ETH total
      totalSwipeStakes: (Number(swipeYesTotalAmount) + Number(swipeNoTotalAmount)) / 1e18, // Calculate SWIPE total
      participantCount: Array.isArray(participantCount) ? participantCount.length : Number(participantCount),
      contractVersion: 'v2',
      timestamp: new Date().toISOString()
    };
    
    console.log(`✅ Prediction ${predictionId} fetched from V2 blockchain:`, {
      question: prediction.question.substring(0, 50) + '...',
      category: prediction.category,
      deadline: prediction.deadline,
      deadlineDate: prediction.deadline > 0 ? new Date(prediction.deadline * 1000).toISOString() : 'Invalid',
      creator: prediction.creator.substring(0, 10) + '...',
      totalStakes: prediction.totalStakes,
      totalSwipeStakes: prediction.totalSwipeStakes,
      participantCount: prediction.participantCount
    });
    
    return NextResponse.json({
      success: true,
      data: prediction,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const resolvedParams = await params;
    console.error(`❌ Failed to fetch prediction ${resolvedParams.id} from blockchain:`, error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch prediction from blockchain',
        details: error instanceof Error ? error.message : 'Unknown error',
        predictionId: resolvedParams.id,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

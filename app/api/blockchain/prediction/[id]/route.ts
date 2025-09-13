import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS, getContractForPrediction } from '../../../../../lib/contract';

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// Helper function to determine which contract to use based on prediction ID
function getContractForPredictionId(predictionId: string) {
  // For now, use V2 for all new predictions
  // In the future, this could be based on prediction ID ranges or timestamps
  return CONTRACTS.V2;
}

// GET /api/blockchain/prediction/[id] - Get prediction data from blockchain
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const predictionId = resolvedParams.id;
    const contract = getContractForPredictionId(predictionId);
    
    console.log(`🔍 Fetching prediction ${predictionId} from ${contract.version} contract...`);
    
    // Fetch prediction data from contract using V2 ABI
    const predictionData = await publicClient.readContract({
      address: contract.address as `0x${string}`,
      abi: contract.abi,
      functionName: 'getPredictionBasic',
      args: [BigInt(predictionId)],
    });
    
    // Fetch additional data
    const participantCount = await publicClient.readContract({
      address: contract.address as `0x${string}`,
      abi: contract.abi,
      functionName: 'getParticipants',
      args: [BigInt(predictionId)],
    });
    
    // Parse the prediction data (V2 getPredictionBasic returns different structure)
    const {
      question,
      description,
      category,
      yesTotalAmount,
      noTotalAmount,
      deadline,
      resolved,
      outcome,
      approved,
      creator
    } = predictionData as {
      question: string;
      description: string;
      category: string;
      yesTotalAmount: bigint;
      noTotalAmount: bigint;
      deadline: bigint;
      resolved: boolean;
      outcome: boolean;
      approved: boolean;
      creator: string;
    };
    
    const prediction = {
      id: predictionId,
      question,
      description,
      category,
      imageUrl: '', // V2 getPredictionBasic doesn't include imageUrl
      deadline: Number(deadline),
      creator,
      verified: false, // V2 getPredictionBasic doesn't include verified
      needsApproval: !approved, // Derive from approved status
      resolved,
      outcome,
      cancelled: false, // V2 getPredictionBasic doesn't include cancelled
      yesTotalAmount: Number(yesTotalAmount) / 1e18, // Convert from wei
      noTotalAmount: Number(noTotalAmount) / 1e18, // Convert from wei
      totalStakes: (Number(yesTotalAmount) + Number(noTotalAmount)) / 1e18, // Calculate total
      participantCount: Array.isArray(participantCount) ? participantCount.length : Number(participantCount),
      contractVersion: contract.version,
      timestamp: new Date().toISOString()
    };
    
    console.log(`✅ Prediction ${predictionId} fetched from ${contract.version} blockchain:`, {
      question: prediction.question.substring(0, 50) + '...',
      category: prediction.category,
      deadline: new Date(prediction.deadline * 1000).toISOString(),
      creator: prediction.creator.substring(0, 10) + '...',
      totalStakes: prediction.totalStakes,
      contractVersion: contract.version
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

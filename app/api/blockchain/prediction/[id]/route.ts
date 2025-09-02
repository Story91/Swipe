import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// Contract ABI for single prediction
const PREDICTION_ABI = [
  'function getPrediction(uint256 _predictionId) external view returns (string question, string description, string category, string imageUrl, uint256 deadline, address creator, bool verified, bool needsApproval, bool resolved, bool outcome, bool cancelled, uint256 yesTotalAmount, uint256 noTotalAmount, uint256 totalStakes)',
  'function getStakeAmount(uint256 _predictionId, address _user, bool _isYes) external view returns (uint256)',
  'function getParticipantCount(uint256 _predictionId) external view returns (uint256)',
];

// GET /api/blockchain/prediction/[id] - Get prediction data from blockchain
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const predictionId = params.id;
    const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
    
    if (!contractAddress) {
      return NextResponse.json(
        { success: false, error: 'Contract address not configured' },
        { status: 500 }
      );
    }
    
    console.log(`🔍 Fetching prediction ${predictionId} from blockchain...`);
    
    // Fetch prediction data from contract
    const predictionData = await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: PREDICTION_ABI,
      functionName: 'getPrediction',
      args: [BigInt(predictionId)],
    });
    
    // Fetch additional data
    const participantCount = await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: PREDICTION_ABI,
      functionName: 'getParticipantCount',
      args: [BigInt(predictionId)],
    });
    
    // Parse the prediction data
    const [
      question,
      description,
      category,
      imageUrl,
      deadline,
      creator,
      verified,
      needsApproval,
      resolved,
      outcome,
      cancelled,
      yesTotalAmount,
      noTotalAmount,
      totalStakes
    ] = predictionData;
    
    const prediction = {
      id: predictionId,
      question,
      description,
      category,
      imageUrl,
      deadline: Number(deadline),
      creator,
      verified,
      needsApproval,
      resolved,
      outcome,
      cancelled,
      yesTotalAmount,
      noTotalAmount,
      totalStakes,
      participantCount: Number(participantCount),
      timestamp: new Date().toISOString()
    };
    
    console.log(`✅ Prediction ${predictionId} fetched from blockchain:`, {
      question: prediction.question.substring(0, 50) + '...',
      category: prediction.category,
      deadline: new Date(prediction.deadline * 1000).toISOString(),
      creator: prediction.creator.substring(0, 10) + '...',
      totalStakes: Number(prediction.totalStakes) / 1e18
    });
    
    return NextResponse.json({
      success: true,
      data: prediction,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Failed to fetch prediction ${params.id} from blockchain:`, error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch prediction from blockchain',
        details: error instanceof Error ? error.message : 'Unknown error',
        predictionId: params.id,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

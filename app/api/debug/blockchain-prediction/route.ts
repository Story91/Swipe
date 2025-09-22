import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS } from '../../../../lib/contract';

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// GET /api/debug/blockchain-prediction - Debug specific prediction on blockchain
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const predictionId = searchParams.get('id');
    const contractVersion = searchParams.get('version') || 'V2';

    if (!predictionId) {
      return NextResponse.json(
        { success: false, error: 'Prediction ID is required' },
        { status: 400 }
      );
    }

    const contract = contractVersion === 'V1' ? CONTRACTS.V1 : CONTRACTS.V2;
    
    // Extract numeric ID
    let numericId: number;
    if (predictionId.startsWith('pred_v2_')) {
      numericId = parseInt(predictionId.replace('pred_v2_', ''));
    } else if (predictionId.startsWith('pred_v1_')) {
      numericId = parseInt(predictionId.replace('pred_v1_', ''));
    } else {
      numericId = parseInt(predictionId);
    }

    console.log(`🔍 Debugging prediction ${numericId} on ${contractVersion} contract...`);

    // Get prediction data from blockchain
    const predictionData = await publicClient.readContract({
      address: contract.address as `0x${string}`,
      abi: contract.abi,
      functionName: 'predictions',
      args: [BigInt(numericId)],
    }) as any;

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
      console.warn('⚠️ Could not get participants:', error);
    }

    // Get contract stats
    let contractStats: any = {};
    try {
      contractStats = await publicClient.readContract({
        address: contract.address as `0x${string}`,
        abi: contract.abi,
        functionName: 'getContractStats',
      }) as any;
    } catch (error) {
      console.warn('⚠️ Could not get contract stats:', error);
    }

    // Format the data for easier reading
    const formattedData = {
      predictionId: predictionId,
      numericId: numericId,
      contractVersion: contractVersion,
      contractAddress: contract.address,
      blockchainData: {
        question: predictionData.question || 'N/A',
        description: predictionData.description || 'N/A',
        deadline: Number(predictionData.deadline),
        resolutionDeadline: Number(predictionData.resolutionDeadline || predictionData.deadline),
        resolved: predictionData.resolved,
        outcome: predictionData.outcome,
        resolvedAt: predictionData.resolvedAt ? Number(predictionData.resolvedAt) : null,
        resolvedBy: predictionData.resolvedBy || 'N/A',
        yesTotalAmount: Number(predictionData.yesTotalAmount),
        noTotalAmount: Number(predictionData.noTotalAmount),
        creator: predictionData.creator || 'N/A',
        createdAt: predictionData.createdAt ? Number(predictionData.createdAt) : null,
        cancelled: predictionData.cancelled || false
      },
      participants: participants,
      contractStats: {
        totalPredictions: Number(contractStats.totalPredictions || 0),
        totalVolume: Number(contractStats.totalVolume || 0),
        totalFees: Number(contractStats.totalFees || 0)
      },
      timestamps: {
        currentTime: Math.floor(Date.now() / 1000),
        deadlinePassed: Number(predictionData.deadline) < Math.floor(Date.now() / 1000),
        resolutionDeadlinePassed: Number(predictionData.resolutionDeadline || predictionData.deadline) < Math.floor(Date.now() / 1000)
      }
    };

    console.log(`📊 Prediction ${numericId} blockchain data:`, formattedData);

    return NextResponse.json({
      success: true,
      data: formattedData,
      message: `Prediction ${numericId} debug data retrieved successfully`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Blockchain prediction debug failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to debug blockchain prediction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

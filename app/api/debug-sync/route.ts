import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../lib/contract';

// Initialize public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

// GET /api/debug-sync - Debug sync issues
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Debugging sync issues...');

    // Get total predictions count from contract
    const nextPredictionId = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'nextPredictionId',
    });

    const totalPredictions = Number(nextPredictionId) - 1;
    console.log(`📊 Found ${totalPredictions} predictions in smart contract`);

    const debugResults = [];

    // Check each prediction individually
    for (let i = 1; i <= totalPredictions; i++) {
      try {
        console.log(`🔍 Checking prediction ${i}...`);

        // Get prediction data
        const predictionData = await publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'predictions',
          args: [BigInt(i)],
        }) as [
          string, // question
          string, // description  
          string, // category
          string, // imageUrl
          bigint, // yesTotalAmount
          bigint, // noTotalAmount
          bigint, // deadline
          bigint, // resolutionDeadline
          boolean, // resolved
          boolean, // outcome
          boolean, // cancelled
          bigint, // createdAt
          string, // creator
          boolean, // verified
          boolean, // approved
          boolean  // needsApproval
        ];

        const [question, description, category, imageUrl, yesTotalAmount, noTotalAmount, deadline, resolutionDeadline, resolved, outcome, cancelled, createdAt, creator, verified, approved, needsApproval] = predictionData;

        // Get participants
        const participants = await publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'getParticipants',
          args: [BigInt(i)],
        }) as readonly `0x${string}`[];

        debugResults.push({
          id: i,
          question: question.substring(0, 50) + '...',
          creator,
          deadline: Number(deadline),
          yesTotalAmount: Number(yesTotalAmount),
          noTotalAmount: Number(noTotalAmount),
          participants: participants.length,
          resolved,
          cancelled,
          verified,
          approved,
          needsApproval,
          status: 'OK'
        });

        console.log(`✅ Prediction ${i} OK: ${question.substring(0, 30)}...`);

      } catch (error) {
        console.error(`❌ Prediction ${i} ERROR:`, error);
        debugResults.push({
          id: i,
          question: 'ERROR',
          creator: 'ERROR',
          deadline: 0,
          yesTotalAmount: 0,
          noTotalAmount: 0,
          participants: 0,
          resolved: false,
          cancelled: false,
          verified: false,
          approved: false,
          needsApproval: false,
          status: 'ERROR',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Debug sync completed',
      data: {
        totalPredictions,
        results: debugResults,
        summary: {
          total: totalPredictions,
          ok: debugResults.filter(r => r.status === 'OK').length,
          errors: debugResults.filter(r => r.status === 'ERROR').length
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Debug sync failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Debug sync failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

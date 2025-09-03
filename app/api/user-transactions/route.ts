import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../lib/redis';
import { UserTransaction } from '../../../lib/types/redis';

// GET /api/user-transactions - Get user transactions
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

    const transactions = await redisHelpers.getUserTransactions(userId);

    return NextResponse.json({
      success: true,
      data: transactions,
      count: transactions.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to get user transactions:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch user transactions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST /api/user-transactions - Save user transaction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, transaction } = body;

    if (!userId || !transaction) {
      return NextResponse.json(
        { success: false, error: 'User ID and transaction data are required' },
        { status: 400 }
      );
    }

    await redisHelpers.saveUserTransaction(userId, transaction);

    return NextResponse.json({
      success: true,
      message: 'Transaction saved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to save user transaction:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save user transaction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT /api/user-transactions - Update transaction status
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, txHash, status, blockNumber, gasUsed } = body;

    if (!userId || !txHash || !status) {
      return NextResponse.json(
        { success: false, error: 'User ID, transaction hash, and status are required' },
        { status: 400 }
      );
    }

    await redisHelpers.updateTransactionStatus(userId, txHash, status, blockNumber, gasUsed);

    return NextResponse.json({
      success: true,
      message: 'Transaction status updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to update transaction status:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update transaction status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers } from '../../../lib/redis';
import { UserTransaction } from '../../../lib/types/redis';
import { chainFromRequest, chainFromRequestOrBody } from '@/lib/chains/requestChain';

/**
 * A person's transaction history, per chain.
 *
 * The Redis key behind this was the last one in lib/redis.ts with no chain
 * namespace, defended by a comment saying the records carry the chain inside
 * themselves. They do not: UserTransaction has no chain field, so no reader
 * could have filtered even if one had tried, and both chains wrote into one
 * list. A Robinhood bet appeared in a Base user's history with a Base
 * explorer link beside it.
 *
 * The key is namespaced now, and these three handlers are the link that makes
 * that fix do anything. Without the chain reaching redisHelpers, every request
 * would still land on Base's list, prefix or no prefix.
 */

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

    const requested = chainFromRequest(request);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }

    const transactions = await redisHelpers.getUserTransactions(userId, requested.chain);

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

    const requested = chainFromRequestOrBody(request, body);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }

    await redisHelpers.saveUserTransaction(userId, transaction, requested.chain);

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

    const requested = chainFromRequestOrBody(request, body);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }

    await redisHelpers.updateTransactionStatus(userId, txHash, status, blockNumber, gasUsed, requested.chain);

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

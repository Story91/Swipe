import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { SWIPE_CLAIM_CONFIG } from '../../../../lib/contract';
import { redis, REDIS_KEYS } from '../../../../lib/redis';

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

/**
 * GET /api/swipe-claim/claim-history?address=0x...
 * Get user's claim history by reading SwipeClaimed events from blockchain
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('address');

    if (!userAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'User address is required',
        },
        { status: 400 }
      );
    }

    const SWIPE_CLAIM_CONTRACT = (SWIPE_CLAIM_CONFIG.address as `0x${string}`) || null;

    if (!SWIPE_CLAIM_CONTRACT || SWIPE_CLAIM_CONTRACT === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'SwipeClaim contract not configured'
      });
    }

    const normalizedAddress = userAddress.toLowerCase();

    // Check Redis cache first (much faster)
    const cacheKey = REDIS_KEYS.SWIPE_CLAIM_HISTORY(normalizedAddress);
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      console.log(`✅ Returning cached claim history for ${userAddress}`);
      const parsed = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
      return NextResponse.json({
        success: true,
        data: parsed,
        cached: true,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🔍 Fetching SwipeClaimed events for ${userAddress} from blockchain...`);

    // Define the SwipeClaimed event ABI
    const swipeClaimedEvent = parseAbiItem(
      'event SwipeClaimed(address indexed user, uint256 betCount, uint256 swipeAmount)'
    );

    // Get current block number
    const currentBlock = await publicClient.getBlockNumber();
    
    // SwipeClaim contract deployment block (approximate - adjust if needed)
    // You can find this from contract deployment transaction
    const SWIPE_CLAIM_DEPLOY_BLOCK = BigInt(0); // Set actual deployment block if known
    
    // Get all SwipeClaimed events for this user
    const MAX_BLOCKS_PER_REQUEST = BigInt(1000);
    const allEvents: any[] = [];
    let fromBlock = SWIPE_CLAIM_DEPLOY_BLOCK;
    
    // If we don't know deployment block, start from 30 days ago
    if (fromBlock === BigInt(0)) {
      const blocks30DaysAgo = currentBlock > BigInt(1300000) ? currentBlock - BigInt(1300000) : BigInt(0);
      fromBlock = blocks30DaysAgo;
    }

    while (fromBlock < currentBlock) {
      const toBlock = fromBlock + MAX_BLOCKS_PER_REQUEST - BigInt(1);
      const actualToBlock = toBlock > currentBlock ? currentBlock : toBlock;

      try {
        const chunkEvents = await publicClient.getLogs({
          address: SWIPE_CLAIM_CONTRACT,
          event: swipeClaimedEvent,
          args: {
            user: userAddress as `0x${string}`,
          },
          fromBlock: fromBlock,
          toBlock: actualToBlock,
        });

        allEvents.push(...chunkEvents);
      } catch (error: any) {
        console.error(`❌ Error fetching events from ${fromBlock} to ${actualToBlock}:`, error.message);
      }

      fromBlock = actualToBlock + BigInt(1);

      if (fromBlock < currentBlock) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (allEvents.length === 0) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No claim history found'
      });
    }

    // Get the most recent claim (should be only one, but get latest)
    const latestEvent = allEvents[allEvents.length - 1];
    const betCount = Number(latestEvent.args.betCount || 0);
    const swipeAmount = Number(latestEvent.args.swipeAmount || 0);
    const blockNumber = Number(latestEvent.blockNumber);
    const transactionHash = latestEvent.transactionHash;

    // Determine tier based on bet count
    let tier = '—';
    if (betCount >= 100) tier = '100+';
    else if (betCount >= 50) tier = '50+';
    else if (betCount >= 25) tier = '25+';
    else if (betCount >= 10) tier = '10+';

    const claimHistoryData = {
      hasClaimed: true,
      betCount,
      swipeAmount,
      swipeAmountFormatted: (swipeAmount / 1e18).toFixed(0),
      tier,
      blockNumber,
      transactionHash,
      timestamp: latestEvent.blockTimestamp || null
    };

    // Save to Redis cache (permanent - no expiration)
    try {
      await redis.set(cacheKey, JSON.stringify(claimHistoryData));
      console.log(`💾 Saved claim history to Redis for ${userAddress}`);
    } catch (error) {
      console.error('⚠️ Failed to save claim history to Redis:', error);
    }

    return NextResponse.json({
      success: true,
      data: claimHistoryData,
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to get claim history:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch claim history',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}


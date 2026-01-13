import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { isBlacklisted } from '../../../../lib/blacklist';

/**
 * API Route: /api/daily-tasks/verify
 * 
 * Verifies task completion and returns a signature for claiming on-chain.
 * 
 * Tasks supported:
 * - SHARE_CAST: User shared a cast on Farcaster with @swipeai mention
 * - CREATE_PREDICTION: User created a prediction today
 * - TRADING_VOLUME: User made a bet today (any amount)
 * - BETA_TESTER: User is a verified beta tester
 * - FOLLOW_SOCIALS: User followed @swipeai on Farcaster
 */

// Task verifier private key (should be in env)
const TASK_VERIFIER_PRIVATE_KEY = process.env.TASK_VERIFIER_PRIVATE_KEY || '';

// Neynar API for Farcaster verification
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';

// SwipeAI Farcaster FID (you need to set this)
const SWIPEAI_FID = process.env.SWIPEAI_FID || ''; 

interface VerifyTaskRequest {
  address: string;
  taskType: string;
  checkOnly?: boolean; // If true, only check status without marking as completed
  proof?: {
    castHash?: string;  // For SHARE_CAST - user provides cast hash
    fid?: number;       // For FOLLOW_SOCIALS - user's Farcaster ID
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyTaskRequest = await request.json();
    const { address, taskType, proof, checkOnly } = body;

    if (!address || !taskType) {
      return NextResponse.json(
        { success: false, error: 'Missing address or taskType' },
        { status: 400 }
      );
    }

    // Validate address
    if (!ethers.isAddress(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address' },
        { status: 400 }
      );
    }

    // Check if address is blacklisted
    if (isBlacklisted(address)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'This address is blacklisted and cannot claim rewards',
          blacklisted: true
        },
        { status: 403 }
      );
    }

    const redis = (await import('../../../../lib/redis')).default;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Achievements (one-time rewards) vs Daily Tasks
    const isAchievement = ['BETA_TESTER', 'FOLLOW_SOCIALS', 'STREAK_7', 'STREAK_30'].includes(taskType);
    
    // For achievements, use a permanent key (not daily)
    // For daily tasks, use a daily key that expires
    const taskKey = isAchievement 
      ? `achievements:${address.toLowerCase()}:${taskType}`
      : `daily-tasks:${address.toLowerCase()}:${taskType}:${today}`;
    
    // For checkOnly mode, skip the "already completed" check - we just want to verify status
    if (!checkOnly) {
      // Check if task/achievement was already completed
      const alreadyCompleted = await redis.get(taskKey);
      if (alreadyCompleted) {
        const errorMsg = isAchievement 
          ? 'Achievement already claimed' 
          : 'Task already completed today';
        return NextResponse.json(
          { success: false, error: errorMsg, alreadyCompleted: true },
          { status: 400 }
        );
      }
    }

    // Verify the task based on type
    let isValid = false;
    let errorMessage = '';

    switch (taskType) {
      case 'SHARE_CAST':
        if (!proof?.castHash) {
          errorMessage = 'Cast hash required. Post on Farcaster and paste the cast URL.';
          break;
        }
        const castResult = await verifyFarcasterCast(address, proof.castHash);
        isValid = castResult.valid;
        if (!isValid) errorMessage = castResult.error || 'Cast not found or missing @swipeai mention';
        break;

      case 'CREATE_PREDICTION':
        isValid = await verifyPredictionCreated(address);
        if (!isValid) errorMessage = 'No prediction created today. Create a prediction first!';
        break;

      case 'TRADING_VOLUME':
        isValid = await verifyTradingActivity(address);
        if (!isValid) errorMessage = 'No bets placed today. Place a bet first!';
        break;

      case 'BETA_TESTER':
        isValid = await verifyBetaTester(address);
        if (!isValid) errorMessage = 'Not a verified beta tester';
        break;

      case 'FOLLOW_SOCIALS':
        if (!proof?.fid) {
          // Try to get FID from address
          const userFid = await getFidFromAddress(address);
          if (userFid) {
            isValid = await verifyFollowsSwipeAI(userFid);
          }
        } else {
          isValid = await verifyFollowsSwipeAI(proof.fid);
        }
        if (!isValid) errorMessage = 'You need to follow @swipeai on Farcaster';
        break;

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid task type' },
          { status: 400 }
        );
    }

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 400 }
      );
    }

    // For checkOnly mode, just return success without generating signature or marking completed
    if (checkOnly) {
      return NextResponse.json({
        success: true,
        checkOnly: true,
        taskType,
        address,
        message: 'Task verification passed',
      });
    }

    // Generate signature for on-chain verification
    if (!TASK_VERIFIER_PRIVATE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Verifier not configured. Contact admin.' },
        { status: 500 }
      );
    }

    const signature = await generateTaskSignature(address, taskType);

    // DON'T mark as completed here - wait for on-chain transaction confirmation
    // The /api/daily-tasks/confirm endpoint will mark it after successful tx

    return NextResponse.json({
      success: true,
      signature,
      taskType,
      address,
      isAchievement, // Pass this so frontend knows
      message: getTaskSuccessMessage(taskType),
    });

  } catch (error) {
    console.error('Task verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Get seconds until midnight UTC
 */
function getSecondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.floor((midnight.getTime() - now.getTime()) / 1000);
}

/**
 * Get success message for task type
 */
function getTaskSuccessMessage(taskType: string): string {
  switch (taskType) {
    case 'SHARE_CAST': return '🎉 Cast verified! Claim your 50k SWIPE reward.';
    case 'CREATE_PREDICTION': return '🎯 Prediction verified! Claim your 75k SWIPE reward.';
    case 'TRADING_VOLUME': return '💰 Trading activity verified! Claim your 100k SWIPE reward.';
    case 'BETA_TESTER': return '🧪 Beta tester verified! Claim your 500k SWIPE reward.';
    case 'FOLLOW_SOCIALS': return '👥 Follow verified! Claim your 100k SWIPE reward.';
    default: return 'Task verified!';
  }
}

/**
 * Generate signature for task completion
 */
async function generateTaskSignature(userAddress: string, taskType: string): Promise<string> {
  const wallet = new ethers.Wallet(TASK_VERIFIER_PRIVATE_KEY);
  
  // Current day (matches contract: block.timestamp / 1 days)
  const currentDay = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  
  // Create message hash (must match contract's verification)
  const messageHash = ethers.solidityPackedKeccak256(
    ['address', 'string', 'uint256'],
    [userAddress, taskType, currentDay]
  );
  
  // Sign the message
  const signature = await wallet.signMessage(ethers.getBytes(messageHash));
  
  return signature;
}

/**
 * Verify Farcaster cast with @swipeai mention
 */
async function verifyFarcasterCast(
  address: string, 
  castHashOrUrl: string
): Promise<{ valid: boolean; error?: string }> {
  
  const input = castHashOrUrl.trim();
  
  // Determine if input is a URL or a hash
  // According to Neynar docs: Cast URLs don't contain full hash, so we must use type=url for URLs
  // Supported URL formats:
  // - https://warpcast.com/username/0x123abc
  // - https://farcaster.xyz/username/0x123abc  
  // - https://base.app/post/0x123abc
  // - Direct hash: 0x123abc (full 64-char hash)
  
  const isUrl = input.includes('://') || input.includes('warpcast.com') || 
                input.includes('farcaster.xyz') || input.includes('base.app');
  
  let identifier: string;
  let lookupType: 'url' | 'hash';
  
  if (isUrl) {
    // Use the full URL for Neynar lookup (they resolve it to full hash internally)
    identifier = encodeURIComponent(input);
    lookupType = 'url';
    console.log(`🔍 Verifying cast by URL: ${input}`);
  } else {
    // Direct hash input
    let castHash = input;
    
    // Validate hash format
    if (!castHash.startsWith('0x') && !castHash.match(/^[a-fA-F0-9]+$/)) {
      return { valid: false, error: 'Invalid cast URL or hash format' };
    }
    
    // Remove 0x prefix if present for Neynar API call
    if (castHash.startsWith('0x')) {
      castHash = castHash.slice(2);
    }
    
    identifier = castHash;
    lookupType = 'hash';
    console.log(`🔍 Verifying cast by hash: ${castHash}`);
  }

  if (!NEYNAR_API_KEY) {
    console.log('⚠️ Neynar API key not configured, auto-approving for testing');
    return { valid: true };
  }

  try {
    // Fetch cast details from Neynar
    // Use type=url for URLs (Neynar resolves short hash to full hash)
    // Use type=hash for direct hash input
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/cast?identifier=${identifier}&type=${lookupType}`,
      {
        headers: {
          'accept': 'application/json',
          'x-api-key': NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Neynar API error:', errorText);
      return { valid: false, error: 'Cast not found. Make sure you pasted the correct URL.' };
    }

    const data = await response.json();
    const cast = data.cast;

    if (!cast) {
      return { valid: false, error: 'Cast not found' };
    }

    // Check if cast mentions @swipeai (case insensitive)
    const text = cast.text?.toLowerCase() || '';
    const hasMention = text.includes('@swipeai') || text.includes('swipeai') || text.includes('$swipe');

    if (!hasMention) {
      return { valid: false, error: 'Cast must mention @swipeai or $SWIPE' };
    }

    // Verify the caster has this address verified
    const verifiedAddresses = cast.author?.verified_addresses?.eth_addresses || [];
    const custodyAddress = cast.author?.custody_address;
    
    const allAddresses = [...verifiedAddresses, custodyAddress]
      .filter(Boolean)
      .map((a: string) => a.toLowerCase());
    
    if (!allAddresses.includes(address.toLowerCase())) {
      return { valid: false, error: 'This cast was not posted by your connected wallet' };
    }

    // Check cast age (must be from today or yesterday to prevent old casts)
    const castTime = new Date(cast.timestamp).getTime();
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    if (castTime < oneDayAgo) {
      return { valid: false, error: 'Cast is too old. Post a new cast today!' };
    }

    return { valid: true };

  } catch (error) {
    console.error('Farcaster verification error:', error);
    return { valid: false, error: 'Failed to verify cast. Try again.' };
  }
}

/**
 * Verify user created a prediction today
 */
async function verifyPredictionCreated(address: string): Promise<boolean> {
  try {
    const { redisHelpers } = await import('../../../../lib/redis');
    
    // Get all predictions from Redis using the proper helper
    const predictions = await redisHelpers.getAllPredictions();
    
    if (!predictions || predictions.length === 0) {
      console.log('❌ No predictions found in Redis');
      return false;
    }
    
    // Get today's start timestamp (UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayTimestampSeconds = Math.floor(today.getTime() / 1000); // Convert to seconds

    console.log(`🔍 Checking ${predictions.length} predictions for creator ${address}`);
    console.log(`📅 Today starts at: ${todayTimestampSeconds} (${today.toISOString()})`);

    for (const prediction of predictions) {
      try {
        // Check if created by this user
        const creatorMatch = prediction.creator?.toLowerCase() === address.toLowerCase();
        
        // createdAt is in seconds (blockchain timestamp)
        const createdAtSeconds = typeof prediction.createdAt === 'number' 
          ? prediction.createdAt 
          : parseInt(String(prediction.createdAt)) || 0;
        
        const createdToday = createdAtSeconds >= todayTimestampSeconds;
        
        if (creatorMatch) {
          console.log(`🔍 Found prediction by ${address}: id=${prediction.id}, createdAt=${createdAtSeconds}, todayStart=${todayTimestampSeconds}, createdToday=${createdToday}`);
        }
        
        if (creatorMatch && createdToday) {
          console.log(`✅ Found prediction created by ${address} today: ${prediction.id}`);
          return true;
        }
      } catch (err) {
        console.warn(`⚠️ Error processing prediction:`, err);
        continue;
      }
    }

    console.log(`❌ No predictions created by ${address} today`);
    return false;

  } catch (error) {
    console.error('Prediction verification error:', error);
    return false;
  }
}

/**
 * Verify user has trading activity today (placed a bet)
 * Checks user-transactions in Redis (saved after each bet in TinderCard.tsx)
 */
async function verifyTradingActivity(address: string): Promise<boolean> {
  try {
    const { redisHelpers } = await import('../../../../lib/redis');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();
    
    console.log(`🔍 Checking trading activity for ${address}...`);
    console.log(`📅 Today timestamp (UTC midnight): ${todayTimestamp} (${new Date(todayTimestamp).toISOString()})`);
    
    // 1. PRIMARY: Check user-transactions (saved after each successful bet)
    try {
      const transactions = await redisHelpers.getUserTransactions(address.toLowerCase());
      console.log(`📊 Found ${transactions?.length || 0} total transactions for user`);
      
      if (transactions && transactions.length > 0) {
        for (const tx of transactions) {
          // Check if it's a stake transaction from today
          const isStake = tx.type === 'stake';
          const txTime = new Date(tx.timestamp).getTime();
          const isToday = txTime >= todayTimestamp;
          const isSuccess = tx.status === 'success';
          
          console.log(`  - TX: type=${tx.type}, time=${new Date(tx.timestamp).toISOString()}, isToday=${isToday}, status=${tx.status}`);
          
          if (isStake && isToday && isSuccess) {
            console.log(`✅ Found successful stake transaction from today: ${tx.txHash}`);
            return true;
          }
        }
        console.log(`⚠️ No stake transactions from today found`);
      }
    } catch (txError) {
      console.error('Error checking user transactions:', txError);
    }
    
    // 2. FALLBACK: Check predictions stakes in Redis
    const redis = (await import('../../../../lib/redis')).default;
    const predictions = await redis.hgetall('predictions');
    
    if (predictions && Object.keys(predictions).length > 0) {
      for (const [, value] of Object.entries(predictions)) {
        try {
          const prediction = JSON.parse(value as string);
          
          // Check if user has any stakes in this prediction
          if (prediction.stakes) {
            for (const stake of prediction.stakes) {
              const stakeMatch = stake.user?.toLowerCase() === address.toLowerCase();
              const stakedToday = new Date(stake.timestamp || stake.createdAt).getTime() >= todayTimestamp;
              
              if (stakeMatch && stakedToday) {
                console.log(`✅ Found stake by ${address} today in Redis prediction:`, prediction.id);
                return true;
              }
            }
          }
        } catch {
          continue;
        }
      }
    }

    // 3. LAST RESORT: Check blockchain V2 contract for StakePlaced events
    const V2_CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_V2_ADDRESS as `0x${string}`;
    
    if (V2_CONTRACT && V2_CONTRACT !== '0x0000000000000000000000000000000000000000') {
      try {
        console.log(`🔍 Checking blockchain for StakePlaced events from ${address}...`);
        console.log(`📍 Contract: ${V2_CONTRACT}`);
        
        const { createPublicClient, http, parseAbiItem } = await import('viem');
        const { base } = await import('viem/chains');
        
        const publicClient = createPublicClient({
          chain: base,
          transport: http(process.env.ALCHEMY_RPC_URL || 'https://mainnet.base.org'),
        });
        
        // Get current block and calculate start block for today (~2 seconds per block on Base)
        const currentBlock = await publicClient.getBlockNumber();
        const blocksPerDay = BigInt(43200); // ~24 hours worth of blocks
        const fromBlock = currentBlock > blocksPerDay ? currentBlock - blocksPerDay : BigInt(0);
        
        console.log(`📊 Searching blocks ${fromBlock} to ${currentBlock}`);
        
        // StakePlaced event signature from PredictionMarket_V2.sol:
        // event StakePlaced(uint256 indexed predictionId, address indexed user, bool isYes, uint256 amount, uint256 newYesTotal, uint256 newNoTotal)
        const stakePlacedEvent = parseAbiItem(
          'event StakePlaced(uint256 indexed predictionId, address indexed user, bool isYes, uint256 amount, uint256 newYesTotal, uint256 newNoTotal)'
        );
        
        const logs = await publicClient.getLogs({
          address: V2_CONTRACT,
          event: stakePlacedEvent,
          args: {
            user: address as `0x${string}`,
          },
          fromBlock,
          toBlock: currentBlock,
        });
        
        console.log(`📊 Found ${logs.length} StakePlaced events for ${address}`);
        
        if (logs.length > 0) {
          // Verify that at least one stake was made today (UTC)
          for (const log of logs) {
            const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
            const blockTimestamp = Number(block.timestamp) * 1000; // Convert to ms
            
            if (blockTimestamp >= todayTimestamp) {
              console.log(`✅ Found stake from today: block ${log.blockNumber}, tx ${log.transactionHash}`);
              return true;
            }
          }
          console.log(`⚠️ Found stakes but none from today (UTC)`);
        }
      } catch (blockchainError) {
        console.error('Blockchain check error:', blockchainError);
        // Continue - blockchain check is optional, Redis check above may have found it
      }
    } else {
      console.log('⚠️ V2_CONTRACT not configured, skipping blockchain check');
    }

    console.log(`❌ No trading activity found for ${address} today`);
    return false;

  } catch (error) {
    console.error('Trading activity verification error:', error);
    return false;
  }
}

/**
 * Verify user is a beta tester
 */
async function verifyBetaTester(address: string): Promise<boolean> {
  // Check if address is in beta tester list from env
  const betaTesters = process.env.BETA_TESTERS?.split(',').map(a => a.toLowerCase().trim()) || [];
  
  if (betaTesters.includes(address.toLowerCase())) {
    return true;
  }

  // Also check Redis for dynamically added beta testers
  try {
    const redis = (await import('../../../../lib/redis')).default;
    const isBetaTester = await redis.sismember('beta-testers', address.toLowerCase());
    return isBetaTester === 1;
  } catch {
    return false;
  }
}

/**
 * Get Farcaster FID from Ethereum address
 * Uses multiple methods to find user's FID
 */
async function getFidFromAddress(address: string): Promise<number | null> {
  if (!NEYNAR_API_KEY) {
    console.log('⚠️ NEYNAR_API_KEY not set');
    return null;
  }

  try {
    // Method 1: Try by_verification endpoint (for verified addresses)
    console.log(`🔍 Looking up FID for address: ${address}`);
    
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`,
      {
        headers: {
          'accept': 'application/json',
          'x-api-key': NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) {
      console.log(`❌ Neynar API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`📊 Neynar response:`, JSON.stringify(data).slice(0, 500));
    
    // Response format: { [address]: [users] }
    const users = data[address.toLowerCase()] || data[address];
    if (users && users.length > 0) {
      const fid = users[0].fid;
      console.log(`✅ Found FID ${fid} for address ${address}`);
      return fid;
    }
    
    console.log(`❌ No FID found for address ${address}`);
    return null;

  } catch (error) {
    console.error('getFidFromAddress error:', error);
    return null;
  }
}

/**
 * Verify user follows @swipeai on Farcaster
 * Uses fetchBulkUsers with viewer_fid to check if user follows swipeai
 */
async function verifyFollowsSwipeAI(fid: number): Promise<boolean> {
  console.log(`🔍 Checking if FID ${fid} follows @swipeai (FID: ${SWIPEAI_FID})`);
  
  if (!NEYNAR_API_KEY || !SWIPEAI_FID) {
    console.log('⚠️ Neynar/SwipeAI FID not configured, auto-approving for testing');
    console.log(`   NEYNAR_API_KEY set: ${!!NEYNAR_API_KEY}`);
    console.log(`   SWIPEAI_FID set: ${!!SWIPEAI_FID} (value: ${SWIPEAI_FID})`);
    return true;
  }

  try {
    // Use fetchBulkUsers API with viewer_fid to get viewer_context
    // We check if user (viewer) follows swipeai (target)
    const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${SWIPEAI_FID}&viewer_fid=${fid}`;
    console.log(`🌐 Calling Neynar API: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'x-api-key': NEYNAR_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Neynar API error: ${response.status}`, errorText);
      return false;
    }

    const data = await response.json();
    console.log(`📊 Neynar response:`, JSON.stringify(data).slice(0, 1000));
    
    const users = data.users || [];
    
    if (users.length === 0) {
      console.log('❌ SwipeAI user not found in Neynar response');
      return false;
    }
    
    // Check viewer_context.following - this tells us if the viewer (fid) follows swipeai
    const swipeaiUser = users[0];
    const viewerContext = swipeaiUser.viewer_context;
    console.log(`📊 Viewer context:`, JSON.stringify(viewerContext));
    
    const isFollowing = viewerContext?.following === true;
    
    console.log(`📱 User FID ${fid} follows @swipeai: ${isFollowing}`);
    return isFollowing;

  } catch (error) {
    console.error('Follow verification error:', error);
    return false;
  }
}

/**
 * GET: Check task status for user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    
    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Address required' },
        { status: 400 }
      );
    }

    const redis = (await import('../../../../lib/redis')).default;
    const today = new Date().toISOString().split('T')[0];
    
    // Check all task types
    const tasks = ['SHARE_CAST', 'CREATE_PREDICTION', 'TRADING_VOLUME'];
    const achievements = ['BETA_TESTER', 'FOLLOW_SOCIALS'];
    
    const taskStatus: Record<string, boolean> = {};
    
    for (const task of [...tasks, ...achievements]) {
      const taskKey = `daily-tasks:${address.toLowerCase()}:${task}:${today}`;
      const completed = await redis.get(taskKey);
      taskStatus[task] = completed === 'completed';
    }

    return NextResponse.json({
      success: true,
      address,
      date: today,
      tasks: taskStatus,
    });

  } catch (error) {
    console.error('Task status check error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

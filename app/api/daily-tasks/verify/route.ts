import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

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
  proof?: {
    castHash?: string;  // For SHARE_CAST - user provides cast hash
    fid?: number;       // For FOLLOW_SOCIALS - user's Farcaster ID
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyTaskRequest = await request.json();
    const { address, taskType, proof } = body;

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

    // Check if task was already completed today
    const redis = (await import('../../../../lib/redis')).default;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const taskKey = `daily-tasks:${address.toLowerCase()}:${taskType}:${today}`;
    
    const alreadyCompleted = await redis.get(taskKey);
    if (alreadyCompleted) {
      return NextResponse.json(
        { success: false, error: 'Task already completed today', alreadyCompleted: true },
        { status: 400 }
      );
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

    // Generate signature for on-chain verification
    if (!TASK_VERIFIER_PRIVATE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Verifier not configured. Contact admin.' },
        { status: 500 }
      );
    }

    const signature = await generateTaskSignature(address, taskType);

    // Mark task as completed for today (expire at midnight)
    const secondsUntilMidnight = getSecondsUntilMidnight();
    await redis.set(taskKey, 'completed', { ex: secondsUntilMidnight });

    // Track completion in stats
    await redis.hincrby('daily-tasks:stats', `${taskType}:completions`, 1);

    return NextResponse.json({
      success: true,
      signature,
      taskType,
      address,
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
  
  // Extract cast hash from URL if needed
  // Supported URL formats:
  // - https://warpcast.com/username/0x123abc
  // - https://farcaster.xyz/username/0x123abc
  // - https://base.app/post/0x123abc
  // - Direct hash: 0x123abc
  let castHash = castHashOrUrl.trim();
  
  // Check if it's a URL (contains / and looks like a URL)
  if (castHash.includes('/')) {
    const parts = castHash.split('/');
    // Get the last part which should be the hash
    castHash = parts[parts.length - 1];
    
    // Handle query params if any (e.g., ?something=value)
    if (castHash.includes('?')) {
      castHash = castHash.split('?')[0];
    }
  }
  
  // Validate hash format
  if (!castHash.startsWith('0x') && !castHash.match(/^[a-fA-F0-9]+$/)) {
    return { valid: false, error: 'Invalid cast URL or hash format' };
  }
  
  // Remove 0x prefix if present for Neynar API call
  if (castHash.startsWith('0x')) {
    castHash = castHash.slice(2);
  }
  
  console.log(`🔍 Verifying cast hash: ${castHash} from URL: ${castHashOrUrl}`);

  if (!NEYNAR_API_KEY) {
    console.log('⚠️ Neynar API key not configured, auto-approving for testing');
    return { valid: true };
  }

  try {
    // Fetch cast details from Neynar
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/cast?identifier=${castHash}&type=hash`,
      {
        headers: {
          'accept': 'application/json',
          'api_key': NEYNAR_API_KEY,
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
    const redis = (await import('../../../../lib/redis')).default;
    
    // Get all predictions from Redis
    const predictions = await redis.hgetall('predictions');
    
    if (!predictions || Object.keys(predictions).length === 0) {
      return false;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    for (const [, value] of Object.entries(predictions)) {
      try {
        const prediction = JSON.parse(value as string);
        
        // Check if created by this user today
        const creatorMatch = prediction.creator?.toLowerCase() === address.toLowerCase();
        const createdToday = new Date(prediction.createdAt).getTime() >= todayTimestamp;
        
        if (creatorMatch && createdToday) {
          console.log(`✅ Found prediction created by ${address} today:`, prediction.id);
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;

  } catch (error) {
    console.error('Prediction verification error:', error);
    return false;
  }
}

/**
 * Verify user has trading activity today (placed a bet)
 * Checks both Redis and blockchain (V2 contract)
 */
async function verifyTradingActivity(address: string): Promise<boolean> {
  try {
    const redis = (await import('../../../../lib/redis')).default;
    const { createPublicClient, http, parseAbiItem } = await import('viem');
    const { base } = await import('viem/chains');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();
    
    // 1. First check Redis for faster results
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

    // Also check activity log if exists
    const activityKey = `user:${address.toLowerCase()}:activity`;
    const recentActivity = await redis.lrange(activityKey, 0, 50);
    
    for (const activityStr of recentActivity) {
      try {
        const activity = JSON.parse(activityStr);
        if (
          activity.type === 'stake' && 
          new Date(activity.timestamp).getTime() >= todayTimestamp
        ) {
          console.log(`✅ Found stake by ${address} today in activity log`);
          return true;
        }
      } catch {
        continue;
      }
    }

    // 2. Check blockchain V2 contract for StakePlaced events
    const V2_CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_V2_ADDRESS as `0x${string}`;
    
    if (V2_CONTRACT) {
      try {
        const publicClient = createPublicClient({
          chain: base,
          transport: http(process.env.ALCHEMY_RPC_URL || 'https://mainnet.base.org'),
        });
        
        // Get current block and calculate start block for today (~2 seconds per block on Base)
        const currentBlock = await publicClient.getBlockNumber();
        const blocksPerDay = BigInt(43200); // ~24 hours worth of blocks
        const fromBlock = currentBlock > blocksPerDay ? currentBlock - blocksPerDay : BigInt(0);
        
        // StakePlaced event signature
        const stakePlacedEvent = parseAbiItem(
          'event StakePlaced(uint256 indexed predictionId, address indexed user, bool isYes, uint256 amount, bool isSwipe)'
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
        
        if (logs.length > 0) {
          console.log(`✅ Found ${logs.length} StakePlaced events on blockchain for ${address} today`);
          return true;
        }
      } catch (blockchainError) {
        console.error('Blockchain check error:', blockchainError);
        // Continue - blockchain check is optional
      }
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
 */
async function getFidFromAddress(address: string): Promise<number | null> {
  if (!NEYNAR_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by_verification?address=${address}`,
      {
        headers: {
          'accept': 'application/json',
          'api_key': NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    return data.user?.fid || null;

  } catch {
    return null;
  }
}

/**
 * Verify user follows @swipeai on Farcaster
 * Uses fetchBulkUsers with viewer_fid to check if user follows swipeai
 */
async function verifyFollowsSwipeAI(fid: number): Promise<boolean> {
  if (!NEYNAR_API_KEY || !SWIPEAI_FID) {
    console.log('⚠️ Neynar/SwipeAI FID not configured, auto-approving for testing');
    return true;
  }

  try {
    // Use fetchBulkUsers API with viewer_fid to get viewer_context
    // We check if user (viewer) follows swipeai (target)
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${SWIPEAI_FID}&viewer_fid=${fid}`,
      {
        headers: {
          'accept': 'application/json',
          'api_key': NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) {
      console.error('Neynar API error:', response.status, await response.text());
      return false;
    }

    const data = await response.json();
    const users = data.users || [];
    
    if (users.length === 0) {
      console.log('❌ SwipeAI user not found in Neynar');
      return false;
    }
    
    // Check viewer_context.following - this tells us if the viewer (fid) follows swipeai
    const swipeaiUser = users[0];
    const isFollowing = swipeaiUser.viewer_context?.following === true;
    
    console.log(`📱 User ${fid} follows @swipeai: ${isFollowing}`);
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

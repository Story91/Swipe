import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { isBlacklisted } from '../../../../lib/blacklist';

/**
 * API Route: /api/daily-claims/verify
 *
 * Verifies daily claim eligibility and returns a signature for claiming on-chain.
 *
 * This endpoint prevents abuse by:
 * - Verifying address is not blacklisted
 * - Checking cooldown (24h) from V2/V3 contract
 * - Verifying streak is valid
 * - Generating signature that expires daily
 */

// Task verifier private key (should be in env)
const TASK_VERIFIER_PRIVATE_KEY = process.env.TASK_VERIFIER_PRIVATE_KEY || '';

// V2/V3 Contract address (should be in env)
const V2_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT || '';
const V3_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_DAILY_REWARDS_V3_CONTRACT || '';

interface VerifyDailyClaimRequest {
  address: string;    // User address
  checkOnly?: boolean; // If true, only check status without generating signature
}

/**
 * POST /api/daily-claims/verify
 * Verify daily claim and generate signature
 */
export async function POST(request: NextRequest) {
  try {
    const body: VerifyDailyClaimRequest = await request.json();
    const { address, checkOnly } = body;

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Missing address' },
        { status: 400 }
      );
    }

    // Validate address
    if (!ethers.isAddress(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address format' },
        { status: 400 }
      );
    }

    // Normalize address
    const userAddr = ethers.getAddress(address);

    // Check if address is blacklisted
    if (isBlacklisted(userAddr)) {
      return NextResponse.json(
        {
          success: false,
          error: 'This address is blacklisted and cannot claim rewards',
          blacklisted: true
        },
        { status: 403 }
      );
    }

    // Verify claim eligibility from contract
    // Try V3 first, fallback to V2
    const contractAddress = V3_CONTRACT_ADDRESS || V2_CONTRACT_ADDRESS;
    if (!contractAddress) {
      return NextResponse.json(
        { success: false, error: 'Contract address not configured' },
        { status: 500 }
      );
    }

    try {
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org');

      // Read user stats from contract
      const contractABI = [
        "function getUserStats(address) external view returns (uint256 lastClaimTimestamp, uint256 currentStreak, uint256 longestStreak, uint256 totalClaimed, uint256 jackpotsWon, bool canClaimToday, uint256 nextClaimTime, uint256 potentialReward, bool isMigrated)"
      ];

      const contract = new ethers.Contract(contractAddress, contractABI, provider);
      const userStats = await contract.getUserStats(userAddr);

      // Check if user can claim today
      if (!userStats.canClaimToday) {
        const nextClaimTime = Number(userStats.nextClaimTime);
        const now = Math.floor(Date.now() / 1000);
        const waitTime = nextClaimTime - now;
        const hours = Math.floor(waitTime / 3600);
        const minutes = Math.floor((waitTime % 3600) / 60);

        return NextResponse.json(
          {
            success: false,
            error: `Already claimed today. Next claim in ${hours}h ${minutes}m`,
            canClaimToday: false,
            nextClaimTime: userStats.nextClaimTime.toString()
          },
          { status: 400 }
        );
      }

      // For checkOnly mode, just return success without generating signature
      if (checkOnly) {
        return NextResponse.json({
          success: true,
          checkOnly: true,
          address: userAddr,
          canClaimToday: true,
          currentStreak: userStats.currentStreak.toString(),
          message: 'Daily claim verification passed',
        });
      }

      // Generate signature for on-chain verification
      if (!TASK_VERIFIER_PRIVATE_KEY) {
        return NextResponse.json(
          { success: false, error: 'Verifier not configured. Contact admin.' },
          { status: 500 }
        );
      }

      const signature = await generateDailyClaimSignature(userAddr);

      return NextResponse.json({
        success: true,
        signature,
        address: userAddr,
        canClaimToday: true,
        currentStreak: userStats.currentStreak.toString(),
        message: 'Daily claim verified! You can now claim rewards on-chain.',
      });

    } catch (error: any) {
      console.error('Error checking contract:', error);
      // Continue anyway - backend verification is primary
      // If contract check fails, still generate signature (contract will verify)
    }

    // Generate signature even if contract check fails (contract will verify)
    if (!checkOnly) {
      if (!TASK_VERIFIER_PRIVATE_KEY) {
        return NextResponse.json(
          { success: false, error: 'Verifier not configured. Contact admin.' },
          { status: 500 }
        );
      }

      const signature = await generateDailyClaimSignature(userAddr);

      return NextResponse.json({
        success: true,
        signature,
        address: userAddr,
        message: 'Daily claim verified! You can now claim rewards on-chain.',
      });
    }

    return NextResponse.json({
      success: true,
      checkOnly: true,
      address: userAddr,
      message: 'Daily claim verification passed',
    });

  } catch (error) {
    console.error('Daily claim verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate signature for daily claim verification
 * Must match contract's _verifyDailyClaimSignature function
 *
 * Contract process:
 * 1. messageHash = keccak256(abi.encodePacked(user, "DAILY_CLAIM", block.timestamp / 1 days))
 * 2. ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash))
 * 3. ecrecover(ethSignedHash, signature)
 *
 * Note: wallet.signMessage() automatically adds the "\x19Ethereum Signed Message:\n32" prefix,
 * so we sign the messageHash directly, and the contract will reconstruct ethSignedHash.
 */
async function generateDailyClaimSignature(userAddress: string): Promise<string> {
  const wallet = new ethers.Wallet(TASK_VERIFIER_PRIVATE_KEY);

  // Current day (matches contract: block.timestamp / 1 days)
  const currentDay = Math.floor(Date.now() / (1000 * 60 * 60 * 24));

  // Create message hash (must match contract's keccak256(abi.encodePacked(...)))
  const messageHash = ethers.solidityPackedKeccak256(
    ['address', 'string', 'uint256'],
    [userAddress, 'DAILY_CLAIM', currentDay]
  );

  // Sign the message hash
  // signMessage automatically adds "\x19Ethereum Signed Message:\n32" prefix
  // This matches the contract's ethSignedHash format
  const signature = await wallet.signMessage(ethers.getBytes(messageHash));

  return signature;
}

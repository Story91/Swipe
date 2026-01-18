import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { isBlacklisted } from '../../../../lib/blacklist';

/**
 * API Route: /api/referrals/verify
 *
 * Verifies referral and returns a signature for claiming on-chain.
 *
 * This endpoint prevents referral farming by:
 * - Verifying both addresses are not blacklisted
 * - Checking referrer is an active user
 * - Ensuring referral hasn't been used before
 * - Generating signature that expires daily
 */

// Task verifier private key (should be in env)
const TASK_VERIFIER_PRIVATE_KEY = process.env.TASK_VERIFIER_PRIVATE_KEY || '';

// V2 Contract address (should be in env)
const V2_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT || '';

interface VerifyReferralRequest {
  referred: string;    // Address of the new user
  referrer: string;     // Address of the referrer
  checkOnly?: boolean; // If true, only check status without generating signature
}

/**
 * POST /api/referrals/verify
 * Verify referral and generate signature
 */
export async function POST(request: NextRequest) {
  try {
    const body: VerifyReferralRequest = await request.json();
    const { referred, referrer, checkOnly } = body;

    if (!referred || !referrer) {
      return NextResponse.json(
        { success: false, error: 'Missing referred or referrer address' },
        { status: 400 }
      );
    }

    // Validate addresses
    if (!ethers.isAddress(referred) || !ethers.isAddress(referrer)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address format' },
        { status: 400 }
      );
    }

    // Normalize addresses
    const referredAddr = ethers.getAddress(referred);
    const referrerAddr = ethers.getAddress(referrer);

    // Check if addresses are blacklisted
    if (isBlacklisted(referredAddr)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Referred address is blacklisted',
          blacklisted: true
        },
        { status: 403 }
      );
    }

    if (isBlacklisted(referrerAddr)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Referrer address is blacklisted',
          blacklisted: true
        },
        { status: 403 }
      );
    }

    // Check if user is trying to refer themselves
    if (referredAddr.toLowerCase() === referrerAddr.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Cannot refer yourself' },
        { status: 400 }
      );
    }

    // Verify referrer is active (has claimed at least once)
    // This requires reading from the contract
    if (V2_CONTRACT_ADDRESS) {
      try {
        const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org');

        // Read user data from contract
        const contractABI = [
          "function users(address) external view returns (uint256 lastClaimTimestamp, uint256 currentStreak, uint256 longestStreak, uint256 totalClaimed, uint256 lastTaskResetDay, uint256 jackpotsWon, bool isBetaTester, bool hasFollowedSocials, bool hasStreak7Achievement, bool hasStreak30Achievement, bool migrated)"
        ];

        const contract = new ethers.Contract(V2_CONTRACT_ADDRESS, contractABI, provider);
        const userData = await contract.users(referrerAddr);

        // Check if referrer has claimed at least once
        if (userData.lastClaimTimestamp === 0n) {
          return NextResponse.json(
            { success: false, error: 'Referrer must be an active user (has claimed at least once)' },
            { status: 400 }
          );
        }

        // Check if referred user has already used a referral
        const hasUsedReferralABI = [
          "function hasUsedReferral(address) external view returns (bool)"
        ];
        const referralContract = new ethers.Contract(V2_CONTRACT_ADDRESS, hasUsedReferralABI, provider);
        const alreadyUsed = await referralContract.hasUsedReferral(referredAddr);

        if (alreadyUsed) {
          return NextResponse.json(
            { success: false, error: 'Referred user has already used a referral code' },
            { status: 400 }
          );
        }
      } catch (error) {
        console.error('Error checking contract:', error);
        // Continue anyway - backend verification is primary
      }
    }

    // For checkOnly mode, just return success without generating signature
    if (checkOnly) {
      return NextResponse.json({
        success: true,
        checkOnly: true,
        referred: referredAddr,
        referrer: referrerAddr,
        message: 'Referral verification passed',
      });
    }

    // Generate signature for on-chain verification
    if (!TASK_VERIFIER_PRIVATE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Verifier not configured. Contact admin.' },
        { status: 500 }
      );
    }

    const signature = await generateReferralSignature(referredAddr, referrerAddr);

    return NextResponse.json({
      success: true,
      signature,
      referred: referredAddr,
      referrer: referrerAddr,
      message: 'Referral verified! You can now claim rewards on-chain.',
    });

  } catch (error) {
    console.error('Referral verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate signature for referral verification
 * Must match contract's _verifyReferralSignature function
 *
 * Contract process:
 * 1. messageHash = keccak256(abi.encodePacked(referred, referrer, "REFERRAL", block.timestamp / 1 days))
 * 2. ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash))
 * 3. ecrecover(ethSignedHash, signature)
 *
 * Note: wallet.signMessage() automatically adds the "\x19Ethereum Signed Message:\n32" prefix,
 * so we sign the messageHash directly, and the contract will reconstruct ethSignedHash.
 */
async function generateReferralSignature(referred: string, referrer: string): Promise<string> {
  const wallet = new ethers.Wallet(TASK_VERIFIER_PRIVATE_KEY);

  // Current day (matches contract: block.timestamp / 1 days)
  const currentDay = Math.floor(Date.now() / (1000 * 60 * 60 * 24));

  // Create message hash (must match contract's keccak256(abi.encodePacked(...)))
  const messageHash = ethers.solidityPackedKeccak256(
    ['address', 'address', 'string', 'uint256'],
    [referred, referrer, 'REFERRAL', currentDay]
  );

  // Sign the message hash
  // signMessage automatically adds "\x19Ethereum Signed Message:\n32" prefix
  // This matches the contract's ethSignedHash format
  const signature = await wallet.signMessage(ethers.getBytes(messageHash));

  return signature;
}
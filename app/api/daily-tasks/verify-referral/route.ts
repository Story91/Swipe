import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

/**
 * API Route: /api/daily-tasks/verify-referral
 * 
 * Verifies that both the user and referrer have valid Farcaster accounts
 * before allowing a referral to be registered on-chain.
 * 
 * This prevents Sybil attacks where users create multiple wallets to farm referral rewards.
 */

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';

interface VerifyReferralRequest {
  userAddress: string;
  referrerAddress: string;
}

interface FarcasterUser {
  fid: number;
  username: string;
  custody_address?: string;
  verified_addresses?: {
    eth_addresses?: string[];
  };
}

/**
 * Get Farcaster user by connected Ethereum address
 */
async function getFarcasterUserByAddress(address: string): Promise<FarcasterUser | null> {
  if (!NEYNAR_API_KEY) {
    console.warn('⚠️ Neynar API key not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address.toLowerCase()}`,
      {
        headers: {
          'accept': 'application/json',
          'x-api-key': NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) {
      console.error('Neynar API error:', response.status);
      return null;
    }

    const data = await response.json();
    
    // The response is keyed by lowercase address
    const users = data[address.toLowerCase()];
    if (users && users.length > 0) {
      return users[0];
    }

    return null;
  } catch (error) {
    console.error('Error fetching Farcaster user:', error);
    return null;
  }
}

/**
 * Check if a Farcaster account was created recently (potential Sybil)
 * Returns true if account is suspicious (created within last 7 days)
 */
async function isRecentFarcasterAccount(fid: number): Promise<boolean> {
  if (!NEYNAR_API_KEY) return false;

  try {
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
      {
        headers: {
          'accept': 'application/json',
          'x-api-key': NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) return false;

    const data = await response.json();
    const user = data.users?.[0];
    
    if (!user) return false;

    // Check profile creation date if available
    // Neynar doesn't directly expose creation date, but we can check follower count
    // as a proxy for account age/legitimacy
    const followerCount = user.follower_count || 0;
    const followingCount = user.following_count || 0;
    
    // Suspicious if very low engagement (likely new/fake account)
    if (followerCount < 5 && followingCount < 10) {
      console.log(`⚠️ Suspicious account FID ${fid}: ${followerCount} followers, ${followingCount} following`);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking account age:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyReferralRequest = await request.json();
    const { userAddress, referrerAddress } = body;

    // Validate addresses
    if (!userAddress || !referrerAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing userAddress or referrerAddress' },
        { status: 400 }
      );
    }

    if (!ethers.isAddress(userAddress) || !ethers.isAddress(referrerAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address format' },
        { status: 400 }
      );
    }

    if (userAddress.toLowerCase() === referrerAddress.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Cannot refer yourself' },
        { status: 400 }
      );
    }

    // Check if Neynar API is configured - REQUIRED for referral verification
    if (!NEYNAR_API_KEY) {
      console.error('❌ Neynar API key not configured - referrals disabled');
      return NextResponse.json({
        success: false,
        error: 'Referral system is temporarily unavailable. Please try again later.',
        code: 'API_NOT_CONFIGURED',
      }, { status: 503 });
    }

    // Get Farcaster accounts for both addresses
    console.log(`🔍 Verifying referral: user=${userAddress}, referrer=${referrerAddress}`);
    
    const [userFarcaster, referrerFarcaster] = await Promise.all([
      getFarcasterUserByAddress(userAddress),
      getFarcasterUserByAddress(referrerAddress),
    ]);

    // User must have a Farcaster account
    if (!userFarcaster) {
      return NextResponse.json({
        success: false,
        error: 'You must connect a Farcaster account to use referral codes. Connect your wallet to Farcaster first!',
        code: 'NO_FARCASTER_USER',
      }, { status: 400 });
    }

    // Referrer must have a Farcaster account
    if (!referrerFarcaster) {
      return NextResponse.json({
        success: false,
        error: 'Invalid referral code. The referrer does not have a connected Farcaster account.',
        code: 'NO_FARCASTER_REFERRER',
      }, { status: 400 });
    }

    // Check they are different Farcaster accounts (prevent same person with multiple wallets)
    if (userFarcaster.fid === referrerFarcaster.fid) {
      return NextResponse.json({
        success: false,
        error: 'Both wallets are connected to the same Farcaster account. Nice try! 😏',
        code: 'SAME_FARCASTER_ACCOUNT',
      }, { status: 400 });
    }

    // Check if user's Farcaster account is suspicious (very new/low engagement)
    const isSuspicious = await isRecentFarcasterAccount(userFarcaster.fid);
    if (isSuspicious) {
      return NextResponse.json({
        success: false,
        error: 'Your Farcaster account is too new. Build some engagement first before using referral codes!',
        code: 'SUSPICIOUS_ACCOUNT',
      }, { status: 400 });
    }

    // All checks passed!
    console.log(`✅ Referral verified: user FID=${userFarcaster.fid} (${userFarcaster.username}), referrer FID=${referrerFarcaster.fid} (${referrerFarcaster.username})`);

    return NextResponse.json({
      success: true,
      user: {
        fid: userFarcaster.fid,
        username: userFarcaster.username,
      },
      referrer: {
        fid: referrerFarcaster.fid,
        username: referrerFarcaster.username,
      },
    });

  } catch (error) {
    console.error('❌ Referral verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}


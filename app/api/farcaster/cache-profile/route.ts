import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_KEYS, CachedFarcasterProfile } from '../../../../lib/redis';

// TTL for cached profiles: 7 days in seconds
const PROFILE_CACHE_TTL = 7 * 24 * 60 * 60;

/**
 * Cache a Farcaster profile to Redis
 * Called when user performs an action (stake, create prediction, etc.)
 * This reduces Neynar API calls by caching profile data from sdk.context
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, profile } = body;

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Address is required' },
        { status: 400 }
      );
    }

    // Validate profile data
    if (!profile || typeof profile !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Profile data is required' },
        { status: 400 }
      );
    }

    const cachedProfile: CachedFarcasterProfile = {
      fid: profile.fid?.toString() || null,
      username: profile.username || null,
      display_name: profile.displayName || profile.display_name || null,
      pfp_url: profile.pfpUrl || profile.pfp_url || null,
      address: address.toLowerCase(),
      cached_at: Date.now()
    };

    // Save to Redis with TTL
    const key = REDIS_KEYS.FARCASTER_PROFILE(address);
    await redis.set(key, JSON.stringify(cachedProfile), { ex: PROFILE_CACHE_TTL });

    console.log(`✅ Cached Farcaster profile for ${address}:`, cachedProfile.display_name || cachedProfile.username || 'wallet-only');

    return NextResponse.json({
      success: true,
      message: 'Profile cached successfully',
      profile: cachedProfile
    });

  } catch (error) {
    console.error('❌ Error caching Farcaster profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to cache profile' },
      { status: 500 }
    );
  }
}

/**
 * Get cached profiles for multiple addresses (batch read using MGET)
 * Used by Active Swipers section to get profiles without calling Neynar
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const addressesParam = searchParams.get('addresses');

    if (!addressesParam) {
      return NextResponse.json(
        { success: false, error: 'Addresses parameter is required' },
        { status: 400 }
      );
    }

    const addresses = addressesParam.split(',').map(a => a.trim().toLowerCase());
    
    if (addresses.length === 0) {
      return NextResponse.json({
        success: true,
        profiles: [],
        cached: 0,
        missing: 0
      });
    }

    // Build keys for MGET
    const keys = addresses.map(addr => REDIS_KEYS.FARCASTER_PROFILE(addr));
    
    // Batch read all profiles in one operation
    const results = await redis.mget<string[]>(...keys);
    
    const profiles: CachedFarcasterProfile[] = [];
    const missingAddresses: string[] = [];

    results.forEach((result, index) => {
      if (result) {
        try {
          const parsed = typeof result === 'string' ? JSON.parse(result) : result;
          profiles.push(parsed as CachedFarcasterProfile);
        } catch {
          missingAddresses.push(addresses[index]);
        }
      } else {
        missingAddresses.push(addresses[index]);
      }
    });

    console.log(`📊 Profile cache: ${profiles.length} cached, ${missingAddresses.length} missing`);

    return NextResponse.json({
      success: true,
      profiles,
      cached: profiles.length,
      missing: missingAddresses.length,
      missingAddresses
    });

  } catch (error) {
    console.error('❌ Error getting cached profiles:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get cached profiles' },
      { status: 500 }
    );
  }
}


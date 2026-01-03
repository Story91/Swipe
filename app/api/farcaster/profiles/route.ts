import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_KEYS, CachedFarcasterProfile } from '../../../../lib/redis';

// TTL for cached profiles: 7 days in seconds
const PROFILE_CACHE_TTL = 7 * 24 * 60 * 60;

interface FarcasterProfile {
  fid: string | null;
  address: string;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
  verified_addresses?: {
    eth_addresses: string[];
    sol_addresses: string[];
  };
  isBaseVerified?: boolean;
  isWalletOnly?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const { addresses } = await request.json();

    if (!addresses || !Array.isArray(addresses)) {
      return NextResponse.json(
        { success: false, error: 'Addresses array is required' },
        { status: 400 }
      );
    }

    if (addresses.length === 0) {
      return NextResponse.json({
        success: true,
        profiles: []
      });
    }

    const normalizedAddresses = addresses.map((a: string) => a.toLowerCase());
    const profiles: FarcasterProfile[] = [];
    let cachedCount = 0;
    let neynarCount = 0;

    // Step 1: Check Redis cache first (batch read with MGET)
    console.log(`🔍 Checking Redis cache for ${normalizedAddresses.length} addresses...`);
    
    const cacheKeys = normalizedAddresses.map(addr => REDIS_KEYS.FARCASTER_PROFILE(addr));
    const cachedResults = await redis.mget<(string | null)[]>(...cacheKeys);
    
    const missingAddresses: string[] = [];
    const addressToOriginal: Record<string, string> = {};
    
    // Map normalized to original addresses
    addresses.forEach((addr: string) => {
      addressToOriginal[addr.toLowerCase()] = addr;
    });

    // Process cached results
    cachedResults.forEach((result, index) => {
      const normalizedAddr = normalizedAddresses[index];
      const originalAddr = addressToOriginal[normalizedAddr] || normalizedAddr;
      
      if (result) {
        try {
          const cached: CachedFarcasterProfile = typeof result === 'string' ? JSON.parse(result) : result;
          
          // Check if cache is still valid (within TTL)
          const cacheAge = Date.now() - cached.cached_at;
          const maxAge = PROFILE_CACHE_TTL * 1000; // Convert to milliseconds
          
          if (cacheAge < maxAge) {
            profiles.push({
              fid: cached.fid,
              address: originalAddr,
              username: cached.username,
              display_name: cached.display_name,
              pfp_url: cached.pfp_url,
              verified_addresses: {
                eth_addresses: [originalAddr],
                sol_addresses: []
              },
              isBaseVerified: false,
              isWalletOnly: !cached.fid
            });
            cachedCount++;
            return;
          }
        } catch (parseError) {
          console.warn(`⚠️ Failed to parse cached profile for ${normalizedAddr}:`, parseError);
        }
      }
      
      // Add to missing addresses list
      missingAddresses.push(originalAddr);
    });

    console.log(`📊 Cache results: ${cachedCount} cached, ${missingAddresses.length} missing`);

    // Step 2: Fetch missing addresses from Neynar API
    if (missingAddresses.length > 0 && process.env.NEYNAR_API_KEY) {
      console.log(`🌐 Fetching ${missingAddresses.length} profiles from Neynar API...`);
      
      // Split addresses into chunks of 10 to avoid API limits
      const chunkSize = 10;
      const addressChunks: string[][] = [];
      for (let i = 0; i < missingAddresses.length; i += chunkSize) {
        addressChunks.push(missingAddresses.slice(i, i + chunkSize));
      }

      // Process each chunk
      for (let chunkIndex = 0; chunkIndex < addressChunks.length; chunkIndex++) {
        const chunk = addressChunks[chunkIndex];
        const addressesParam = chunk.join(',');
        const neynarUrl = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addressesParam}`;

        try {
          const response = await fetch(neynarUrl, {
            method: 'GET',
            headers: {
              'accept': 'application/json',
              'api_key': process.env.NEYNAR_API_KEY
            }
          });

          if (!response.ok) {
            console.warn(`⚠️ Neynar API error for chunk ${chunkIndex + 1}: ${response.status} ${response.statusText}`);
            
            // For failed chunks, add wallet-only profiles
            for (const address of chunk) {
              profiles.push({
                fid: null,
                address: address,
                username: null,
                display_name: null,
                pfp_url: null,
                verified_addresses: {
                  eth_addresses: [address],
                  sol_addresses: []
                },
                isBaseVerified: false,
                isWalletOnly: true
              });
            }
            continue;
          }

          const data = await response.json();

          // Process each address in this chunk
          for (const address of chunk) {
            const addressLower = address.toLowerCase();
            const userData = data[addressLower];

            let profile: FarcasterProfile;

            if (userData && userData.length > 0) {
              // Found real Farcaster profile
              const user = userData[0];
              profile = {
                fid: user.fid.toString(),
                address: address,
                username: user.username,
                display_name: user.display_name,
                pfp_url: user.pfp_url,
                verified_addresses: user.verified_addresses,
                isBaseVerified: false,
                isWalletOnly: false
              };
              neynarCount++;
              console.log(`✅ Found Farcaster profile for ${address}: ${user.display_name} (@${user.username})`);
            } else {
              // No Farcaster profile found
              profile = {
                fid: null,
                address: address,
                username: null,
                display_name: null,
                pfp_url: null,
                verified_addresses: {
                  eth_addresses: [address],
                  sol_addresses: []
                },
                isBaseVerified: false,
                isWalletOnly: true
              };
            }

            profiles.push(profile);

            // Cache the profile in Redis for future requests
            const cachedProfile: CachedFarcasterProfile = {
              fid: profile.fid,
              username: profile.username,
              display_name: profile.display_name,
              pfp_url: profile.pfp_url,
              address: addressLower,
              cached_at: Date.now()
            };

            // Fire and forget - don't wait for cache write
            redis.set(
              REDIS_KEYS.FARCASTER_PROFILE(addressLower), 
              JSON.stringify(cachedProfile), 
              { ex: PROFILE_CACHE_TTL }
            ).catch(err => console.warn('Cache write failed:', err));
          }

          // Add delay between chunks to avoid rate limiting
          if (chunkIndex < addressChunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (chunkError) {
          console.warn(`⚠️ Error processing chunk ${chunkIndex + 1}:`, chunkError);
          
          // For failed chunks, add wallet-only profiles
          for (const address of chunk) {
            profiles.push({
              fid: null,
              address: address,
              username: null,
              display_name: null,
              pfp_url: null,
              verified_addresses: {
                eth_addresses: [address],
                sol_addresses: []
              },
              isBaseVerified: false,
              isWalletOnly: true
            });
          }
        }
      }
    } else if (missingAddresses.length > 0) {
      // No Neynar API key - add wallet-only profiles for missing addresses
      console.log(`⚠️ No Neynar API key, adding ${missingAddresses.length} wallet-only profiles`);
      
      for (const address of missingAddresses) {
        profiles.push({
          fid: null,
          address: address,
          username: null,
          display_name: null,
          pfp_url: null,
          verified_addresses: {
            eth_addresses: [address],
            sol_addresses: []
          },
          isBaseVerified: false,
          isWalletOnly: true
        });
      }
    }

    console.log(`✅ Total profiles: ${profiles.length} (${cachedCount} from cache, ${neynarCount} from Neynar)`);

    return NextResponse.json({
      success: true,
      profiles: profiles,
      stats: {
        total: profiles.length,
        fromCache: cachedCount,
        fromNeynar: neynarCount,
        walletOnly: profiles.filter(p => p.isWalletOnly).length
      }
    });

  } catch (error) {
    console.error('Error fetching Farcaster profiles:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profiles' },
      { status: 500 }
    );
  }
}

// Alternative endpoint to fetch profiles by FIDs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fids = searchParams.get('fids');

    if (!fids) {
      return NextResponse.json(
        { success: false, error: 'FIDs parameter is required' },
        { status: 400 }
      );
    }

    if (!process.env.NEYNAR_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Neynar API key not configured' },
        { status: 500 }
      );
    }

    const fidArray = fids.split(',').map(fid => parseInt(fid.trim()));

    try {
      // Use real Neynar API to fetch user profiles by FIDs
      const fidsParam = fidArray.join(',');
      const neynarUrl = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fidsParam}`;
      
      const response = await fetch(neynarUrl, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'api_key': process.env.NEYNAR_API_KEY
        }
      });
      
      if (!response.ok) {
        throw new Error(`Neynar API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return NextResponse.json({
        success: true,
        profiles: data.users.map((user: any) => ({
          fid: user.fid.toString(),
          username: user.username,
          display_name: user.display_name,
          pfp_url: user.pfp_url,
          verified_addresses: user.verified_addresses
        }))
      });
    } catch (neynarError) {
      console.error('Neynar API error:', neynarError);
      
      // Fallback to mock profiles
      const mockProfiles = fidArray.map(fid => ({
        fid: fid.toString(),
        username: `user_${fid}`,
        display_name: `User ${fid}`,
        pfp_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${fid}`,
        verified_addresses: {
          eth_addresses: [],
          sol_addresses: []
        }
      }));

      return NextResponse.json({
        success: true,
        profiles: mockProfiles,
        fallback: true
      });
    }

  } catch (error) {
    console.error('Error fetching Farcaster profiles:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profiles' },
      { status: 500 }
    );
  }
}

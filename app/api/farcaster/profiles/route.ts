import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { addresses } = await request.json();

    if (!addresses || !Array.isArray(addresses)) {
      return NextResponse.json(
        { success: false, error: 'Addresses array is required' },
        { status: 400 }
      );
    }

    if (!process.env.NEYNAR_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Neynar API key not configured' },
        { status: 500 }
      );
    }

    // Try to fetch real Farcaster profiles using Neynar API
    try {
      const profiles = [];
      
      // Split addresses into chunks of 10 to avoid API limits
      const chunkSize = 10;
      const addressChunks = [];
      for (let i = 0; i < addresses.length; i += chunkSize) {
        addressChunks.push(addresses.slice(i, i + chunkSize));
      }
      
      console.log(`🔍 Fetching Farcaster profiles for ${addresses.length} addresses in ${addressChunks.length} chunks`);
      
      // Process each chunk
      for (let chunkIndex = 0; chunkIndex < addressChunks.length; chunkIndex++) {
        const chunk = addressChunks[chunkIndex];
        const addressesParam = chunk.join(',');
        const neynarUrl = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addressesParam}`;
        
        console.log(`🔍 Fetching chunk ${chunkIndex + 1}/${addressChunks.length}: ${chunk.length} addresses`);
        
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
            continue; // Skip this chunk and continue with next
          }
          
          const data = await response.json();
          console.log(`✅ Neynar API response for chunk ${chunkIndex + 1}:`, data);
          
          // Process each address in this chunk
          for (const address of chunk) {
            const addressLower = address.toLowerCase();
            const userData = data[addressLower];
        
            if (userData && userData.length > 0) {
              // Found real Farcaster profile
              const user = userData[0]; // Take the first user if multiple found
              profiles.push({
                fid: user.fid.toString(),
                address: address,
                username: user.username,
                display_name: user.display_name,
                pfp_url: user.pfp_url,
                verified_addresses: user.verified_addresses,
                isBaseVerified: false
              });
              console.log(`✅ Found Farcaster profile for ${address}: ${user.display_name} (@${user.username}) - FID: ${user.fid}`);
            } else {
              // No Farcaster profile found - return wallet info with Base verification check
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
                isBaseVerified: false, // We'll check this separately
                isWalletOnly: true
              });
              console.log(`⚠️ No Farcaster profile found for ${address}, will show wallet avatar`);
            }
          }
          
          // Add delay between chunks to avoid rate limiting
          if (chunkIndex < addressChunks.length - 1) {
            console.log(`⏳ Waiting 1 second before next chunk...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (chunkError) {
          console.warn(`⚠️ Error processing chunk ${chunkIndex + 1}:`, chunkError);
          continue; // Skip this chunk and continue with next
        }
      }
      
      console.log(`✅ Processed ${addressChunks.length} chunks, found ${profiles.length} profiles`);
      
      return NextResponse.json({
        success: true,
        profiles: profiles
      });

    } catch (neynarError) {
      console.error('Neynar API error:', neynarError);
      
      // Fallback to mock profiles if Neynar API fails
      const mockProfiles = addresses.map((address, index) => ({
        fid: Math.abs(address.split('').reduce((a: number, b: string) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0)).toString(),
        address: address,
        username: `user_${address.slice(2, 6)}`,
        display_name: `User ${address.slice(2, 6)}`,
        pfp_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${address.slice(2, 6)}`,
        verified_addresses: {
          eth_addresses: [address],
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
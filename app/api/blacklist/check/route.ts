import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { isBlacklisted } from '../../../../lib/blacklist';

/**
 * GET /api/blacklist/check?address=0x...
 * Check if an address is blacklisted
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Address parameter is required' },
        { status: 400 }
      );
    }

    // Validate address format
    if (!ethers.isAddress(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address format' },
        { status: 400 }
      );
    }

    const blacklisted = isBlacklisted(address);

    return NextResponse.json({
      success: true,
      address: address.toLowerCase(),
      blacklisted,
    });

  } catch (error) {
    console.error('Blacklist check error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}


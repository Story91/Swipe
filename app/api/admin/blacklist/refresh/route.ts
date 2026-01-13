import { NextRequest, NextResponse } from 'next/server';
import { invalidateBlacklistCache } from '../../../../lib/blacklist';

/**
 * POST /api/admin/blacklist/refresh
 * Manually refresh blacklist cache (useful after updating blacklist.txt)
 * 
 * Note: This is an admin endpoint. In production, add authentication!
 */
export async function POST(request: NextRequest) {
  try {
    // TODO: Add admin authentication here
    // const adminKey = request.headers.get('x-admin-key');
    // if (adminKey !== process.env.ADMIN_KEY) {
    //   return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    // }

    invalidateBlacklistCache();
    
    return NextResponse.json({
      success: true,
      message: 'Blacklist cache invalidated. Changes will be visible within 5 minutes or immediately on next request.',
    });

  } catch (error) {
    console.error('Blacklist refresh error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}


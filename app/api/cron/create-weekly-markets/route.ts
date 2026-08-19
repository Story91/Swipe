import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { isCronAuthorized } from '@/lib/marketRoutine/routeAuth';
import { createWeeklyMarkets } from '@/lib/marketRoutine/createWeeklyMarkets';
import { realCreateDeps } from '@/lib/marketRoutine/serverDeps';
import type { ChainKey } from '@/lib/chains';

export const dynamic = 'force-dynamic';

const ROUTINE_CHAINS: ChainKey[] = ['base', 'robinhood'];

/**
 * Vercel Cron calls GET with the bearer secret and creates on both chains.
 *
 * Each chain gets its own try/catch: one chain throwing (a bad RPC, a
 * misconfigured writer) must not stop the other chain from being attempted,
 * and the response still reports what happened on both.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const results = [];
  for (const chainKey of ROUTINE_CHAINS) {
    try {
      results.push(await createWeeklyMarkets(realCreateDeps(), { chainKey, dryRun: false }));
    } catch (error) {
      console.error(`❌ create-weekly-markets cron failed for ${chainKey}:`, error);
      results.push({
        chain: chainKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  return NextResponse.json({ success: true, results });
}

/** The admin card calls POST, one chain at a time, dry run unless told live. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, 'routine');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const chainKey: ChainKey = body.chain === 'robinhood' ? 'robinhood' : 'base';
    const dryRun = body.dryRun !== false;
    const result = await createWeeklyMarkets(realCreateDeps(), { chainKey, dryRun });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('❌ create-weekly-markets manual run failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

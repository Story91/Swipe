import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_KEYS } from '@/lib/redis';
import { USDCPricePoint } from '@/lib/types/redis';
import { chainFromRequest } from '@/lib/chains/requestChain';
import { parseBatchIds, BATCH_IDS_PARAM } from '@/lib/priceHistoryBatch';

/**
 * Many markets' price history in one read.
 *
 * The desktop grid puts a sparkline on every card. Asking the single route per
 * card is 24 HTTP round trips to Upstash for one page, which is the shape that
 * made /api/activity take 153 seconds before it was batched. One mget answers
 * the page.
 *
 * This is a cache read and nothing else. The single route falls back to the
 * contract when it needs a fresh point; that fallback stays there, on the
 * screen that is worth 24 chain reads. Here, an id with nothing cached comes
 * back with an empty history, and the caller draws that as the empty state
 * rather than as a line.
 *
 * Same conventions as the per-id route it sits beside: the same key helper, the
 * same chain handling (absent means Base, present but unknown is a 400), and
 * the same `{ success, data }` / `{ success, error }` envelope.
 */

// GET - Retrieve price history for several predictions at once
export async function GET(request: NextRequest) {
  try {
    // Market 1 has a price history on each chain and they are different lines.
    // Absent ?chain= means Base, where the existing histories were written.
    const requested = chainFromRequest(request);
    if (!requested.ok) {
      return NextResponse.json({ success: false, error: requested.error }, { status: 400 });
    }

    let raw: string | null = null;
    try {
      raw = new URL(request.url).searchParams.get(BATCH_IDS_PARAM);
    } catch {
      // A URL this malformed will fail elsewhere too; treat it as no ids given.
      raw = null;
    }

    const parsed = parseBatchIds(raw);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    // At most MAX_BATCH_IDS keys, so one mget rather than the chunked loop the
    // full prediction index needs.
    const keys = parsed.ids.map((id) => REDIS_KEYS.USDC_PRICE_HISTORY(id, requested.chain));
    const rows = (await redis.mget(...keys)) as unknown[];

    const histories = parsed.ids.map((predictionId, index) => ({
      predictionId,
      ...readStored(rows[index]),
    }));

    return NextResponse.json({
      success: true,
      data: {
        chain: requested.chain,
        histories,
      },
    });
  } catch (error) {
    console.error('Error fetching batch price history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch price history' },
      { status: 500 }
    );
  }
}

/**
 * One stored record, or an empty history.
 *
 * Parsed per row, inside its own try. The single route parses one record and a
 * corrupt one costs that one request; here a single unreadable value would cost
 * the other 23 markets their charts, which is a worse trade than showing one
 * card its honest empty state.
 */
function readStored(row: unknown): { history: USDCPricePoint[]; lastUpdated: number } {
  const empty = { history: [] as USDCPricePoint[], lastUpdated: 0 };
  if (!row) return empty;

  try {
    const record = typeof row === 'string' ? JSON.parse(row) : row;
    if (!record || typeof record !== 'object') return empty;

    const history = (record as { history?: unknown }).history;
    const lastUpdated = (record as { lastUpdated?: unknown }).lastUpdated;

    return {
      history: Array.isArray(history) ? (history as USDCPricePoint[]) : [],
      lastUpdated: typeof lastUpdated === 'number' ? lastUpdated : 0,
    };
  } catch {
    return empty;
  }
}

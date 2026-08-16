import { NextResponse } from 'next/server';
import type { NewsItem } from '@/lib/types/news';

/**
 * GET /api/news - crypto news for the desktop side panels.
 *
 * This exists because min-api.cryptocompare.com serves no
 * Access-Control-Allow-Origin header, so the browser cannot call it directly -
 * it fails CORS in every environment, not just locally. Fetching server-side
 * sidesteps CORS entirely and lets one upstream response be shared by every
 * visitor instead of one request per browser.
 */

const UPSTREAM = 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&limit=10';
const UPSTREAM_TIMEOUT_MS = 8000;

// The same headlines serve every visitor, so cache rather than hitting the
// upstream once per page load.
const REVALIDATE_SECONDS = 300;
export const revalidate = 300;

interface CryptoCompareArticle {
  title?: string;
  body?: string;
  url?: string;
  source?: string;
  published_on?: number;
  imageurl?: string;
  categories?: string;
}

function toNewsItem(article: CryptoCompareArticle): NewsItem {
  return {
    title: article.title || 'No title',
    description: article.body?.substring(0, 150) || 'No description',
    url: article.url || '#',
    source: article.source || 'CryptoCompare',
    // published_on is unix seconds; guard against it being absent so we never
    // emit "Invalid Date".
    publishedAt: article.published_on
      ? new Date(article.published_on * 1000).toISOString()
      : new Date().toISOString(),
    imageUrl: article.imageurl || undefined,
    categories: article.categories || 'General',
  };
}

export async function GET() {
  try {
    // CryptoCompare stopped serving this endpoint anonymously and now answers
    // 401 without a key. Set CRYPTOCOMPARE_API_KEY to get live headlines;
    // without it the route returns 502 and the panels fall back to static content.
    const apiKey = process.env.CRYPTOCOMPARE_API_KEY;

    const upstream = await fetch(UPSTREAM, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
      headers: apiKey ? { authorization: `Apikey ${apiKey}` } : undefined,
    });

    if (!upstream.ok) {
      const hint =
        upstream.status === 401 && !apiKey
          ? ' (CRYPTOCOMPARE_API_KEY is not set)'
          : '';
      console.error(`❌ News upstream returned ${upstream.status}${hint}`);
      return NextResponse.json(
        { success: false, error: `Upstream returned ${upstream.status}`, items: [] },
        { status: 502 }
      );
    }

    const payload = await upstream.json();
    const items: NewsItem[] = Array.isArray(payload?.Data)
      ? payload.Data.map(toNewsItem)
      : [];

    return NextResponse.json({ success: true, items });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    console.error('❌ Failed to fetch news:', error);
    return NextResponse.json(
      {
        success: false,
        error: isTimeout ? 'Upstream timed out' : 'Failed to fetch news',
        items: [],
      },
      { status: 502 }
    );
  }
}

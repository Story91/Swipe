import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { redis, redisHelpers, REDIS_KEYS } from '@/lib/redis';
import { CHAIN_PARAM, resolveChainParam } from '@/lib/chains/requestChain';
import { DEFAULT_CHAIN_KEY } from '@/lib/chains';
import { getFeeBps } from '@/lib/chains/fees';
import { stakeLegs, tokenSymbol } from '@/lib/userStake';
import { formatLegAmount, pnlFigures, type PnlPosition } from './figures';

/**
 * No `runtime = 'edge'` any more.
 *
 * The fee rates come off the contract now, and the module that reads them
 * reaches lib/contract.ts, which `require()`s a compiled Hardhat artifact and
 * pulls in ethers. Neither survives the edge bundle. The sibling card at
 * /api/og/usdc-prediction runs on the default runtime and renders the same way,
 * so this is the shape that is already proven in production here.
 */

/** The card, whenever there is nothing true to put on it. */
function fallbackCard(line: string) {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          backgroundColor: '#000000',
          color: '#d4ff00',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 60, fontWeight: 'bold' }}>SWIPE</div>
        <div style={{ display: 'flex', fontSize: 24, color: '#888888', marginTop: 20 }}>
          {line}
        </div>
      </div>
    ),
    { width: 1200, height: 628 }
  );
}

// Generate dynamic OG image for PNL
// This image will be shown when sharing PNL links on Farcaster/social media
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let userAddress = searchParams.get('user');
    let chainParam = searchParams.get(CHAIN_PARAM);

    // The Farcaster crawler fetches the card with the page URL in the referer
    // rather than in the query, so both values are recovered from there when
    // the request itself is missing them.
    //
    // Both, not just the address. Recovering the user and letting the chain
    // fall through to Base is how a Robinhood share came back rendered from
    // Base's pools: the wallet was right and the money was somebody else's.
    if (!userAddress || !chainParam) {
      const referer = request.headers.get('referer') || request.headers.get('x-forwarded-url');
      if (referer) {
        try {
          const refererUrl = new URL(referer);
          userAddress = userAddress || refererUrl.searchParams.get('user');
          chainParam = chainParam || refererUrl.searchParams.get(CHAIN_PARAM);
        } catch (e) {
          console.error('Error parsing referer URL:', e);
          // Ignore referer parsing errors
        }
      }
    }

    // PNL is per chain, since it is summed from one chain's pools. An unknown
    // chain falls back rather than 400s, because this endpoint returns an image
    // and a crawler renders whatever body it is handed.
    const requestedChain = resolveChainParam(chainParam);
    const chain = requestedChain.ok ? requestedChain.chain : DEFAULT_CHAIN_KEY;

    // Cached card, looked up on the chain that was asked for.
    //
    // The chain is settled above this block and not below it. The redirect used
    // to build a key with no chain in it at all: the value of `?chain=` was
    // parsed into a variable and then not used here, so whichever card the
    // wallet published last was served for every request afterwards, and an
    // explicit `?chain=robinhood` changed nothing about which one came back.
    if (userAddress) {
      try {
        const cacheKey = REDIS_KEYS.USER_PNL_OG_IMAGE(userAddress, chain);
        const cachedUrl = await redis.get(cacheKey);
        if (cachedUrl && typeof cachedUrl === 'string') {
          // Redirect to cached ImgBB URL (like crypto predictions do)
          return NextResponse.redirect(cachedUrl, 307);
        }
      } catch (error) {
        console.error('❌ Error checking Redis for cached PNL OG image:', error);
        // Continue to generate dynamic image
      }
    }

    if (!userAddress) {
      return fallbackCard('P&L overview');
    }

    let allPredictions;
    try {
      allPredictions = await redisHelpers.getAllPredictions(chain);
    } catch (error) {
      console.error('Error fetching predictions for OG image:', error);
      return fallbackCard('P&L overview');
    }

    if (!allPredictions || allPredictions.length === 0) {
      return fallbackCard('P&L overview');
    }

    /**
     * The user's legs, read by key rather than scanned.
     *
     * This used to call getUserStakes per market, which runs a Redis KEYS scan
     * over every staker on that market and then throws away all but one. The
     * stake key already contains the address, so one GET per market answers the
     * same question, and it is the same key /api/portfolio reads.
     *
     * Lowercased, because every writer lowercases: the V2 sync, the events
     * route and /api/sync/usdc all key on `address.toLowerCase()`. A share link
     * carrying a checksummed address would otherwise read an empty portfolio
     * and publish a card saying the user has never bet.
     */
    const who = userAddress.toLowerCase();
    const positions: PnlPosition[] = [];
    for (const prediction of allPredictions) {
      try {
        const stakeData = await redis.get(REDIS_KEYS.USER_STAKES(who, prediction.id, chain));
        if (!stakeData) continue;
        const stake = typeof stakeData === 'string' ? JSON.parse(stakeData) : stakeData;
        for (const leg of stakeLegs(stake)) {
          positions.push({ prediction, leg });
        }
      } catch (error) {
        console.error(`Error processing prediction ${prediction.id}:`, error);
      }
    }

    // Read, not written down. The contract's constructor default is 100 bps and
    // the deploy script raises it to 300 afterwards, so the obvious literal is
    // the wrong one. The card used to hardcode that wrong 1% and take no
    // creator fee at all, which overstated every winning position on it.
    const fees = await getFeeBps(chain);
    const figures = pnlFigures(positions, {
      platformBps: fees.platform,
      creatorBps: fees.creator,
    });

    // Nothing to report is a different picture from a flat P&L. A card reading
    // "0.00 USDC" and "+0%" looks like a broken render rather than a wallet
    // that has not bet on this chain.
    if (figures.bets === 0) {
      return fallbackCard('no bets on this chain yet');
    }

    /**
     * One currency on the card, named on the card.
     *
     * The figures are the headline token's own totals and nothing else is
     * folded into them. Any other token the user holds is listed underneath, in
     * its own units, so a wallet with an archived ETH position still sees it
     * without it being converted into dollars at a rate nobody has.
     *
     * The symbol comes from the chain, so a Robinhood card says USDG where a
     * Base card says USDC. Both are stored under the leg named 'USDC'; the
     * storage key is not the token's name.
     */
    const symbol = tokenSymbol(figures.headline, chain);
    const isProfit = figures.profit >= 0;
    const stakedText = formatLegAmount(figures.staked, figures.headline);
    const profitText = formatLegAmount(figures.profit, figures.headline);
    const roiText = `${isProfit ? '+' : ''}${Math.round(figures.roi)}%`;
    const otherLegs = figures.others.map(
      (token) =>
        `${formatLegAmount(figures.byToken[token].invested, token)} ${tokenSymbol(token, chain)}`
    );

    const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://theswipe.app';
    const swiperImageUrl = `${BASE_URL}/swiper1.png`;

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            width: '100%',
            height: '100%',
            backgroundColor: '#0a0a0a',
            padding: '30px 40px',
            fontFamily: 'sans-serif',
            border: '2px solid #00ff41',
            borderRadius: '16px',
          }}
        >
          {/* Left Side - Stats */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              paddingRight: 40,
            }}
          >
            {/* Header - WINS/LOSSES */}
            <div
              style={{
                display: 'flex',
                gap: 30,
                marginBottom: 30,
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18, color: '#888888' }}>WINS:</span>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 'bold',
                    color: '#00ff41',
                    textShadow: '0 0 10px #00ff41',
                  }}
                >
                  {figures.wins}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18, color: '#888888' }}>LOSSES:</span>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 'bold',
                    color: '#ff0040',
                    textShadow: '0 0 10px #ff0040',
                  }}
                >
                  {figures.losses}
                </span>
              </div>
            </div>

            {/* Metrics */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 12, color: '#888888', marginBottom: 4 }}>
                  Total staked
                </span>
                <span style={{ fontSize: 20, fontWeight: 'bold', color: '#ffffff' }}>
                  {stakedText} {symbol}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 12, color: '#888888', marginBottom: 4 }}>
                  Total P&L
                </span>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 'bold',
                    color: isProfit ? '#00ff41' : '#ff0040',
                  }}
                >
                  {isProfit ? '+' : '-'}{profitText} {symbol}
                </span>
              </div>
              {otherLegs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 12, color: '#888888', marginBottom: 4 }}>
                    Also held, on archived contracts
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 'bold', color: '#888888' }}>
                    {otherLegs.join('  ·  ')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Side - Swiper Image and ROI */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              width: 400,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={swiperImageUrl}
              alt="Swiper"
              style={{
                width: 200,
                height: 200,
                objectFit: 'contain',
              }}
            />
            {/* ROI, of the headline token. A ratio inside one token is safe. */}
            <div
              style={{
                display: 'flex',
                fontSize: 64,
                fontWeight: 'bold',
                color: isProfit ? '#00ff41' : '#ff0040',
                textShadow: `0 0 20px ${isProfit ? '#00ff41' : '#ff0040'}`,
                marginTop: -20,
              }}
            >
              {roiText}
            </div>
            <div style={{ display: 'flex', fontSize: 16, color: '#888888', marginTop: 4 }}>
              ROI in {symbol}
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 628,
      }
    );
  } catch (error) {
    console.error('Error generating PNL OG image:', error);
    return fallbackCard('P&L overview');
  }
}

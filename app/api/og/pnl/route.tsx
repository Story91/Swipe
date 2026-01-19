import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { redisHelpers, redis, REDIS_KEYS } from '@/lib/redis';

export const runtime = 'edge';

// Generate dynamic OG image for PNL
// This image will be shown when sharing PNL links on Farcaster/social media
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let userAddress = searchParams.get('user');
    
    // If user param not in query, try to extract from referer
    if (!userAddress) {
      const referer = request.headers.get('referer');
      if (referer) {
        try {
          const refererUrl = new URL(referer);
          userAddress = refererUrl.searchParams.get('user');
        } catch (e) {
          // Ignore referer parsing errors
        }
      }
    }

    // If we have user address, check Redis for cached ImgBB URL (like crypto predictions)
    if (userAddress) {
      try {
        const userAddressLower = userAddress.toLowerCase();
        const cacheKey = REDIS_KEYS.USER_PNL_OG_IMAGE(userAddressLower);
        const cachedUrl = await redis.get(cacheKey);
        if (cachedUrl && typeof cachedUrl === 'string') {
          // Redirect to cached ImgBB URL (like crypto predictions do)
          return NextResponse.redirect(cachedUrl, 307);
        }
      } catch (error) {
        console.error('Error checking Redis for cached PNL OG image:', error);
        // Continue to generate dynamic image
      }
    }

    if (!userAddress) {
      // Return default image if no user address
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
              P&L Overview
            </div>
          </div>
        ),
        {
          width: 1200,
          height: 628,
        }
      );
    }

    // Fetch all predictions and calculate PNL for user
    let allPredictions;
    try {
      allPredictions = await redisHelpers.getAllPredictions();
      if (!allPredictions || allPredictions.length === 0) {
        console.warn('No predictions found in Redis');
        // Return default image if no predictions
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
                P&L Overview
              </div>
            </div>
          ),
          {
            width: 1200,
            height: 628,
          }
        );
      }
    } catch (error) {
      console.error('Error fetching predictions for OG image:', error);
      // Return default image on error
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
              P&L Overview
            </div>
          </div>
        ),
        {
          width: 1200,
          height: 628,
        }
      );
    }
    
    let totalStaked = 0;
    let totalPayout = 0;
    let totalProfit = 0;
    let wins = 0;
    let losses = 0;
    let roi = 0;

    // Calculate PNL from all predictions
    for (const prediction of allPredictions) {
      try {
        const stakes = await redisHelpers.getUserStakes(prediction.id);
        const userStakes = stakes.filter(
          (s) => s.user.toLowerCase() === userAddress.toLowerCase()
        );

        if (userStakes.length === 0) continue;

        // Process each stake (ETH and SWIPE are separate entries)
        for (const userStake of userStakes) {
          const yesAmount = Number(userStake.yesAmount) || 0;
          const noAmount = Number(userStake.noAmount) || 0;
          const staked = yesAmount + noAmount;

          if (staked === 0) continue;

          const tokenType = userStake.tokenType || 'ETH';
          const isSwipeStake = tokenType === 'SWIPE';
          
          // Get the correct pools based on token type
          const yesPool = isSwipeStake 
            ? (prediction.swipeYesTotalAmount || 0) 
            : (prediction.yesTotalAmount || 0);
          const noPool = isSwipeStake 
            ? (prediction.swipeNoTotalAmount || 0) 
            : (prediction.noTotalAmount || 0);

          let potentialPayout = 0;
          let potentialProfit = 0;
          let isWinner = false;

          if (prediction.resolved && !prediction.cancelled) {
            // Prediction is resolved - calculate actual payout
            const userChoice = yesAmount > noAmount ? 'YES' : 'NO';
            const userWinningStake = userChoice === 'YES' ? yesAmount : noAmount;
            
            if (prediction.outcome === (userChoice === 'YES')) {
              // User won
              isWinner = true;
              const winnersPool = prediction.outcome ? yesPool : noPool;
              const losersPool = prediction.outcome ? noPool : yesPool;

              if (winnersPool > 0) {
                // Platform fee is 1% (100 basis points)
                const platformFee = (losersPool * 100) / 10000;
                const netLosersPool = losersPool - platformFee;
                const payoutRatio = netLosersPool / winnersPool;
                potentialPayout = userWinningStake * (1 + payoutRatio);
                potentialProfit = potentialPayout - staked;
              }
            } else {
              // User lost
              potentialPayout = 0;
              potentialProfit = -staked;
            }
          } else if (!prediction.resolved && prediction.deadline && prediction.deadline > Date.now() / 1000) {
            // Prediction is active - calculate potential payout
            const userChoice = yesAmount > noAmount ? 'YES' : 'NO';
            const userWinningStake = userChoice === 'YES' ? yesAmount : noAmount;
            const winningPool = userChoice === 'YES' ? yesPool : noPool;
            const losingPool = userChoice === 'YES' ? noPool : yesPool;

            if (winningPool > 0) {
              const payoutRatio = losingPool / winningPool;
              potentialPayout = userWinningStake * (1 + payoutRatio);
              potentialProfit = potentialPayout - staked;
            }
          } else {
            // Expired or cancelled - no payout
            potentialPayout = 0;
            potentialProfit = -staked;
          }

          totalStaked += staked;
          totalPayout += potentialPayout;
          totalProfit += potentialProfit;

          if (prediction.resolved) {
            if (isWinner) {
              wins++;
            } else if (potentialProfit < 0) {
              losses++;
            }
          }
        }
      } catch (error) {
        console.error(`Error processing prediction ${prediction.id}:`, error);
      }
    }

    // Calculate ROI
    if (totalStaked > 0) {
      roi = (totalProfit / totalStaked) * 100;
    }

    const isProfit = totalProfit >= 0;

    // Format amounts
    const formatEth = (wei: number): string => {
      const eth = wei / 1e18;
      if (eth >= 1) return eth.toFixed(4);
      if (eth >= 0.01) return eth.toFixed(6);
      return eth.toFixed(8);
    };

    const formatSwipe = (wei: number): string => {
      const swipe = wei / 1e18;
      if (swipe >= 1000000) return (swipe / 1000000).toFixed(1) + 'M';
      if (swipe >= 1000) return (swipe / 1000).toFixed(0) + 'K';
      return swipe.toFixed(0);
    };

    const totalStakedFormatted = totalStaked > 0 ? formatEth(totalStaked) : '0';
    const totalProfitFormatted = totalProfit !== 0 ? formatEth(Math.abs(totalProfit)) : '0';
    const roiFormatted = Math.round(roi);

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
                  {wins}
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
                  {losses}
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
                  Total Staked:
                </span>
                <span style={{ fontSize: 20, fontWeight: 'bold', color: '#ffffff' }}>
                  {totalStakedFormatted} ETH
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 12, color: '#888888', marginBottom: 4 }}>
                  Total P&L:
                </span>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 'bold',
                    color: isProfit ? '#00ff41' : '#ff0040',
                  }}
                >
                  {isProfit ? '+' : '-'}{totalProfitFormatted} ETH
                </span>
              </div>
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
            {/* Swiper Image */}
            <img
              src={swiperImageUrl}
              alt="Swiper"
              style={{
                width: 200,
                height: 200,
                objectFit: 'contain',
              }}
            />
            {/* ROI Percentage */}
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
              {isProfit ? '+' : ''}{roiFormatted}%
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
    
    // Return error image
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
            P&L Overview
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 628,
      }
    );
  }
}

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { redisHelpers } from '@/lib/redis';

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
    const allPredictions = await redisHelpers.getAllPredictions();
    
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
        const userStake = stakes.find(
          (s: any) => s.user.toLowerCase() === userAddress.toLowerCase()
        );

        if (!userStake) continue;

        const ethStake = userStake.ethStake;
        const swipeStake = userStake.swipeStake;

        if (ethStake) {
          const staked = (ethStake.yesAmount || 0) + (ethStake.noAmount || 0);
          const payout = ethStake.potentialPayout || 0;
          const profit = ethStake.potentialProfit || 0;

          totalStaked += staked;
          totalPayout += payout;
          totalProfit += profit;

          if (prediction.resolved) {
            if (ethStake.isWinner) {
              wins++;
            } else if (profit < 0) {
              losses++;
            }
          }
        }

        if (swipeStake) {
          const staked = (swipeStake.yesAmount || 0) + (swipeStake.noAmount || 0);
          const payout = swipeStake.potentialPayout || 0;
          const profit = swipeStake.potentialProfit || 0;

          totalStaked += staked;
          totalPayout += payout;
          totalProfit += profit;

          if (prediction.resolved) {
            if (swipeStake.isWinner) {
              wins++;
            } else if (profit < 0) {
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

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            backgroundColor: '#0a0a0a',
            padding: '40px 60px',
            fontFamily: 'sans-serif',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 30,
              width: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                backgroundColor: '#00ff41',
                color: '#000000',
                padding: '12px 32px',
                borderRadius: 20,
                fontSize: 24,
                fontWeight: 'bold',
              }}
            >
              P&L Overview
            </div>
          </div>

          {/* Main Content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
              width: '100%',
              maxWidth: 800,
            }}
          >
            {/* Wins/Losses Row */}
            <div
              style={{
                display: 'flex',
                gap: 40,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', fontSize: 16, color: '#888888', marginBottom: 8 }}>
                  WINS
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 48,
                    fontWeight: 'bold',
                    color: '#00ff41',
                    textShadow: '0 0 20px #00ff41',
                  }}
                >
                  {wins}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', fontSize: 16, color: '#888888', marginBottom: 8 }}>
                  LOSSES
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 48,
                    fontWeight: 'bold',
                    color: '#ff0040',
                    textShadow: '0 0 20px #ff0040',
                  }}
                >
                  {losses}
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div
              style={{
                display: 'flex',
                gap: 32,
                justifyContent: 'center',
                alignItems: 'center',
                marginTop: 20,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', fontSize: 14, color: '#888888', marginBottom: 8 }}>
                  Total Staked
                </div>
                <div style={{ display: 'flex', fontSize: 28, fontWeight: 'bold', color: '#ffffff' }}>
                  {totalStakedFormatted} ETH
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', fontSize: 14, color: '#888888', marginBottom: 8 }}>
                  Total P&L
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 28,
                    fontWeight: 'bold',
                    color: isProfit ? '#00ff41' : '#ff0040',
                  }}
                >
                  {isProfit ? '+' : '-'}{totalProfitFormatted} ETH
                </div>
              </div>
            </div>

            {/* ROI */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginTop: 20,
              }}
            >
              <div style={{ display: 'flex', fontSize: 14, color: '#888888', marginBottom: 8 }}>
                ROI
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 72,
                  fontWeight: 'bold',
                  color: isProfit ? '#00ff41' : '#ff0040',
                  textShadow: `0 0 30px ${isProfit ? '#00ff41' : '#ff0040'}`,
                }}
              >
                {isProfit ? '+' : ''}{roiFormatted}%
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              marginTop: 40,
              fontSize: 14,
              color: '#666666',
            }}
          >
            theswipe.app
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

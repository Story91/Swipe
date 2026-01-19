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

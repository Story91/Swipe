import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { redisHelpers } from '@/lib/redis';

export const runtime = 'edge';

// Generate dynamic OG image for predictions
// This image will be shown when sharing prediction links on Farcaster/social media
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Fetch prediction data
    const prediction = await redisHelpers.getPrediction(id);
    
    if (!prediction) {
      // Return default image if prediction not found
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
            <div style={{ fontSize: 60, fontWeight: 'bold' }}>SWIPE</div>
            <div style={{ fontSize: 24, color: '#888888', marginTop: 20 }}>
              Prediction not found
            </div>
          </div>
        ),
        {
          width: 1200,
          height: 630,
        }
      );
    }

    // Calculate stats
    const totalPool = prediction.yesTotalAmount + prediction.noTotalAmount;
    const yesPercentage = totalPool > 0 ? Math.round((prediction.yesTotalAmount / totalPool) * 100) : 50;
    const noPercentage = 100 - yesPercentage;
    
    // Format time left
    const now = Date.now() / 1000;
    const timeLeft = prediction.deadline - now;
    let timeLeftText = 'Ended';
    
    if (timeLeft > 0) {
      const days = Math.floor(timeLeft / 86400);
      const hours = Math.floor((timeLeft % 86400) / 3600);
      
      if (days > 0) {
        timeLeftText = `${days}d ${hours}h left`;
      } else if (hours > 0) {
        const minutes = Math.floor((timeLeft % 3600) / 60);
        timeLeftText = `${hours}h ${minutes}m left`;
      } else {
        const minutes = Math.floor(timeLeft / 60);
        timeLeftText = `${minutes}m left`;
      }
    }

    // Determine status
    const isResolved = prediction.resolved;
    const statusText = isResolved 
      ? (prediction.outcome ? 'YES Won!' : 'NO Won!') 
      : (timeLeft <= 0 ? 'Awaiting Resolution' : 'Active');
    const statusColor = isResolved 
      ? (prediction.outcome ? '#22c55e' : '#ef4444') 
      : '#d4ff00';

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            backgroundColor: '#0a0a0a',
            padding: 40,
            fontFamily: 'sans-serif',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 30,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 'bold',
                  color: '#d4ff00',
                }}
              >
                🔮 SWIPE
              </div>
            </div>
            
            {/* Status Badge */}
            <div
              style={{
                display: 'flex',
                backgroundColor: statusColor,
                color: isResolved ? '#ffffff' : '#000000',
                padding: '8px 20px',
                borderRadius: 20,
                fontSize: 20,
                fontWeight: 'bold',
              }}
            >
              {statusText}
            </div>
          </div>

          {/* Main Content */}
          <div
            style={{
              display: 'flex',
              flex: 1,
              gap: 40,
            }}
          >
            {/* Left side - Question & Stats */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                justifyContent: 'center',
              }}
            >
              {/* Category */}
              <div
                style={{
                  display: 'flex',
                  backgroundColor: '#d4ff00',
                  color: '#000000',
                  padding: '6px 16px',
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 'bold',
                  marginBottom: 16,
                  width: 'fit-content',
                }}
              >
                {prediction.category.toUpperCase()}
              </div>

              {/* Question */}
              <div
                style={{
                  display: 'flex',
                  fontSize: 42,
                  fontWeight: 'bold',
                  color: '#ffffff',
                  lineHeight: 1.2,
                  marginBottom: 30,
                  maxWidth: '90%',
                }}
              >
                {prediction.question.length > 80 
                  ? prediction.question.substring(0, 80) + '...' 
                  : prediction.question
                }
              </div>

              {/* Stats Row */}
              <div
                style={{
                  display: 'flex',
                  gap: 40,
                  marginBottom: 30,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 14, color: '#888888' }}>Total Pool</div>
                  <div style={{ fontSize: 28, fontWeight: 'bold', color: '#d4ff00' }}>
                    {totalPool.toFixed(4)} ETH
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 14, color: '#888888' }}>Participants</div>
                  <div style={{ fontSize: 28, fontWeight: 'bold', color: '#d4ff00' }}>
                    {prediction.participants?.length || 0}
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 14, color: '#888888' }}>Time</div>
                  <div style={{ fontSize: 28, fontWeight: 'bold', color: '#d4ff00' }}>
                    {timeLeftText}
                  </div>
                </div>
              </div>

              {/* Odds Bar */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: '100%',
                  maxWidth: 500,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#22c55e' }}>
                    YES {yesPercentage}%
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#ef4444' }}>
                    NO {noPercentage}%
                  </div>
                </div>
                
                <div
                  style={{
                    display: 'flex',
                    width: '100%',
                    height: 16,
                    backgroundColor: '#ef4444',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${yesPercentage}%`,
                      height: '100%',
                      backgroundColor: '#22c55e',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Right side - Image (if available) */}
            {prediction.imageUrl && (
              <div
                style={{
                  display: 'flex',
                  width: 300,
                  height: 300,
                  borderRadius: 20,
                  overflow: 'hidden',
                  border: '3px solid #d4ff00',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={prediction.imageUrl}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 20,
              paddingTop: 20,
              borderTop: '1px solid #333333',
            }}
          >
            <div style={{ fontSize: 18, color: '#888888' }}>
              swipe-predictions.vercel.app
            </div>
            <div
              style={{
                display: 'flex',
                backgroundColor: '#d4ff00',
                color: '#000000',
                padding: '10px 24px',
                borderRadius: 12,
                fontSize: 18,
                fontWeight: 'bold',
              }}
            >
              Place Your Bet →
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('Error generating OG image:', error);
    
    // Return fallback image on error
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
          <div style={{ fontSize: 60, fontWeight: 'bold' }}>🔮 SWIPE</div>
          <div style={{ fontSize: 24, color: '#ffffff', marginTop: 20 }}>
            Prediction Markets
          </div>
          <div style={{ fontSize: 18, color: '#888888', marginTop: 10 }}>
            Swipe to predict the future
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  }
}


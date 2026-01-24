import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { redisHelpers } from '@/lib/redis';

// Helper function to generate chart path
function generateChartPath(prices: number[], width: number, height: number): string {
  if (prices.length < 2) return '';
  
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;
  
  const points = prices.map((price, index) => {
    const x = (index / (prices.length - 1)) * width;
    const y = height - ((price - minPrice) / priceRange) * height;
    return `${x},${y}`;
  });
  
  return `M ${points.join(' L ')}`;
}

// Detect crypto from prediction
function detectCrypto(prediction: any) {
  const question = (prediction.question || '').toUpperCase();
  const selectedCrypto = prediction.selectedCrypto?.toUpperCase();
  
  if (selectedCrypto === 'BTC' || question.includes('BITCOIN') || question.includes('BTC')) {
    return { symbol: 'BTC', name: 'Bitcoin', coingeckoId: 'bitcoin', color: '#f7931a' };
  }
  if (selectedCrypto === 'ETH' || question.includes('ETHEREUM') || question.includes('ETH')) {
    return { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum', color: '#627eea' };
  }
  if (selectedCrypto === 'SOL' || question.includes('SOLANA') || question.includes('SOL')) {
    return { symbol: 'SOL', name: 'Solana', coingeckoId: 'solana', color: '#14f195' };
  }
  
  return null;
}

// Fetch chart data from CoinGecko
async function fetchChartData(coingeckoId: string): Promise<number[] | null> {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=7&interval=daily`,
      { next: { revalidate: 300 } } // Cache for 5 minutes
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.prices?.map((p: [number, number]) => p[1]) || null;
  } catch (error) {
    console.error('Error fetching chart data:', error);
    return null;
  }
}

// Calculate price change
function calculatePriceChange(prices: number[]): { change: number; isPositive: boolean } {
  if (prices.length < 2) return { change: 0, isPositive: true };
  
  const first = prices[0];
  const last = prices[prices.length - 1];
  const change = ((last - first) / first) * 100;
  
  return {
    change: Math.abs(change),
    isPositive: change >= 0
  };
}

// Get first sentence from description
function getFirstSentence(text: string): string {
  const m = text.match(/^[^.!?]*[.!?]/);
  if (m) return m[0].trim();
  return text.length > 120 ? text.slice(0, 120).trim() + '…' : text;
}

// Format time left
function formatDeadline(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = timestamp - now;
  
  if (diff < 0) return 'Ended';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Format pool amount
function formatPool(amount: number): string {
  const usdcAmount = amount / 1e6;
  if (usdcAmount >= 1000) return `$${(usdcAmount / 1000).toFixed(1)}k`;
  if (usdcAmount > 0) return `$${usdcAmount.toFixed(2)}`;
  return '$0.00';
}

// Generate dynamic OG image for USDC predictions - looks like MarketCard
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Fetch prediction data
    const prediction = await redisHelpers.getPrediction(id);
    
    if (!prediction) {
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
              backgroundColor: '#d4ff00',
              color: '#000000',
              fontFamily: 'sans-serif',
            }}
          >
            <div style={{ display: 'flex', fontSize: 60, fontWeight: 'bold' }}>SWIPE</div>
            <div style={{ display: 'flex', fontSize: 24, color: '#666666', marginTop: 20 }}>
              Prediction not found
            </div>
          </div>
        ),
        {
          width: 1200,
          height: 628,
        }
      );
    }

    // Calculate USDC pools (6 decimals)
    const usdcYesPool = (prediction.usdcYesTotalAmount || 0) / 1e6;
    const usdcNoPool = (prediction.usdcNoTotalAmount || 0) / 1e6;
    const totalPoolUSDC = usdcYesPool + usdcNoPool;
    const yesPrice = totalPoolUSDC > 0 ? Math.round((usdcYesPool / totalPoolUSDC) * 100) : 50;
    const noPrice = 100 - yesPrice;
    
    // Format time left
    const now = Date.now() / 1000;
    const timeLeft = prediction.deadline - now;
    const timeLeftText = formatDeadline(prediction.deadline);
    const isLive = timeLeft > 0 && !prediction.resolved && !prediction.cancelled;
    
    // Get image URL
    const imageUrl = prediction.imageUrl && !prediction.imageUrl.includes('geckoterminal.com') 
      ? prediction.imageUrl 
      : null;
    
    // Get first sentence of description
    const description = prediction.description ? getFirstSentence(prediction.description) : null;
    const hasMoreDescription = prediction.description && prediction.description.length > (description?.length || 0);

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            backgroundColor: '#d4ff00', // Lime green background like in MarketCard
            padding: '40px',
            fontFamily: 'sans-serif',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Market Card - white card with green border */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              maxWidth: '1120px',
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              padding: '12px',
              border: '2px solid #d4ff00', // Green border like MarketCard
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
            }}
          >
            {/* Header - Image and Question */}
            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '12px',
              }}
            >
              {/* Image */}
              {imageUrl ? (
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    flexShrink: 0,
                    backgroundColor: '#f5f5f5',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '10px',
                    backgroundColor: '#f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: '24px',
                  }}
                >
                  📊
                </div>
              )}
              
              {/* Question and Description */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3
                  style={{
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color: '#000000',
                    margin: 0,
                    marginBottom: description ? '4px' : '0',
                    lineHeight: 1.3,
                  }}
                >
                  {prediction.question.length > 60 
                    ? prediction.question.substring(0, 60) + '...' 
                    : prediction.question}
                </h3>
                {description && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <p
                      style={{
                        fontSize: '12px',
                        color: '#666666',
                        margin: 0,
                        lineHeight: 1.4,
                      }}
                    >
                      {description}
                    </p>
                    {hasMoreDescription && (
                      <span
                        style={{
                          fontSize: '12px',
                          color: '#3b82f6',
                          textDecoration: 'underline',
                          marginTop: '2px',
                        }}
                      >
                        Read more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Price Buttons - YES and NO */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '10px',
              }}
            >
              {/* YES Button */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid #cfcfcf',
                  backgroundColor: '#ffffff',
                }}
              >
                <span style={{ fontSize: '12px', color: '#666666', marginBottom: '4px' }}>YES</span>
                <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>{yesPrice}¢</span>
              </div>
              
              {/* NO Button */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid #000000',
                  backgroundColor: '#1a1a1a',
                }}
              >
                <span style={{ fontSize: '12px', color: '#ffffff', marginBottom: '4px' }}>NO</span>
                <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#ef4444' }}>{noPrice}¢</span>
              </div>
            </div>

            {/* Footer - Stats Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                paddingTop: '10px',
                borderTop: '1px solid #f0f0f0',
              }}
            >
              {/* LIVE Badge */}
              {isLive && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    fontSize: '9px',
                    padding: '3px 6px',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                  }}
                >
                  <span>●</span>
                  <span>LIVE</span>
                </div>
              )}
              
              {/* Pool Badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: 'rgba(212, 255, 0, 0.1)',
                  border: '1px solid rgba(212, 255, 0, 0.3)',
                  color: '#7cb800',
                  fontSize: '11px',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontWeight: '600',
                }}
              >
                {formatPool(totalPoolUSDC * 1e6)}
              </div>
              
              {/* Time Badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: 'rgba(100, 116, 139, 0.1)',
                  border: '1px solid rgba(100, 116, 139, 0.3)',
                  color: '#64748b',
                  fontSize: '11px',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontWeight: '500',
                }}
              >
                <span>🕐</span>
                <span>{timeLeftText}</span>
              </div>
              
              {/* Expand Arrow */}
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  border: '1px solid #cfcfcf',
                  backgroundColor: '#f9fafb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 'auto',
                }}
              >
                <span style={{ fontSize: '16px', color: '#333333' }}>›</span>
              </div>
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
    console.error('Error generating USDC OG image:', error);
    
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
            backgroundColor: '#d4ff00',
            color: '#000000',
            fontFamily: 'sans-serif',
          }}
        >
          <div style={{ display: 'flex', fontSize: 60, fontWeight: 'bold' }}>SWIPE</div>
          <div style={{ display: 'flex', fontSize: 24, color: '#666666', marginTop: 20 }}>
            Error generating image
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

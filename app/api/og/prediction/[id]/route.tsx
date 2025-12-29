import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { redisHelpers } from '@/lib/redis';

export const runtime = 'edge';

// Crypto data with CoinGecko IDs for fetching price data
const CRYPTO_DATA: Record<string, { logo: string; color: string; name: string; coingeckoId: string }> = {
  'BTC': { logo: 'https://cryptologos.cc/logos/bitcoin-btc-logo.png', color: '#f7931a', name: 'Bitcoin', coingeckoId: 'bitcoin' },
  'ETH': { logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.png', color: '#627eea', name: 'Ethereum', coingeckoId: 'ethereum' },
  'SOL': { logo: 'https://cryptologos.cc/logos/solana-sol-logo.png', color: '#9945ff', name: 'Solana', coingeckoId: 'solana' },
  'XRP': { logo: 'https://cryptologos.cc/logos/xrp-xrp-logo.png', color: '#23292f', name: 'Ripple', coingeckoId: 'ripple' },
  'BNB': { logo: 'https://cryptologos.cc/logos/bnb-bnb-logo.png', color: '#f3ba2f', name: 'BNB', coingeckoId: 'binancecoin' },
  'SWIPE': { logo: 'https://theswipe.app/splash.png', color: '#d4ff00', name: 'SWIPE', coingeckoId: '' }, // No CoinGecko ID for SWIPE
};

// Detect crypto symbol from imageUrl or selectedCrypto
function detectCrypto(prediction: { imageUrl?: string; selectedCrypto?: string; question?: string; includeChart?: boolean }): { logo: string; color: string; name: string; coingeckoId: string; symbol: string } | null {
  console.log('🔍 detectCrypto called with:', {
    selectedCrypto: prediction.selectedCrypto,
    includeChart: prediction.includeChart,
    imageUrl: prediction.imageUrl?.slice(0, 50),
  });
  
  // First check selectedCrypto
  if (prediction.selectedCrypto) {
    const symbol = prediction.selectedCrypto.toUpperCase();
    if (CRYPTO_DATA[symbol]) {
      console.log('✅ Found crypto from selectedCrypto:', symbol);
      return { ...CRYPTO_DATA[symbol], symbol };
    }
  }
  
  // Check if includeChart is true (crypto prediction)
  if (prediction.includeChart) {
    // Try to detect from question
    const question = prediction.question?.toUpperCase() || '';
    for (const [symbol, data] of Object.entries(CRYPTO_DATA)) {
      if (question.includes(symbol) || question.includes(data.name.toUpperCase())) {
        console.log('✅ Found crypto from question (includeChart):', symbol);
        return { ...data, symbol };
      }
    }
  }
  
  // Check if imageUrl contains geckoterminal
  if (prediction.imageUrl?.includes('geckoterminal.com')) {
    // Try to detect from question
    const question = prediction.question?.toUpperCase() || '';
    for (const [symbol, data] of Object.entries(CRYPTO_DATA)) {
      if (question.includes(symbol) || question.includes(data.name.toUpperCase())) {
        console.log('✅ Found crypto from question (geckoterminal):', symbol);
        return { ...data, symbol };
      }
    }
    // Default to ETH
    console.log('⚠️ Defaulting to ETH for geckoterminal');
    return { ...CRYPTO_DATA['ETH'], symbol: 'ETH' };
  }
  
  console.log('❌ No crypto detected');
  return null;
}

// Fetch price chart data from CoinGecko (last 7 days)
async function fetchChartData(coingeckoId: string): Promise<number[] | null> {
  if (!coingeckoId) {
    console.log('⚠️ No coingeckoId provided');
    return null;
  }
  
  try {
    console.log('📊 Fetching chart data for:', coingeckoId);
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=7`,
      { 
        headers: {
          'Accept': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      console.error('❌ CoinGecko API error:', response.status, response.statusText);
      return null;
    }
    
    const data = await response.json();
    // Extract just the prices (data.prices is [[timestamp, price], ...])
    const prices: number[] = data.prices?.map((p: [number, number]) => p[1]) || [];
    
    console.log('✅ Got', prices.length, 'price points');
    
    // Reduce to ~30 points for smooth chart
    if (prices.length > 30) {
      const step = Math.floor(prices.length / 30);
      return prices.filter((_, i) => i % step === 0);
    }
    
    return prices;
  } catch (error) {
    console.error('❌ Failed to fetch chart data:', error);
    return null;
  }
}

// Generate SVG path for mini chart
function generateChartPath(prices: number[], width: number, height: number): string {
  if (prices.length < 2) return '';
  
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;
  
  const points = prices.map((price, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = height - ((price - minPrice) / priceRange) * height;
    return `${x},${y}`;
  });
  
  return `M ${points.join(' L ')}`;
}

// Calculate price change percentage
function calculatePriceChange(prices: number[]): { change: number; isPositive: boolean } {
  if (prices.length < 2) return { change: 0, isPositive: true };
  
  const first = prices[0];
  const last = prices[prices.length - 1];
  const change = ((last - first) / first) * 100;
  
  return { change: Math.abs(change), isPositive: change >= 0 };
}

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
            <div style={{ display: 'flex', fontSize: 60, fontWeight: 'bold' }}>SWIPE</div>
            <div style={{ display: 'flex', fontSize: 24, color: '#888888', marginTop: 20 }}>
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

    // Detect crypto and fetch chart data
    const cryptoData = detectCrypto(prediction);
    let chartPrices: number[] | null = null;
    let priceChange = { change: 0, isPositive: true };
    let currentPrice = 0;
    
    if (cryptoData?.coingeckoId) {
      chartPrices = await fetchChartData(cryptoData.coingeckoId);
      if (chartPrices && chartPrices.length > 0) {
        priceChange = calculatePriceChange(chartPrices);
        currentPrice = chartPrices[chartPrices.length - 1];
      }
    }

    // Calculate stats - convert from wei to ETH
    const totalPoolWei = prediction.yesTotalAmount + prediction.noTotalAmount;
    const totalPoolETH = totalPoolWei / 1e18;
    const yesPercentage = totalPoolWei > 0 ? Math.round((prediction.yesTotalAmount / totalPoolWei) * 100) : 50;
    const noPercentage = 100 - yesPercentage;
    
    // SWIPE pool stats
    const swipeYes = (prediction.swipeYesTotalAmount || 0) / 1e18;
    const swipeNo = (prediction.swipeNoTotalAmount || 0) / 1e18;
    const totalSwipe = swipeYes + swipeNo;
    
    // Format SWIPE amount
    const formatSwipe = (amount: number): string => {
      if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
      if (amount >= 1000) return (amount / 1000).toFixed(0) + 'K';
      return amount.toFixed(0);
    };
    
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
            backgroundColor: '#d4ff00',
            padding: '24px 80px',
            fontFamily: 'sans-serif',
            alignItems: 'center',
          }}
        >
          {/* Header - centered, just status badge */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 20,
              width: '100%',
            }}
          >
            {/* Status Badge */}
            <div
              style={{
                display: 'flex',
                backgroundColor: isResolved ? statusColor : '#000000',
                color: '#ffffff',
                padding: '8px 24px',
                borderRadius: 20,
                fontSize: 18,
                fontWeight: 'bold',
              }}
            >
              {statusText}
            </div>
          </div>

          {/* Main Content - centered, horizontal layout */}
          <div
            style={{
              display: 'flex',
              flex: 1,
              gap: 24,
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
            }}
          >
            {/* Left side - Question & Stats */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                maxWidth: 580,
              }}
            >
              {/* Category */}
              <div
                style={{
                  display: 'flex',
                  backgroundColor: '#000000',
                  color: '#d4ff00',
                  padding: '4px 12px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 'bold',
                  marginBottom: 12,
                  alignSelf: 'flex-start',
                }}
              >
                {prediction.category.toUpperCase()}
              </div>

              {/* Question */}
              <div
                style={{
                  display: 'flex',
                  fontSize: 28,
                  fontWeight: 'bold',
                  color: '#000000',
                  lineHeight: 1.2,
                  marginBottom: 16,
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
                  gap: 24,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', fontSize: 12, color: '#333333' }}>ETH Pool</div>
                  <div style={{ display: 'flex', fontSize: 20, fontWeight: 'bold', color: '#000000' }}>
                    {totalPoolETH.toFixed(4)} ETH
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', fontSize: 12, color: '#333333' }}>SWIPE Pool</div>
                  <div style={{ display: 'flex', fontSize: 20, fontWeight: 'bold', color: '#000000' }}>
                    {formatSwipe(totalSwipe)}
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', fontSize: 12, color: '#333333' }}>Participants</div>
                  <div style={{ display: 'flex', fontSize: 20, fontWeight: 'bold', color: '#000000' }}>
                    {prediction.participants?.length || 0}
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', fontSize: 12, color: '#333333' }}>Time</div>
                  <div style={{ display: 'flex', fontSize: 20, fontWeight: 'bold', color: '#000000' }}>
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
                  backgroundColor: '#000000',
                  padding: 12,
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                  }}
                >
                  <div style={{ display: 'flex', fontSize: 16, fontWeight: 'bold', color: '#22c55e' }}>
                    YES {yesPercentage}%
                  </div>
                  <div style={{ display: 'flex', fontSize: 16, fontWeight: 'bold', color: '#ef4444' }}>
                    NO {noPercentage}%
                  </div>
                </div>
                
                <div
                  style={{
                    display: 'flex',
                    width: '100%',
                    height: 12,
                    backgroundColor: '#ef4444',
                    borderRadius: 6,
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

            {/* Right side - Chart */}
            {cryptoData && chartPrices && chartPrices.length > 1 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: 280,
                  height: 260,
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: '3px solid #000000',
                  backgroundColor: '#000000',
                  padding: 14,
                  flexShrink: 0,
                }}
              >
                {/* Chart header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Crypto symbol circle */}
                    <div
                      style={{
                        display: 'flex',
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: cryptoData.color,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', fontSize: 12, fontWeight: 'bold', color: '#ffffff' }}>
                        {cryptoData.symbol.slice(0, 3)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>
                        {cryptoData.symbol}
                      </div>
                      <div style={{ display: 'flex', fontSize: 10, color: '#888888' }}>
                        {cryptoData.name}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', fontSize: 12, fontWeight: 'bold', color: '#ffffff' }}>
                      ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        fontSize: 11,
                        fontWeight: 'bold',
                        color: priceChange.isPositive ? '#22c55e' : '#ef4444',
                      }}
                    >
                      {priceChange.isPositive ? '▲' : '▼'} {priceChange.change.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Chart SVG */}
                <div
                  style={{
                    display: 'flex',
                    flex: 1,
                    width: 250,
                    height: 150,
                  }}
                >
                  <svg
                    width={250}
                    height={150}
                    viewBox="0 0 250 150"
                  >
                    {/* Grid lines */}
                    <line x1="0" y1="0" x2="250" y2="0" stroke="#333" strokeWidth="1" />
                    <line x1="0" y1="50" x2="250" y2="50" stroke="#333" strokeWidth="1" />
                    <line x1="0" y1="100" x2="250" y2="100" stroke="#333" strokeWidth="1" />
                    <line x1="0" y1="150" x2="250" y2="150" stroke="#333" strokeWidth="1" />
                    
                    {/* Area fill */}
                    <path
                      d={`${generateChartPath(chartPrices, 250, 140)} L 250,150 L 0,150 Z`}
                      fill={`${priceChange.isPositive ? '#22c55e' : '#ef4444'}20`}
                    />
                    
                    {/* Line */}
                    <path
                      d={generateChartPath(chartPrices, 250, 140)}
                      fill="none"
                      stroke={priceChange.isPositive ? '#22c55e' : '#ef4444'}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                {/* Chart footer */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginTop: 8,
                  }}
                >
                  <div style={{ display: 'flex', fontSize: 12, color: '#888888' }}>
                    7 Day Chart
                  </div>
                </div>
              </div>
            ) : cryptoData ? (
              // Crypto without chart data - show symbol
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: 200,
                  height: 200,
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: '2px solid #000000',
                  backgroundColor: '#000000',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 16,
                }}
              >
                {/* Crypto symbol circle - no external image */}
                <div
                  style={{
                    display: 'flex',
                    width: 100,
                    height: 100,
                    borderRadius: 50,
                    backgroundColor: '#d4ff00',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ display: 'flex', fontSize: 32, fontWeight: 'bold', color: '#000000' }}>
                    {cryptoData.symbol.slice(0, 3)}
                  </div>
                </div>
                <div style={{ display: 'flex', fontSize: 24, fontWeight: 'bold', color: '#d4ff00' }}>
                  {cryptoData.name}
                </div>
                <div style={{ display: 'flex', fontSize: 14, color: '#888888' }}>
                  📊 Price Chart
                </div>
              </div>
            ) : prediction.imageUrl && !prediction.imageUrl.includes('geckoterminal.com') ? (
              // Regular image
              <div
                style={{
                  display: 'flex',
                  width: 200,
                  height: 200,
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: '2px solid #000000',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={prediction.imageUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: 16,
              paddingTop: 16,
              borderTop: '2px solid #00000020',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', fontSize: 28, fontWeight: 'bold', color: '#000000' }}>
              theswipe.app
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
          <div style={{ display: 'flex', fontSize: 60, fontWeight: 'bold' }}>🔮 SWIPE</div>
          <div style={{ display: 'flex', fontSize: 24, color: '#ffffff', marginTop: 20 }}>
            Prediction Markets
          </div>
          <div style={{ display: 'flex', fontSize: 18, color: '#888888', marginTop: 10 }}>
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


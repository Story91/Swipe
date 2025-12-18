import { useState, useEffect, useCallback } from 'react';

interface TokenPrices {
  ethPrice: number | null;
  swipePrice: number | null;
  loading: boolean;
  error: string | null;
}

// SWIPE token address on Base
const SWIPE_TOKEN_ADDRESS = '0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9';

export function useTokenPrices(): TokenPrices & {
  formatUsdValue: (amount: number, token: 'ETH' | 'SWIPE') => string;
  getUsdValue: (amount: number, token: 'ETH' | 'SWIPE') => number | null;
} {
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [swipePrice, setSwipePrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch ETH price from CoinGecko
      const ethResponse = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
      );
      
      if (!ethResponse.ok) {
        throw new Error('Failed to fetch ETH price');
      }
      
      const ethData = await ethResponse.json();
      const fetchedEthPrice = ethData.ethereum?.usd;
      
      if (fetchedEthPrice) {
        setEthPrice(fetchedEthPrice);
      }

      // Fetch SWIPE price from DexScreener API (more reliable for newer tokens)
      try {
        const swipeResponse = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${SWIPE_TOKEN_ADDRESS}`
        );
        
        if (swipeResponse.ok) {
          const swipeData = await swipeResponse.json();
          // DexScreener returns pairs array, get the first pair's price
          if (swipeData.pairs && swipeData.pairs.length > 0) {
            const priceUsd = parseFloat(swipeData.pairs[0].priceUsd);
            if (!isNaN(priceUsd)) {
              setSwipePrice(priceUsd);
            }
          }
        }
      } catch (swipeError) {
        console.warn('Failed to fetch SWIPE price:', swipeError);
        // Don't fail the whole hook if SWIPE price fails
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching prices:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch prices');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    
    // Refresh prices every 60 seconds
    const interval = setInterval(fetchPrices, 60000);
    
    return () => clearInterval(interval);
  }, [fetchPrices]);

  // Get USD value for a given amount and token
  const getUsdValue = useCallback((amount: number, token: 'ETH' | 'SWIPE'): number | null => {
    if (token === 'ETH' && ethPrice) {
      return amount * ethPrice;
    }
    if (token === 'SWIPE' && swipePrice) {
      return amount * swipePrice;
    }
    return null;
  }, [ethPrice, swipePrice]);

  // Format USD value with proper formatting
  const formatUsdValue = useCallback((amount: number, token: 'ETH' | 'SWIPE'): string => {
    const usdValue = getUsdValue(amount, token);
    
    if (usdValue === null) {
      return '';
    }
    
    // Format based on value size
    if (usdValue < 0.01) {
      return `($${usdValue.toFixed(4)})`;
    } else if (usdValue < 1) {
      return `($${usdValue.toFixed(3)})`;
    } else if (usdValue < 100) {
      return `($${usdValue.toFixed(2)})`;
    } else if (usdValue < 10000) {
      return `($${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    } else {
      return `($${usdValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })})`;
    }
  }, [getUsdValue]);

  return {
    ethPrice,
    swipePrice,
    loading,
    error,
    formatUsdValue,
    getUsdValue,
  };
}


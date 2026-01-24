'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, 
  DollarSign,
  ChevronRight,
  ChevronLeft,
  Radio,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowRightLeft,
  Wallet,
  BarChart3,
  TrendingUp,
  Users,
  RefreshCw,
  HelpCircle,
  X
} from 'lucide-react';
import { XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart, CartesianGrid } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useHybridPredictions } from '../../../lib/hooks/useHybridPredictions';
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { 
  USDC_DUALPOOL_ABI, 
  USDC_DUALPOOL_CONTRACT_ADDRESS,
  USDC_TOKEN 
} from '../../../lib/contract';
import { ConnectWallet, Wallet as WalletContainer } from '@coinbase/onchainkit/wallet';
import './KalshiMarkets.css';

// ERC20 ABI for USDC approval
const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

interface PricePoint {
  timestamp: number;
  yesPrice: number;
  noPrice: number;
}

interface UserPosition {
  yesAmount: bigint;
  noAmount: bigint;
  claimed: boolean;
}

interface MarketCardProps {
  id: number;
  predictionId: string;
  title: string;
  description?: string;
  category: string;
  image?: string;
  selectedCrypto?: string;
  includeChart?: boolean;
  yesPool: number;
  noPool: number;
  deadline: number;
  participants: number;
  isLive?: boolean;
  creator?: string;
  usdcEnabled?: boolean;
  usdcYesPool?: number;
  usdcNoPool?: number;
  refreshKey?: number; // Used to trigger refetch of price history
  onBet: (predictionId: string, id: number, side: 'yes' | 'no') => void;
  onEarlyExit?: (predictionId: string, numericId: number, isYes: boolean, amount: bigint, netValue: bigint, fee: bigint, title: string) => void;
}

function MarketCard({ 
  id,
  predictionId,
  title,
  description,
  category, 
  image,
  selectedCrypto,
  includeChart,
  yesPool, 
  noPool, 
  deadline, 
  participants,
  isLive,
  usdcEnabled,
  usdcYesPool = 0,
  usdcNoPool = 0,
  refreshKey = 0,
  onBet,
  onEarlyExit
}: MarketCardProps) {
  const { address } = useAccount();
  const [hoveredSide, setHoveredSide] = useState<'yes' | 'no' | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Get numeric ID for contract calls
  const numericId = parseInt(predictionId.replace('pred_v2_', '').replace('pred_v1_', '').replace('pred_', ''), 10);
  
  // Fetch user's position in this market
  const { data: userPositionData } = useReadContract({
    address: USDC_DUALPOOL_CONTRACT_ADDRESS as `0x${string}`,
    abi: USDC_DUALPOOL_ABI,
    functionName: 'getPosition',
    args: address && !isNaN(numericId) ? [BigInt(numericId), address] : undefined,
    query: {
      enabled: !!address && !isNaN(numericId)
    }
  });
  
  // Parse user position
  const userPosition: UserPosition | null = useMemo(() => {
    if (!userPositionData) return null;
    const data = userPositionData as [bigint, bigint, bigint, bigint, boolean];
    return {
      yesAmount: data[0],
      noAmount: data[1],
      claimed: data[4]
    };
  }, [userPositionData]);
  
  const hasPosition = userPosition && (userPosition.yesAmount > BigInt(0) || userPosition.noAmount > BigInt(0));
  const positionSide: 'yes' | 'no' | null = userPosition ? 
    (userPosition.yesAmount > userPosition.noAmount ? 'yes' : 
     userPosition.noAmount > BigInt(0) ? 'no' : null) : null;
  const positionAmount = userPosition ? 
    (userPosition.yesAmount > userPosition.noAmount ? userPosition.yesAmount : userPosition.noAmount) : BigInt(0);

  // Calculate exit value for user's position
  const { data: exitValueData } = useReadContract({
    address: USDC_DUALPOOL_CONTRACT_ADDRESS as `0x${string}`,
    abi: USDC_DUALPOOL_ABI,
    functionName: 'calculateExitValue',
    args: hasPosition && positionSide ? [BigInt(numericId), positionSide === 'yes', positionAmount] : undefined,
    query: {
      enabled: !!hasPosition && !!positionSide && positionAmount > BigInt(0)
    }
  });
  
  // Parse exit value: [grossValue, fee, netValue]
  const exitValue = exitValueData as [bigint, bigint, bigint] | undefined;
  const exitNetValue = exitValue ? exitValue[2] : BigInt(0);
  const exitFee = exitValue ? exitValue[1] : BigInt(0);
  
  // USDC Markets page - always show USDC pools (0 if not registered = 50/50)
  // This is a USDC-only view, not ETH/SWIPE
  const displayYesPool = usdcYesPool;
  const displayNoPool = usdcNoPool;
  const totalPool = displayYesPool + displayNoPool;
  
  // Calculate price in cents - 50/50 if no USDC pool yet
  // Price = pool share (yesPrice = yesPool/totalPool * 100)
  // Higher pool = higher price = more people believe in that outcome
  const yesPrice = totalPool > 0 ? Math.round((displayYesPool / totalPool) * 100) : 50;
  const noPrice = 100 - yesPrice;
  
  // Check if prediction is registered in USDC contract
  const isRegisteredForUSDC = usdcEnabled || totalPool > 0;
  
  // Format pool for display - USDC only on this page
  const formatPool = (amount: number) => {
    // USDC has 6 decimals
    const usdcAmount = amount / 1e6;
    if (usdcAmount >= 1000) return `$${(usdcAmount / 1000).toFixed(1)}k`;
    if (usdcAmount > 0) return `$${usdcAmount.toFixed(2)}`;
    return '$0.00';
  };
  
  // Time formatting
  const formatDeadline = (timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = timestamp - now;
    
    if (diff < 0) return 'Ended';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  // First sentence for card teaser
  const getFirstSentence = (text: string) => {
    const m = text.match(/^[^.!?]*[.!?]/);
    if (m) return m[0].trim();
    return text.length > 120 ? text.slice(0, 120).trim() + '…' : text;
  };
  const hasMoreDescription = description && description.trim().length > 0 && description !== getFirstSentence(description);

  // Get crypto icon fallback
  const getCryptoImage = (): string | null => {
    if (selectedCrypto) {
      const symbol = selectedCrypto.toUpperCase();
      const cryptoIcons: Record<string, string> = {
        'BTC': '/btc.png',
        'ETH': '/eth.png',
        'SOL': '/sol.png',
        'SWIPE': '/logo.png'
        // XRP and BNB don't have icons, will fallback to hero.png
      };
      return cryptoIcons[symbol] || null;
    }
    if (includeChart) {
      // Try to detect from title/question
      const upperTitle = title.toUpperCase();
      if (upperTitle.includes('BITCOIN') || upperTitle.includes('BTC')) return '/btc.png';
      if (upperTitle.includes('ETHEREUM') || upperTitle.includes('ETH')) return '/eth.png';
      if (upperTitle.includes('SOLANA') || upperTitle.includes('SOL')) return '/sol.png';
    }
    return null;
  };

  // Image with fallback
  const cryptoFallback = useMemo(() => getCryptoImage(), [selectedCrypto, includeChart, title]);
  
  const initialImage = useMemo((): string => {
    // If no image or empty, use crypto fallback or hero
    if (!image || image.trim() === '' || image.includes('geckoterminal')) {
      return cryptoFallback || '/hero.png';
    }
    return image;
  }, [image, cryptoFallback]);
  
  const [imageSrc, setImageSrc] = useState<string>(initialImage);
  
  // Update image when props change
  useEffect(() => {
    setImageSrc(initialImage);
  }, [initialImage]);
  
  const handleImageError = () => {
    // Try crypto icon first, then hero.png
    if (cryptoFallback && imageSrc !== cryptoFallback) {
      setImageSrc(cryptoFallback);
    } else if (imageSrc !== '/hero.png') {
      setImageSrc('/hero.png');
    }
  };

  // Fetch price history when expanded
  useEffect(() => {
    if (!isExpanded) return;
    
    setLoadingHistory(true);
    fetch(`/api/predictions/${predictionId}/price-history`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data.history) {
          setPriceHistory(data.data.history);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingHistory(false));
  }, [isExpanded, predictionId, refreshKey]);

  // Generate chart data - always include starting point at 50/50
  const chartData = useMemo(() => {
    // Start with 50/50 point
    const startPoint = { time: 'Start', yes: 50, no: 50 };
    
    if (priceHistory.length > 0) {
      const historyPoints = priceHistory.map(p => ({
        time: new Date(p.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        yes: p.yesPrice,
        no: p.noPrice
      }));
      return [startPoint, ...historyPoints];
    }
    
    // If no history but pool exists, show current state
    if (totalPool > 0) {
      return [startPoint, { time: 'Now', yes: yesPrice, no: noPrice }];
    }
    
    // No history and no pool - just show starting point
    return [startPoint];
  }, [priceHistory, yesPrice, noPrice, totalPool]);

  return (
    <motion.div
      className="market-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={!isExpanded ? { y: -4 } : {}}
      transition={{ duration: 0.2 }}
      layout
    >
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          // COLLAPSED VIEW
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Header */}
            <div className="market-card-header">
              <div className="market-image">
                <img 
                  src={imageSrc} 
                  alt={title}
                  onError={handleImageError}
                />
              </div>
              <div className="market-info">
                <h3 className="market-title">{title}</h3>
                {description && (
                  <div className="market-description-wrap">
                    <p className="market-description">{getFirstSentence(description)}</p>
                    {hasMoreDescription && (
                      <button type="button" className="read-more-link" onClick={() => setIsExpanded(true)}>
                        Read more
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Price Buttons - Kalshi Style */}
            <div className="market-prices">
              <motion.button
                className={`price-button yes ${hoveredSide === 'yes' ? 'hovered' : ''}`}
                onMouseEnter={() => setHoveredSide('yes')}
                onMouseLeave={() => setHoveredSide(null)}
                onClick={() => onBet(predictionId, id, 'yes')}
                whileTap={{ scale: 0.98 }}
              >
                <span className="side-label">YES</span>
                <span className="price-value">{yesPrice}¢</span>
              </motion.button>
              
              <motion.button
                className={`price-button no ${hoveredSide === 'no' ? 'hovered' : ''}`}
                onMouseEnter={() => setHoveredSide('no')}
                onMouseLeave={() => setHoveredSide(null)}
                onClick={() => onBet(predictionId, id, 'no')}
                whileTap={{ scale: 0.98 }}
              >
                <span className="side-label">NO</span>
                <span className="price-value">{noPrice}¢</span>
              </motion.button>
            </div>

            {/* Footer */}
            <div className="market-footer">
              {isLive && (
                <Badge className="live-badge">
                  <Radio className="w-3 h-3 animate-pulse" />
                  LIVE
                </Badge>
              )}
              <div className="market-stats">
                <Badge variant="outline" className="pool-badge">
                  {formatPool(totalPool)}
                </Badge>
                <Badge variant="outline" className="time-badge">
                  <Clock className="w-3 h-3" />
                  {formatDeadline(deadline)}
                </Badge>
              </div>
              <button className="expand-btn" onClick={() => setIsExpanded(true)}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ) : (
          // EXPANDED VIEW WITH CHART
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="expanded-view"
          >
            {/* Expanded Header */}
            <div className="expanded-header">
              <button className="back-btn" onClick={() => setIsExpanded(false)}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="expanded-title">{title}</h3>
            </div>

            {/* Chart Section */}
            <div className="chart-section">
              {loadingHistory ? (
                <div className="chart-loading">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading chart...</span>
                </div>
              ) : chartData.length >= 2 || totalPool > 0 ? (
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="yesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="noGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      horizontal={true}
                      vertical={false}
                      stroke="rgba(136, 136, 136, 0.2)"
                    />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fontSize: 10, fill: '#888' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      domain={[0, 100]} 
                      tick={{ fontSize: 10, fill: '#888' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v}¢`}
                      ticks={[0, 25, 50, 75, 100]}
                    />
                    <Tooltip 
                      formatter={(value, name) => [`${value}¢`, name === 'yes' ? 'YES' : 'NO']}
                      contentStyle={{ 
                        background: 'rgba(0,0,0,0.8)', 
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="yes"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#yesGradient)"
                      name="yes"
                    />
                    <Area
                      type="monotone"
                      dataKey="no"
                      stroke="#ef4444"
                      strokeWidth={2}
                      fill="url(#noGradient)"
                      name="no"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">
                  <TrendingUp className="w-8 h-8 text-gray-300" />
                  <span>Chart will appear after first bet</span>
                </div>
              )}
            </div>

            {/* Price Display - Clickable to bet */}
            <div className="expanded-prices">
              <motion.button 
                className="price-box yes clickable"
                onClick={() => onBet(predictionId, id, 'yes')}
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.02 }}
              >
                <span className="label">YES</span>
                <span className="value">{yesPrice}¢</span>
                <span className="tap-hint">Tap to buy</span>
              </motion.button>
              <motion.button 
                className="price-box no clickable"
                onClick={() => onBet(predictionId, id, 'no')}
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.02 }}
              >
                <span className="label">NO</span>
                <span className="value">{noPrice}¢</span>
                <span className="tap-hint">Tap to buy</span>
              </motion.button>
            </div>

            {/* Stats Row */}
            <div className="expanded-stats">
              <div className="stat-item">
                <DollarSign className="w-4 h-4" />
                <span>Pool: {formatPool(totalPool)}</span>
              </div>
              <div className="stat-item">
                <Users className="w-4 h-4" />
                <span>Bettors: {participants}</span>
              </div>
              <div className="stat-item">
                <Clock className="w-4 h-4" />
                <span>Ends: {formatDeadline(deadline)}</span>
              </div>
            </div>
            
            {/* User Position & Early Exit */}
            {hasPosition && positionSide && !userPosition?.claimed && (
              <div className="user-position-section">
                <div className="position-info">
                  <Wallet className="w-4 h-4" />
                  <span>Your position: <strong className={positionSide === 'yes' ? 'text-green' : 'text-red'}>
                    {positionSide.toUpperCase()}
                  </strong> ${(Number(positionAmount) / 1e6).toFixed(2)}</span>
                </div>
                {exitNetValue > BigInt(0) ? (
                  <button
                    className="early-exit-btn"
                    onClick={() => onEarlyExit?.(predictionId, numericId, positionSide === 'yes', positionAmount, exitNetValue, exitFee, title)}
                    title={`Exit and receive $${(Number(exitNetValue) / 1e6).toFixed(2)}`}
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    Exit → ${(Number(exitNetValue) / 1e6).toFixed(2)}
                  </button>
                ) : (
                  <div className="exit-warning-badge" title="No liquidity on opposite side - wait for bets on the other side">
                    <AlertCircle className="w-3 h-3" />
                    <span>No exit liquidity</span>
                  </div>
                )}
              </div>
            )}

            {/* Full description */}
            {description && (
              <div className="expanded-description">
                <p>{description}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Transaction states
type TxState = 'idle' | 'approving' | 'approved' | 'betting' | 'success' | 'error';

export default function KalshiMarkets() {
  const { predictions, loading, refresh } = useHybridPredictions();
  const { address, isConnected } = useAccount();
  const [txState, setTxState] = useState<TxState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  
  // Show sample data only if not loading AND no predictions
  const useSampleData = !loading && (!predictions || predictions.length === 0);
  
  // Bet modal state
  const [betModal, setBetModal] = useState<{
    isOpen: boolean;
    predictionId: string;
    marketId: number;
    side: 'yes' | 'no' | null;
    amount: number;
    market?: any;
  }>({
    isOpen: false,
    predictionId: '',
    marketId: 0,
    side: null,
    amount: 10
  });

  // Read user's USDC balance
  const { data: usdcBalance } = useReadContract({
    address: USDC_TOKEN.address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  });

  // Read USDC allowance
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_TOKEN.address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, USDC_DUALPOOL_CONTRACT_ADDRESS as `0x${string}`] : undefined,
    query: { enabled: !!address }
  });

  // Contract write hooks
  const { writeContract: approveUSDC, data: approveHash, isPending: isApproving } = useWriteContract();
  const { writeContract: placeBet, data: betHash, isPending: isBetting } = useWriteContract();
  const { writeContract: exitEarly, data: exitHash, isPending: isExiting } = useWriteContract();
  
  // Early exit modal state
  const [exitModal, setExitModal] = useState<{
    isOpen: boolean;
    predictionId: string;
    numericId: number;
    isYes: boolean;
    amount: bigint;
    netValue: bigint;
    fee: bigint;
    title: string;
  }>({
    isOpen: false,
    predictionId: '',
    numericId: 0,
    isYes: true,
    amount: BigInt(0),
    netValue: BigInt(0),
    fee: BigInt(0),
    title: ''
  });

  // Wait for transactions
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const { isLoading: isBetConfirming, isSuccess: isBetSuccess } = useWaitForTransactionReceipt({
    hash: betHash,
  });

  const { isLoading: isExitConfirming, isSuccess: isExitSuccess } = useWaitForTransactionReceipt({
    hash: exitHash,
  });

  // Update tx state based on hooks
  useEffect(() => {
    if (isApproving || isApproveConfirming) {
      setTxState('approving');
    } else if (isApproveSuccess) {
      setTxState('approved');
      refetchAllowance();
    }
  }, [isApproving, isApproveConfirming, isApproveSuccess, refetchAllowance]);

  useEffect(() => {
    if (isBetting || isBetConfirming) {
      setTxState('betting');
    } else if (isBetSuccess && betHash) {
      setTxState('success');
      
      // Save transaction to history
      const saveStakeTransaction = async () => {
        if (!address) return;
        
        try {
          const transaction = {
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'stake',
            predictionId: betModal.predictionId,
            predictionQuestion: betModal.market?.title || `Prediction #${betModal.marketId}`,
            txHash: betHash,
            basescanUrl: `https://basescan.org/tx/${betHash}`,
            timestamp: Date.now(),
            status: 'success',
            tokenType: 'USDC',
            amount: betModal.amount * 1e6 // Store in raw USDC (6 decimals)
          };
          
          await fetch('/api/user-transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: address.toLowerCase(),
              transaction
            })
          });
          console.log('✅ USDC stake transaction saved');
        } catch (e) {
          console.error('Failed to save USDC stake transaction:', e);
        }
      };
      saveStakeTransaction();
      
      // Sync USDC data to Redis and save price history after successful bet with retry logic
      const syncUSDCAndHistory = async () => {
        const numericId = parseInt(betModal.predictionId.replace('pred_v2_', ''), 10);
        if (isNaN(numericId)) return;
        
        // Wait for blockchain propagation
        console.log('⏳ Waiting 2s for blockchain propagation after stake...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        let syncAttempts = 0;
        const maxAttempts = 3;
        
        while (syncAttempts < maxAttempts) {
          syncAttempts++;
          console.log(`🔄 USDC sync attempt ${syncAttempts}/${maxAttempts}...`);
          
          try {
            const syncResponse = await fetch('/api/sync/usdc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ predictionIds: [numericId] })
            });
            
            if (syncResponse.ok) {
              const syncData = await syncResponse.json();
              const result = syncData.results?.[numericId];
              console.log('✅ USDC pools synced to Redis after stake');
              
              // Save price history point with new pool data
              if (result?.registered) {
                await fetch(`/api/predictions/${betModal.predictionId}/price-history`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    yesPool: (result.yesPool || 0) * 1e6,
                    noPool: (result.noPool || 0) * 1e6,
                    betAmount: betModal.amount * 1e6,
                    betSide: betModal.side,
                    eventType: 'stake'
                  })
                });
                console.log('✅ Price history saved after stake');
              }
              break; // Success, exit loop
            } else {
              console.warn(`⚠️ Sync attempt ${syncAttempts} failed`);
            }
          } catch (e) {
            console.error(`❌ Sync attempt ${syncAttempts} error:`, e);
          }
          
          // Wait before retry
          if (syncAttempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
        
        // Trigger chart refresh AFTER sync completes
        setRefreshKey(prev => prev + 1);
      };
      
      // Run sync and then close modal
      syncUSDCAndHistory().then(() => {
        setBetModal(prev => ({ ...prev, isOpen: false }));
        setTxState('idle');
        refresh();
      });
    }
  }, [isBetting, isBetConfirming, isBetSuccess, betHash, address, refresh, betModal.predictionId, betModal.side, betModal.amount, betModal.market, betModal.marketId]);

  // Handle approval
  const handleApprove = useCallback(async () => {
    if (!address) return;
    
    setErrorMessage(null);
    try {
      const amountToApprove = parseUnits('1000000', 6); // Approve 1M USDC
      
      approveUSDC({
        address: USDC_TOKEN.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [USDC_DUALPOOL_CONTRACT_ADDRESS as `0x${string}`, amountToApprove]
      });
    } catch (error: any) {
      setErrorMessage(error?.message || 'Approval failed');
      setTxState('error');
    }
  }, [address, approveUSDC]);

  // Handle place bet
  const handlePlaceBet = useCallback(async () => {
    if (!address || !betModal.side || !betModal.marketId) return;
    
    setErrorMessage(null);
    try {
      const amountInUSDC = parseUnits(betModal.amount.toString(), 6);
      
      placeBet({
        address: USDC_DUALPOOL_CONTRACT_ADDRESS as `0x${string}`,
        abi: USDC_DUALPOOL_ABI,
        functionName: 'placeBet',
        args: [BigInt(betModal.marketId), betModal.side === 'yes', amountInUSDC]
      });
    } catch (error: any) {
      setErrorMessage(error?.message || 'Bet failed');
      setTxState('error');
    }
  }, [address, betModal, placeBet]);

  // Check if approval needed
  const needsApproval = useMemo(() => {
    if (!usdcAllowance || !betModal.amount) return true;
    const requiredAmount = parseUnits(betModal.amount.toString(), 6);
    return BigInt(usdcAllowance.toString()) < requiredAmount;
  }, [usdcAllowance, betModal.amount]);

  // Handle early exit transaction state
  useEffect(() => {
    if (isExiting || isExitConfirming) {
      setTxState('betting'); // Reuse betting state for loading
    } else if (isExitSuccess && exitHash) {
      setTxState('success');
      
      // Save early exit transaction to history
      const saveExitTransaction = async () => {
        if (!address) return;
        
        try {
          const transaction = {
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'exit_early',
            predictionId: exitModal.predictionId,
            predictionQuestion: exitModal.title || `Prediction #${exitModal.numericId}`,
            txHash: exitHash,
            basescanUrl: `https://basescan.org/tx/${exitHash}`,
            timestamp: Date.now(),
            status: 'success',
            tokenType: 'USDC',
            amount: Number(exitModal.amount), // Original stake amount
            exitFee: Number(exitModal.fee),
            receivedAmount: Number(exitModal.netValue)
          };
          
          await fetch('/api/user-transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: address.toLowerCase(),
              transaction
            })
          });
          console.log('✅ USDC early exit transaction saved');
        } catch (e) {
          console.error('Failed to save USDC exit transaction:', e);
        }
      };
      saveExitTransaction();
      
      // Sync USDC pools to Redis after early exit with retry logic
      const syncUSDCAfterExit = async () => {
        const numericId = exitModal.numericId;
        if (!numericId) return;
        
        // Wait for blockchain propagation
        console.log('⏳ Waiting 2s for blockchain propagation after exit...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        let syncAttempts = 0;
        const maxAttempts = 3;
        
        while (syncAttempts < maxAttempts) {
          syncAttempts++;
          console.log(`🔄 USDC sync attempt ${syncAttempts}/${maxAttempts}...`);
          
          try {
            const syncResponse = await fetch('/api/sync/usdc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ predictionIds: [numericId] })
            });
            
            if (syncResponse.ok) {
              const syncData = await syncResponse.json();
              const result = syncData.results?.[numericId];
              console.log('✅ USDC pools synced to Redis after early exit');
              
              // Save price history point to update chart (may go back to 50/50)
              if (result?.registered) {
                const yesPool = (result.yesPool || 0) * 1e6;
                const noPool = (result.noPool || 0) * 1e6;
                
                await fetch(`/api/predictions/pred_v2_${numericId}/price-history`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    yesPool,
                    noPool,
                    betAmount: Number(exitModal.amount),
                    betSide: exitModal.isYes ? 'yes' : 'no',
                    eventType: 'early_exit'
                  })
                });
                console.log('✅ Price history updated after early exit');
              }
              break; // Success, exit loop
            } else {
              console.warn(`⚠️ Sync attempt ${syncAttempts} failed`);
            }
          } catch (e) {
            console.error(`❌ Sync attempt ${syncAttempts} error:`, e);
          }
          
          // Wait before retry
          if (syncAttempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
        
        // Trigger chart refresh AFTER sync completes
        setRefreshKey(prev => prev + 1);
      };
      
      // Run sync and then close modal
      syncUSDCAfterExit().then(() => {
        setExitModal(prev => ({ ...prev, isOpen: false }));
        setTxState('idle');
        refresh();
      });
    }
  }, [isExiting, isExitConfirming, isExitSuccess, exitHash, address, refresh, exitModal]);

  // Handle early exit
  const handleEarlyExit = useCallback((predictionId: string, numericId: number, isYes: boolean, amount: bigint, netValue: bigint, fee: bigint, title: string) => {
    setExitModal({
      isOpen: true,
      predictionId,
      numericId,
      isYes,
      amount,
      netValue,
      fee,
      title
    });
  }, []);

  // Confirm early exit
  const confirmEarlyExit = useCallback(() => {
    if (!address || !exitModal.numericId) return;
    
    setErrorMessage(null);
    try {
      exitEarly({
        address: USDC_DUALPOOL_CONTRACT_ADDRESS as `0x${string}`,
        abi: USDC_DUALPOOL_ABI,
        functionName: 'exitEarly',
        args: [BigInt(exitModal.numericId), exitModal.isYes, exitModal.amount]
      });
    } catch (error: any) {
      setErrorMessage(error?.message || 'Exit failed');
      setTxState('error');
    }
  }, [address, exitModal, exitEarly]);

  // Transform predictions to market format
  const markets = useMemo(() => {
    if (useSampleData) {
      return []; // No sample data - show empty state
    }
    
    if (!predictions) return [];
    
    return predictions
      .filter(pred => {
        // Only active predictions
        if (pred.resolved || pred.cancelled) return false;
        if (pred.deadline && pred.deadline < Date.now() / 1000) return false;
        return true;
      })
      .map(pred => ({
        id: typeof pred.id === 'string' 
          ? parseInt(pred.id.replace('pred_v2_', ''), 10) || 0
          : pred.id,
        predictionId: pred.id,
        title: pred.question,
        description: pred.description,
        category: pred.category || 'General',
        image: pred.imageUrl || '/hero.png',
        selectedCrypto: pred.selectedCrypto,
        includeChart: pred.includeChart,
        yesPool: pred.yesTotalAmount || 0,
        noPool: pred.noTotalAmount || 0,
        usdcEnabled: pred.usdcPoolEnabled || false,
        usdcYesPool: pred.usdcYesTotalAmount || 0,
        usdcNoPool: pred.usdcNoTotalAmount || 0,
        deadline: pred.deadline || 0,
        participants: pred.participants?.length || 0,
        isLive: Boolean(pred.deadline && pred.deadline > Date.now() / 1000 && !pred.resolved && !pred.cancelled),
        creator: pred.creator
      }))
      // Sort by volume (highest first)
      .sort((a, b) => (b.yesPool + b.noPool) - (a.yesPool + a.noPool));
  }, [predictions, useSampleData]);

  const handleBet = useCallback((predictionId: string, marketId: number, side: 'yes' | 'no') => {
    const market = markets.find(m => m.id === marketId);
    setBetModal({
      isOpen: true,
      predictionId,
      marketId,
      side,
      amount: 10,
      market
    });
    setTxState('idle');
    setErrorMessage(null);
  }, [markets]);

  // Format USDC balance for display
  const formattedBalance = useMemo(() => {
    if (!usdcBalance) return '0.00';
    return formatUnits(usdcBalance, 6);
  }, [usdcBalance]);

  return (
    <div className="kalshi-markets">
      {/* Premium Header with shadcn */}
      <Card className="usdc-header-card">
        <div className="usdc-header-content">
          {/* Left: Logo & Title */}
          <div className="usdc-header-left">
            <div className="usdc-logo-container">
              <img src="/usdc.png" alt="USDC" className="usdc-logo" />
              <div className="usdc-logo-glow"></div>
            </div>
            <div className="usdc-title-group">
              <h1 className="usdc-main-title">USDC Markets</h1>
            </div>
          </div>
          
          {/* Right: Balance & Actions */}
          <div className="usdc-header-right">
            {isConnected && (
              <div className="usdc-balance-pill">
                <Wallet className="w-4 h-4" />
                <span className="balance-amount">${parseFloat(formattedBalance).toFixed(2)}</span>
              </div>
            )}
            <div className="usdc-action-buttons">
              <a 
                href="https://basescan.org/address/0xf5Fa6206c2a7d5473ae7468082c9D260DFF83205"
                target="_blank"
                rel="noopener noreferrer"
                className="contract-icon-link"
                aria-label="USDC DualPool contract on Basescan"
              >
                <img src="/Base_square_blue.png" alt="Base" className="contract-icon" />
              </a>
              <Button
                variant="ghost"
                size="icon"
                className="action-btn"
                onClick={() => setShowHelpModal(true)}
                title="How it works"
              >
                <HelpCircle className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="action-btn"
                onClick={async () => {
                  setIsRefreshing(true);
                  await refresh();
                  setRefreshKey(prev => prev + 1);
                  setTimeout(() => setIsRefreshing(false), 500);
                }}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Markets Grid */}
      <div className="markets-grid">
        {loading ? (
          <div className="loading-state">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span>Loading markets...</span>
          </div>
        ) : markets.length === 0 ? (
          <div className="empty-state">
            <BarChart3 className="w-12 h-12 text-gray-400" />
            <span>No active USDC markets</span>
            <p className="text-sm text-gray-500">Markets will appear here once USDC betting is enabled</p>
          </div>
        ) : (
          markets.map(market => (
            <MarketCard
              key={market.id}
              {...market}
              refreshKey={refreshKey}
              onBet={handleBet}
              onEarlyExit={handleEarlyExit}
            />
          ))
        )}
      </div>

      {/* Bet Modal */}
      <AnimatePresence>
        {betModal.isOpen && (
          <motion.div
            className="bet-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => txState === 'idle' && setBetModal(prev => ({ ...prev, isOpen: false }))}
          >
            <motion.div
              className="bet-modal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="modal-header">
                <h3>Place USDC Bet</h3>
                <Badge className={`side-badge ${betModal.side}`}>
                  {betModal.side?.toUpperCase()}
                </Badge>
              </div>
              
              {betModal.market && (
                <p className="modal-subtitle">{betModal.market.title}</p>
              )}
              
              {/* Amount Selection */}
              <div className="amount-input-section">
                <label>Amount (USDC)</label>
                <div className="amount-buttons">
                  {[5, 10, 25, 50, 100].map(amt => (
                    <button
                      key={amt}
                      className={`amount-btn ${betModal.amount === amt ? 'active' : ''}`}
                      onClick={() => setBetModal(prev => ({ ...prev, amount: amt }))}
                      disabled={txState !== 'idle'}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
                <Input
                  type="number"
                  value={betModal.amount}
                  onChange={(e) => setBetModal(prev => ({ ...prev, amount: Number(e.target.value) }))}
                  className="custom-amount"
                  disabled={txState !== 'idle'}
                  min={1}
                />
                <p className="balance-info">
                  Balance: {parseFloat(formattedBalance).toFixed(2)} USDC
                </p>
              </div>

              {/* Potential Payout */}
              {betModal.market && (
                <div className="payout-preview">
                  <div className="payout-row">
                    <span>Your bet</span>
                    <span>${betModal.amount} USDC</span>
                  </div>
                  {(() => {
                    // Convert from raw USDC (6 decimals) to USD
                    const usdcYesRaw = betModal.market.usdcYesPool || 0;
                    const usdcNoRaw = betModal.market.usdcNoPool || 0;
                    const usdcYes = usdcYesRaw / 1e6; // Convert to USD
                    const usdcNo = usdcNoRaw / 1e6;   // Convert to USD
                    const totalUsdcPool = usdcYes + usdcNo;
                    
                    if (totalUsdcPool === 0) {
                      // No USDC pool yet - user is first
                      return (
                        <div className="payout-row">
                          <span>If you win</span>
                          <span className="text-green-500">First bet! Returns depend on future bets</span>
                        </div>
                      );
                    }
                    
                    // Calculate payout based on USDC pool only
                    const oppositePool = betModal.side === 'yes' ? usdcNo : usdcYes;
                    const yourSidePool = betModal.side === 'yes' ? usdcYes : usdcNo;
                    const betAmount = betModal.amount;
                    
                    // Payout = your bet + (your share of opposite pool) - 1.5% fee
                    const newYourSidePool = yourSidePool + betAmount;
                    const yourShare = betAmount / newYourSidePool;
                    const potentialWin = betAmount + (oppositePool * yourShare * 0.985);
                    
                    return (
                      <div className="payout-row">
                        <span>If you win</span>
                        <span className="text-green-500">~${potentialWin.toFixed(2)}</span>
                      </div>
                    );
                  })()}
                  <div className="payout-row text-sm text-gray-500">
                    <span>Early exit fee</span>
                    <span>5%</span>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div className="error-message">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Transaction Status */}
              {txState !== 'idle' && txState !== 'error' && (
                <div className={`tx-status ${txState}`}>
                  {txState === 'approving' && (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Approving USDC...</span>
                    </>
                  )}
                  {txState === 'approved' && (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span>USDC Approved! Ready to bet.</span>
                    </>
                  )}
                  {txState === 'betting' && (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Placing bet...</span>
                    </>
                  )}
                  {txState === 'success' && (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span>Bet placed successfully!</span>
                    </>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="modal-actions">
                <Button 
                  variant="outline" 
                  onClick={() => setBetModal(prev => ({ ...prev, isOpen: false }))}
                  disabled={txState !== 'idle' && txState !== 'success' && txState !== 'error'}
                >
                  Cancel
                </Button>
                
                {!isConnected ? (
                  <WalletContainer>
                    <ConnectWallet 
                      className="confirm-btn"
                      text="Connect Wallet"
                    />
                  </WalletContainer>
                ) : needsApproval && txState !== 'approved' ? (
                  <Button 
                    className="confirm-btn approve"
                    onClick={handleApprove}
                    disabled={txState !== 'idle'}
                  >
                    {txState === 'approving' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Approving...
                      </>
                    ) : (
                      <>
                        <ArrowRightLeft className="w-4 h-4 mr-2" />
                        Approve USDC
                      </>
                    )}
                  </Button>
                ) : (
                  <Button 
                    className={`confirm-btn ${betModal.side}`}
                    onClick={handlePlaceBet}
                    disabled={txState !== 'idle' && txState !== 'approved'}
                  >
                    {txState === 'betting' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Placing Bet...
                      </>
                    ) : (
                      <>Bet ${betModal.amount} on {betModal.side?.toUpperCase()}</>
                    )}
                  </Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Early Exit Modal */}
      <AnimatePresence>
        {exitModal.isOpen && (
          <motion.div
            className="bet-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => txState === 'idle' && setExitModal(prev => ({ ...prev, isOpen: false }))}
          >
            <motion.div
              className="bet-modal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="bet-modal-header">
                <h3>Early Exit</h3>
                <button 
                  className="close-btn"
                  onClick={() => setExitModal(prev => ({ ...prev, isOpen: false }))}
                  disabled={txState !== 'idle'}
                >
                  ×
                </button>
              </div>
              
              <div className="bet-modal-content">
                <div className="exit-summary">
                  <div className="exit-info">
                    <span className="label">Your Position:</span>
                    <span className={`value ${exitModal.isYes ? 'text-green' : 'text-red'}`}>
                      {exitModal.isYes ? 'YES' : 'NO'} ${(Number(exitModal.amount) / 1e6).toFixed(2)}
                    </span>
                  </div>
                  <div className="exit-info">
                    <span className="label">Exit Fee:</span>
                    <span className="value text-orange">
                      -${(Number(exitModal.fee) / 1e6).toFixed(2)}
                    </span>
                  </div>
                  <div className="exit-info total">
                    <span className="label">You Receive:</span>
                    <span className={`value ${Number(exitModal.netValue) > 0 ? 'text-green' : 'text-red'}`}>
                      ${(Number(exitModal.netValue) / 1e6).toFixed(2)}
                    </span>
                  </div>
                </div>
                
                {Number(exitModal.netValue) === 0 ? (
                  <p className="exit-warning text-red">
                    <strong>Warning:</strong> No liquidity on opposite side! 
                    You will receive $0.00 if you exit now. 
                    Wait for bets on the {exitModal.isYes ? 'NO' : 'YES'} side.
                  </p>
                ) : (
                  <p className="exit-warning">
                    Exit value based on current market prices (AMM). 
                    This action cannot be undone.
                  </p>
                )}
                
                {errorMessage && (
                  <div className="error-message">
                    <AlertCircle className="w-4 h-4" />
                    {errorMessage}
                  </div>
                )}
              </div>

              <div className="bet-modal-footer">
                {txState === 'success' ? (
                  <div className="success-message">
                    <CheckCircle className="w-5 h-5" />
                    Exit Successful!
                  </div>
                ) : (
                  <Button
                    className="exit-confirm-btn"
                    onClick={confirmEarlyExit}
                    disabled={isExiting || isExitConfirming}
                  >
                    {isExiting || isExitConfirming ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Processing Exit...
                      </>
                    ) : (
                      <>
                        <ArrowRightLeft className="w-4 h-4 mr-2" />
                        Confirm Exit
                      </>
                    )}
                  </Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Help Modal - USDC Markets Guide */}
      <AnimatePresence>
        {showHelpModal && (
          <motion.div
            className="help-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowHelpModal(false)}
          >
            <motion.div
              className="help-modal-content"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="help-modal-header">
                <h2>📚 USDC Markets Guide</h2>
                <button className="help-close-btn" onClick={() => setShowHelpModal(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="help-modal-body">
                {/* Key Differences */}
                <section className="help-section">
                  <h3>💡 What are USDC Markets?</h3>
                  <p>Bet with stablecoins! No crypto volatility - your $100 stays $100.</p>
                  
                  <div className="help-comparison">
                    <div className="comparison-item">
                      <span className="label">ETH/SWIPE Pool</span>
                      <span className="value">❌ No early exit</span>
                    </div>
                    <div className="comparison-item highlight">
                      <span className="label">USDC Pool</span>
                      <span className="value">✅ Exit anytime (5% fee)</span>
                    </div>
                  </div>
                </section>

                {/* AMM Pricing */}
                <section className="help-section">
                  <h3>📊 How Prices Work (AMM)</h3>
                  <p>Prices change dynamically based on pool sizes:</p>
                  <div className="help-formula">
                    <code>YES Price = NO Pool ÷ Total Pool</code>
                    <code>NO Price = YES Pool ÷ Total Pool</code>
                  </div>
                  <div className="help-example">
                    <strong>Example:</strong> YES Pool: $1,000 | NO Pool: $500
                    <br/>→ YES costs $0.33, NO costs $0.67
                    <br/>→ If YES wins, you get $1.00 per share!
                  </div>
                </section>

                {/* Fee Structure */}
                <section className="help-section">
                  <h3>💰 Fee Structure</h3>
                  <div className="help-fees">
                    <div className="fee-item">
                      <span className="fee-name">Platform Fee</span>
                      <span className="fee-value">1%</span>
                      <span className="fee-note">from losers pool</span>
                    </div>
                    <div className="fee-item">
                      <span className="fee-name">Creator Reward</span>
                      <span className="fee-value">0.5%</span>
                      <span className="fee-note">from losers pool</span>
                    </div>
                    <div className="fee-item exit">
                      <span className="fee-name">Early Exit</span>
                      <span className="fee-value">5%</span>
                      <span className="fee-note">from your position</span>
                    </div>
                  </div>
                </section>

                {/* Example Payout */}
                <section className="help-section">
                  <h3>🏆 Payout Example</h3>
                  <div className="help-payout-example">
                    <div className="payout-scenario">
                      <strong>Prediction:</strong> "ETH reaches $5,000?"
                      <br/><strong>You bet:</strong> $100 on YES
                      <br/><strong>YES Pool:</strong> $1,000 (your share: 10%)
                      <br/><strong>NO Pool:</strong> $600
                    </div>
                    <div className="payout-result win">
                      <strong>✅ If YES wins:</strong>
                      <br/>You get: $100 + (10% × $591) = <span className="amount">$159.10</span>
                      <br/>Profit: <span className="profit">+$59.10 (+59%)</span>
                    </div>
                    <div className="payout-result lose">
                      <strong>❌ If NO wins:</strong>
                      <br/>You lose: <span className="amount">-$100</span>
                    </div>
                  </div>
                </section>

                {/* Early Exit */}
                <section className="help-section">
                  <h3>🚪 Early Exit</h3>
                  <p>Changed your mind? Exit before the deadline!</p>
                  <div className="help-example">
                    <strong>Example:</strong> Position worth $150
                    <br/>Exit fee (5%): -$7.50
                    <br/>You receive: <strong>$142.50</strong>
                  </div>
                </section>

                {/* Quick Tips */}
                <section className="help-section tips">
                  <h3>💎 Quick Tips</h3>
                  <ul>
                    <li>✅ Minimum bet: $1 USDC</li>
                    <li>✅ Same prediction can have ETH + USDC pools</li>
                    <li>✅ Pools resolve with the same outcome</li>
                    <li>⚠️ Large bets move the price significantly</li>
                  </ul>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

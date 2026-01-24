// Redis types - safe to import on client side
export interface RedisPrediction {
  id: string;
  question: string;
  description: string;
  category: string;
  imageUrl: string;
  ogImageUrl?: string; // Cached OG image URL from ImgBB for Twitter/Base App compatibility
  includeChart: boolean;
  selectedCrypto?: string;
  endDate: string;
  endTime: string;
  deadline: number; // Unix timestamp
  resolutionDeadline?: number; // Unix timestamp - when admin must resolve by
  yesTotalAmount: number;
  noTotalAmount: number;
  swipeYesTotalAmount: number;
  swipeNoTotalAmount: number;
  // USDC Dual Pool fields
  usdcPoolEnabled?: boolean; // Whether USDC betting is enabled for this prediction
  usdcYesTotalAmount?: number; // Total USDC staked on YES (6 decimals)
  usdcNoTotalAmount?: number; // Total USDC staked on NO (6 decimals)
  usdcRegisteredAt?: number; // When prediction was registered in USDC contract
  usdcResolved?: boolean; // Whether prediction is resolved on USDC contract
  usdcCancelled?: boolean; // Whether prediction is cancelled on USDC contract
  usdcOutcome?: boolean; // Outcome on USDC contract (true = YES, false = NO)
  resolved: boolean;
  outcome?: boolean;
  cancelled: boolean;
  createdAt: number; // Unix timestamp
  creator: string;
  verified: boolean;
  approved: boolean;
  needsApproval: boolean;
  participants: string[];
  usdcParticipants?: string[]; // USDC participants (separate from ETH/SWIPE participants)
  totalStakes: number;
  marketStats?: {
    yesPercentage: number;
    noPercentage: number;
    timeLeft: number;
    totalPool: number;
  };
  // USDC market stats (separate from ETH/SWIPE)
  usdcMarketStats?: {
    yesPercentage: number;
    noPercentage: number;
    totalPool: number; // in USDC (6 decimals)
    participantCount: number;
  };
  contractVersion?: 'V1' | 'V2'; // Contract version for hybrid migration
}

export interface RedisUserStake {
  user: string;
  predictionId: string;
  yesAmount: number;
  noAmount: number;
  claimed: boolean;
  stakedAt: number;
  contractVersion?: 'V1' | 'V2'; // Contract version for hybrid migration
  isWinner?: boolean; // V2 only
  tokenType?: 'ETH' | 'SWIPE' | 'USDC'; // Token type for multi-token support
  canClaim?: boolean; // Calculated property - whether stake is ready to claim
  // USDC-specific fields
  entryPrice?: number; // Entry price in basis points (USDC only)
  exitedEarly?: boolean; // Whether user exited early (USDC only)
  exitAmount?: number; // Amount received from early exit (USDC only)
}

// User transaction interface
export interface UserTransaction {
  id: string;
  type: 'claim' | 'stake' | 'resolve' | 'cancel' | 'exit_early'; // Added exit_early for USDC
  predictionId: string;
  predictionQuestion: string;
  amount?: number;
  tokenType?: 'ETH' | 'SWIPE' | 'USDC'; // Token type for multi-token support
  txHash: string;
  basescanUrl: string;
  timestamp: number;
  status: 'pending' | 'success' | 'failed';
  blockNumber?: number;
  gasUsed?: number;
  // USDC-specific transaction fields
  exitFee?: number; // Fee paid for early exit (USDC only)
  receivedAmount?: number; // Net amount received after fees (USDC only)
}

export interface RedisMarketStats {
  totalPredictions: number;
  totalStakes: number;
  activePredictions: number;
  resolvedPredictions: number;
  totalParticipants: number;
  lastUpdated: number;
}

// USDC Price History for charts
export interface USDCPricePoint {
  timestamp: number;       // Unix timestamp
  yesPrice: number;        // Price in cents (0-100)
  noPrice: number;         // Price in cents (0-100)  
  yesPool: number;         // USDC in YES pool (6 decimals raw)
  noPool: number;          // USDC in NO pool (6 decimals raw)
  totalPool: number;       // Total USDC in pool
  betAmount?: number;      // Amount of this bet that caused the change
  betSide?: 'yes' | 'no';  // Which side was bet on
  bettor?: string;         // Address of bettor (optional)
}

export interface USDCPriceHistory {
  predictionId: string;
  history: USDCPricePoint[];
  lastUpdated: number;
}

// Redis types - safe to import on client side

/** How a routine-created market is settled: read this pool, compare to this
 *  threshold. Written at creation so resolution never guesses. */
export interface ResolutionSpec {
  source: 'geckoterminal' | 'dexscreener';
  /** The source's network id, 'base' or 'robinhood'. */
  network: string;
  poolAddress: string;
  comparator: 'above';
  /** USD. Strictly above wins YES; equality resolves NO. */
  threshold: number;
  template: 'price_at_close';
}

/** What the resolver actually observed before it sent the transaction.
 *  source 'chain' marks a backfill: the transaction landed in an earlier run
 *  that died before writing Redis, so the outcome was read back on-chain. */
export interface ResolutionProof {
  source: 'geckoterminal' | 'dexscreener' | 'chain';
  sourceUrl: string | null;
  observedPrice: number | null;
  threshold: number;
  comparator: 'above';
  outcome: boolean;
  fetchedAt: number;
  deadline: number;
  resolvedTx: string | null;
  raw?: unknown;
  note?: string;
}

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
  // Resolved with nobody on the winning side, so everyone gets their raw stake
  // back. /api/sync/usdc has written this since V3 and nothing declared it, so
  // the claim path could not read it and sent claimWinnings into a revert.
  usdcRefundable?: boolean;
  resolved: boolean;
  outcome?: boolean;
  /** Unix timestamp of the run that flipped resolved to true, chain-backfill
   *  included. Absent on markets resolved before this field existed. */
  resolvedAt?: number;
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
  // Which contract generation minted this market. V3 registered four empty
  // markets on Base and nothing else; V4 is what the app writes to now.
  contractVersion?: 'V1' | 'V2' | 'V3' | 'V4';
  // Weekly routine bookkeeping. Absent on every hand-made market.
  createdByRoutine?: boolean;
  resolutionSpec?: ResolutionSpec;
  resolutionProof?: ResolutionProof;
  /** Consecutive failed price fetches; 24 flags the market in the admin card. */
  resolveFailures?: number;
}

export interface RedisUserStake {
  user: string;
  predictionId: string;
  yesAmount: number;
  noAmount: number;
  claimed: boolean;
  stakedAt: number;
  contractVersion?: 'V1' | 'V2' | 'V3' | 'V4'; // Which contract generation minted it
  isWinner?: boolean; // V2 only
  tokenType?: 'ETH' | 'SWIPE' | 'USDC'; // Token type for multi-token support
  canClaim?: boolean; // Calculated property - whether stake is ready to claim
  // Archived USDC pool only. That contract stored an entry price per side.
  entryPrice?: number; // yesEntryPrice in basis points
  noEntryPrice?: number; // the pool returns this too; it used to be read as exitedEarly
  exitedEarly?: boolean; // Whether user exited early
  exitAmount?: number; // Amount received from early exit
  /**
   * V3 only. The contract replaced entry prices with a weight fixed at bet
   * time, which decides how the losing pool is split. Same slot positions in
   * the returned tuple, different meaning, so these are named separately rather
   * than reusing entryPrice: a weight of 15000 stored as a price in basis
   * points reads as a plausible number and is wrong.
   */
  weightedYes?: number;
  weightedNo?: number;
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

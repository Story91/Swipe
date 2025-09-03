// Redis types - safe to import on client side
export interface RedisPrediction {
  id: string;
  question: string;
  description: string;
  category: string;
  imageUrl: string;
  includeChart: boolean;
  selectedCrypto?: string;
  endDate: string;
  endTime: string;
  deadline: number; // Unix timestamp
  resolutionDeadline?: number; // Unix timestamp - when admin must resolve by
  yesTotalAmount: number;
  noTotalAmount: number;
  resolved: boolean;
  outcome?: boolean;
  cancelled: boolean;
  createdAt: number; // Unix timestamp
  creator: string;
  verified: boolean;
  approved: boolean;
  needsApproval: boolean;
  participants: string[];
  totalStakes: number;
  marketStats?: {
    yesPercentage: number;
    noPercentage: number;
    timeLeft: number;
    totalPool: number;
  };
}

export interface RedisUserStake {
  userId: string;
  predictionId: string;
  yesAmount: number;
  noAmount: number;
  claimed: boolean;
  stakedAt: number;
}

// User transaction interface
export interface UserTransaction {
  id: string;
  type: 'claim' | 'stake' | 'resolve' | 'cancel';
  predictionId: string;
  predictionQuestion: string;
  amount?: number;
  txHash: string;
  basescanUrl: string;
  timestamp: number;
  status: 'pending' | 'success' | 'failed';
  blockNumber?: number;
  gasUsed?: number;
}

export interface RedisMarketStats {
  totalPredictions: number;
  totalStakes: number;
  activePredictions: number;
  resolvedPredictions: number;
  totalParticipants: number;
  lastUpdated: number;
}

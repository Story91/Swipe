import { Redis } from "@upstash/redis";
import type { 
  RedisPrediction, 
  RedisUserStake, 
  UserTransaction, 
  RedisMarketStats 
} from './types/redis';

// Initialize Redis with environment variables
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  throw new Error(
    'Missing Redis credentials. Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.'
  );
}

export const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

// Redis key patterns for predictions
export const REDIS_KEYS = {
  PREDICTIONS: 'predictions',
  PREDICTION: (id: string) => `prediction:${id}`,
  PREDICTIONS_BY_CATEGORY: (category: string) => `predictions:category:${category}`,
  PREDICTIONS_BY_CREATOR: (creator: string) => `predictions:creator:${creator}`,
  PREDICTIONS_ACTIVE: 'predictions:active',
  PREDICTIONS_RESOLVED: 'predictions:resolved',
  PREDICTIONS_PENDING_APPROVAL: 'predictions:pending_approval',
  PREDICTIONS_COUNT: 'predictions:count',
  USER_STAKES: (userId: string, predictionId: string) => `user_stakes:${userId}:${predictionId}`,
  USER_TRANSACTIONS: (userId: string) => `user_transactions:${userId}`,
  MARKET_STATS: 'market:stats',
  COMPACT_STATS: 'market:compact_stats',
  REAL_LEADERBOARD: 'leaderboard:real_data',
  USER_PORTFOLIO: (userId: string) => `user:portfolio:${userId}`,
  SWIPE_CLAIM_HISTORY: (userId: string) => `swipe_claim_history:${userId}`,
} as const;

// Import types from separate file
export type { 
  RedisPrediction, 
  RedisUserStake, 
  UserTransaction, 
  RedisMarketStats 
} from './types/redis';

// Helper functions for Redis operations
export const redisHelpers = {
  // Save prediction to Redis
  async savePrediction(prediction: RedisPrediction): Promise<void> {
    try {
      const predictionKey = REDIS_KEYS.PREDICTION(prediction.id);
      
      // Save individual prediction
      await redis.set(predictionKey, JSON.stringify(prediction));
      
      // Add to predictions list
      await redis.sadd(REDIS_KEYS.PREDICTIONS, prediction.id);
      
      // Add to category index
      await redis.sadd(REDIS_KEYS.PREDICTIONS_BY_CATEGORY(prediction.category), prediction.id);
      
      // Add to creator index
      await redis.sadd(REDIS_KEYS.PREDICTIONS_BY_CREATOR(prediction.creator), prediction.id);
      
      // Add to appropriate status index
      if (prediction.needsApproval) {
        await redis.sadd(REDIS_KEYS.PREDICTIONS_PENDING_APPROVAL, prediction.id);
      } else if (prediction.resolved) {
        await redis.sadd(REDIS_KEYS.PREDICTIONS_RESOLVED, prediction.id);
      } else {
        await redis.sadd(REDIS_KEYS.PREDICTIONS_ACTIVE, prediction.id);
      }
      
      // Update count
      await redis.incr(REDIS_KEYS.PREDICTIONS_COUNT);
      
      console.log(`✅ Prediction ${prediction.id} saved to Redis`);
    } catch (error) {
      console.error('❌ Failed to save prediction to Redis:', error);
      throw error;
    }
  },

  // Get prediction by ID with live data
  async getPrediction(id: string): Promise<RedisPrediction | null> {
    try {
      const predictionKey = REDIS_KEYS.PREDICTION(id);
      const data = await redis.get(predictionKey);
      
      if (!data) return null;
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Validate that parsed data has required fields
      if (parsed && typeof parsed === 'object' && 'id' in parsed && 'question' in parsed) {
        return parsed as RedisPrediction;
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Failed to get prediction ${id} from Redis:`, error);
      return null;
    }
  },

  // Get all predictions (only live/real predictions, exclude test data)
  async getAllPredictions(): Promise<RedisPrediction[]> {
    try {
      const predictionIds = await redis.smembers(REDIS_KEYS.PREDICTIONS);
      const predictions: RedisPrediction[] = [];

      for (const id of predictionIds) {
        const prediction = await this.getPrediction(id);
        if (prediction) {
          // Filter out test predictions
          const isTestPrediction = id.startsWith('test_') ||
            prediction.creator === 'anonymous' ||
            prediction.creator.toLowerCase().includes('test');

          if (!isTestPrediction) {
            predictions.push(prediction);
          }
        }
      }

      // Sort by creation date (newest first)
      return predictions.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('❌ Failed to get all predictions from Redis:', error);
      return [];
    }
  },

  // Get active predictions (only live/real predictions, exclude test data)
  async getActivePredictions(): Promise<RedisPrediction[]> {
    try {
      const activeIds = await redis.smembers(REDIS_KEYS.PREDICTIONS_ACTIVE);
      const predictions: RedisPrediction[] = [];
      const currentTime = Math.floor(Date.now() / 1000);

      for (const id of activeIds) {
        const prediction = await this.getPrediction(id);
        if (prediction && !prediction.resolved && !prediction.cancelled) {
          // Check if deadline has not passed
          const deadlineNotPassed = prediction.deadline > currentTime;
          
          // Filter out test predictions
          const isTestPrediction = id.startsWith('test_') ||
            prediction.creator === 'anonymous' ||
            prediction.creator.toLowerCase().includes('test');

          if (!isTestPrediction && deadlineNotPassed) {
            predictions.push(prediction);
          }
        }
      }

      return predictions.sort((a, b) => a.deadline - b.deadline); // Sort by deadline
    } catch (error) {
      console.error('❌ Failed to get active predictions from Redis:', error);
      return [];
    }
  },

  // Get predictions by category (only live/real predictions, exclude test data)
  async getPredictionsByCategory(category: string): Promise<RedisPrediction[]> {
    try {
      const categoryIds = await redis.smembers(REDIS_KEYS.PREDICTIONS_BY_CATEGORY(category));
      const predictions: RedisPrediction[] = [];

      for (const id of categoryIds) {
        const prediction = await this.getPrediction(id);
        if (prediction) {
          // Filter out test predictions
          const isTestPrediction = id.startsWith('test_') ||
            prediction.creator === 'anonymous' ||
            prediction.creator.toLowerCase().includes('test');

          if (!isTestPrediction) {
            predictions.push(prediction);
          }
        }
      }

      return predictions.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error(`❌ Failed to get ${category} predictions from Redis:`, error);
      return [];
    }
  },

  // Save user stake (supports both single stake and multi-token stakes)
  async saveUserStake(stake: RedisUserStake | any): Promise<void> {
    try {
      const stakeKey = REDIS_KEYS.USER_STAKES(stake.user, stake.predictionId);
      await redis.set(stakeKey, JSON.stringify(stake));
      console.log(`✅ User stake saved to Redis: ${stake.user} on ${stake.predictionId}`, stake);
    } catch (error) {
      console.error('❌ Failed to save user stake to Redis:', error);
      throw error;
    }
  },

  // Get user stakes for a prediction (supports both single and multi-token format)
  async getUserStakes(predictionId: string): Promise<RedisUserStake[]> {
    try {
      // This is a simplified approach - in production you might want to use a different pattern
      const pattern = `user_stakes:*:${predictionId}`;
      console.log(`🔍 Searching for stakes with pattern: ${pattern}`);
      const keys = await redis.keys(pattern);
      console.log(`🔍 Found keys:`, keys);
      const stakes: RedisUserStake[] = [];
      
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          const stake = typeof data === 'string' ? JSON.parse(data) : data;
          console.log(`🔍 Found stake:`, stake);
          
          // Check if this is a multi-token stake (V2) or single stake (V1)
          if (stake.ETH || stake.SWIPE) {
            // Multi-token stake - convert to array format
            if (stake.ETH) {
              stakes.push({
                user: stake.user,
                predictionId: stake.predictionId,
                yesAmount: stake.ETH.yesAmount,
                noAmount: stake.ETH.noAmount,
                claimed: stake.ETH.claimed,
                stakedAt: stake.stakedAt,
                contractVersion: stake.contractVersion,
                tokenType: 'ETH'
              });
            }
            if (stake.SWIPE) {
              stakes.push({
                user: stake.user,
                predictionId: stake.predictionId,
                yesAmount: stake.SWIPE.yesAmount,
                noAmount: stake.SWIPE.noAmount,
                claimed: stake.SWIPE.claimed,
                stakedAt: stake.stakedAt,
                contractVersion: stake.contractVersion,
                tokenType: 'SWIPE'
              });
            }
          } else {
            // Single stake (V1)
            stakes.push(stake as RedisUserStake);
          }
        }
      }
      
      return stakes;
    } catch (error) {
      console.error(`❌ Failed to get user stakes for prediction ${predictionId}:`, error);
      return [];
    }
  },

  // Update market stats
  async updateMarketStats(): Promise<void> {
    try {
      const activePredictions = await this.getActivePredictions();
      const allPredictions = await this.getAllPredictions();
      
      const stats: RedisMarketStats = {
        totalPredictions: allPredictions.length,
        totalStakes: allPredictions.reduce((sum, p) => sum + (p.totalStakes || 0), 0),
        activePredictions: activePredictions.length,
        resolvedPredictions: allPredictions.filter(p => p.resolved).length,
        totalParticipants: new Set(allPredictions.flatMap(p => p.participants || [])).size,
        lastUpdated: Date.now()
      };
      
      await redis.set(REDIS_KEYS.MARKET_STATS, JSON.stringify(stats));
      console.log('✅ Market stats updated in Redis');
      
      // Also update compact stats cache
      await this.updateCompactStats();
    } catch (error) {
      console.error('❌ Failed to update market stats in Redis:', error);
    }
  },

  // Get market stats
  async getMarketStats(): Promise<RedisMarketStats | null> {
    try {
      const data = await redis.get(REDIS_KEYS.MARKET_STATS);
      
      if (!data) return null;
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Validate that parsed data has required fields
      if (parsed && typeof parsed === 'object' && 'totalPredictions' in parsed && 'totalStakes' in parsed) {
        return parsed as RedisMarketStats;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to get market stats from Redis:', error);
      return null;
    }
  },

  // Save real leaderboard data
  async saveRealLeaderboardData(data: any): Promise<void> {
    try {
      const leaderboardData = {
        ...data,
        lastUpdated: Date.now(),
        timestamp: new Date().toISOString()
      };
      
      await redis.set(REDIS_KEYS.REAL_LEADERBOARD, JSON.stringify(leaderboardData));
      console.log('💾 Real leaderboard data saved to Redis');
    } catch (error) {
      console.error('❌ Failed to save real leaderboard data to Redis:', error);
      throw error;
    }
  },

  // Get real leaderboard data
  async getRealLeaderboardData(): Promise<any | null> {
    try {
      const data = await redis.get(REDIS_KEYS.REAL_LEADERBOARD);
      if (!data) return null;
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return parsed;
    } catch (error) {
      console.error('❌ Failed to get real leaderboard data from Redis:', error);
      return null;
    }
  },

  // Delete prediction (for cleanup)
  async deletePrediction(id: string): Promise<void> {
    try {
      const prediction = await this.getPrediction(id);
      if (!prediction) return;
      
      // Remove from all indexes
      await redis.srem(REDIS_KEYS.PREDICTIONS, id);
      await redis.srem(REDIS_KEYS.PREDICTIONS_BY_CATEGORY(prediction.category), id);
      await redis.srem(REDIS_KEYS.PREDICTIONS_BY_CREATOR(prediction.creator), id);
      await redis.srem(REDIS_KEYS.PREDICTIONS_ACTIVE, id);
      await redis.srem(REDIS_KEYS.PREDICTIONS_RESOLVED, id);
      await redis.srem(REDIS_KEYS.PREDICTIONS_PENDING_APPROVAL, id);
      
      // Delete individual prediction
      await redis.del(REDIS_KEYS.PREDICTION(id));
      
      // Update count
      await redis.decr(REDIS_KEYS.PREDICTIONS_COUNT);
      
      console.log(`✅ Prediction ${id} deleted from Redis`);
    } catch (error) {
      console.error(`❌ Failed to delete prediction ${id} from Redis:`, error);
      throw error;
    }
  },

  // Save user transaction
  async saveUserTransaction(userId: string, transaction: UserTransaction): Promise<void> {
    try {
      const transactionsKey = REDIS_KEYS.USER_TRANSACTIONS(userId);
      const existingData = await redis.get(transactionsKey);
      let transactions: UserTransaction[] = [];
      
      if (existingData) {
        const parsed = typeof existingData === 'string' ? JSON.parse(existingData) : existingData;
        if (Array.isArray(parsed)) {
          transactions = parsed;
        }
      }
      
      // Add new transaction at the beginning
      transactions.unshift(transaction);
      
      // Keep only last 50 transactions
      if (transactions.length > 50) {
        transactions = transactions.slice(0, 50);
      }
      
      await redis.set(transactionsKey, JSON.stringify(transactions));
      console.log(`✅ User transaction saved: ${userId} - ${transaction.type} - ${transaction.txHash}`);
    } catch (error) {
      console.error('❌ Failed to save user transaction to Redis:', error);
      throw error;
    }
  },

  // Get user transactions
  async getUserTransactions(userId: string): Promise<UserTransaction[]> {
    try {
      const transactionsKey = REDIS_KEYS.USER_TRANSACTIONS(userId);
      const data = await redis.get(transactionsKey);
      
      if (!data) return [];
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      
      if (Array.isArray(parsed)) {
        return parsed as UserTransaction[];
      }
      
      return [];
    } catch (error) {
      console.error('❌ Failed to get user transactions from Redis:', error);
      return [];
    }
  },

  // Update transaction status
  async updateTransactionStatus(userId: string, txHash: string, status: 'pending' | 'success' | 'failed', blockNumber?: number, gasUsed?: number): Promise<void> {
    try {
      const transactionsKey = REDIS_KEYS.USER_TRANSACTIONS(userId);
      const data = await redis.get(transactionsKey);
      
      if (!data) return;
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      
      if (Array.isArray(parsed)) {
        const transactions = parsed as UserTransaction[];
        const transaction = transactions.find(t => t.txHash === txHash);
        
        if (transaction) {
          transaction.status = status;
          if (blockNumber) transaction.blockNumber = blockNumber;
          if (gasUsed) transaction.gasUsed = gasUsed;
          
          await redis.set(transactionsKey, JSON.stringify(transactions));
          console.log(`✅ Transaction status updated: ${txHash} - ${status}`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to update transaction status in Redis:', error);
    }
  },

  // Update compact stats cache
  async updateCompactStats(): Promise<void> {
    try {
      const [marketStats, allPredictions] = await Promise.all([
        this.getMarketStats(),
        this.getAllPredictions()
      ]);

      if (!marketStats) return;

      // Calculate ETH and SWIPE volumes from ALL predictions (V1 and V2)
      let totalETH = 0;
      let totalSWIPE = 0;
      
      allPredictions.forEach((pred) => {
        totalETH += (pred.yesTotalAmount || 0) + (pred.noTotalAmount || 0);
        totalSWIPE += (pred.swipeYesTotalAmount || 0) + (pred.swipeNoTotalAmount || 0);
      });

      // Get active predictions for additional metrics
      const activePredictions = await this.getActivePredictions();
      
      // Calculate additional metrics
      const now = Math.floor(Date.now() / 1000);
      const predictionsEndingToday = activePredictions.filter(p => {
        const endDate = new Date(p.deadline * 1000);
        const today = new Date();
        return endDate.toDateString() === today.toDateString();
      }).length;

      // Get top category from active predictions
      const categoryBreakdown = activePredictions.reduce((acc, p) => {
        acc[p.category] = (acc[p.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const topCategory = Object.entries(categoryBreakdown)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'General';

      // Calculate success rate from all predictions
      const successRate = allPredictions.length > 0 
        ? (allPredictions.filter(p => p.resolved).length / allPredictions.length) * 100 
        : 0;

      // Get trending predictions from active predictions
      const trendingPredictions = activePredictions
        .map(pred => ({
          id: pred.id,
          question: pred.question,
          volumeETH: (pred.yesTotalAmount || 0) + (pred.noTotalAmount || 0),
          volumeSWIPE: (pred.swipeYesTotalAmount || 0) + (pred.swipeNoTotalAmount || 0),
          participants: pred.participants?.length || 0,
          isPositive: Math.random() > 0.5
        }))
        .sort((a, b) => (b.volumeETH + b.volumeSWIPE) - (a.volumeETH + a.volumeSWIPE))
        .slice(0, 3);

      const compactStats = {
        totalPredictions: marketStats.totalPredictions,
        activePredictions: marketStats.activePredictions,
        totalVolumeETH: totalETH,
        totalVolumeSWIPE: totalSWIPE,
        predictionsToday: predictionsEndingToday,
        topCategory,
        successRate,
        totalParticipants: marketStats.totalParticipants,
        trendingPredictions,
        lastUpdated: Date.now()
      };

      await redis.set(REDIS_KEYS.COMPACT_STATS, JSON.stringify(compactStats));
      console.log('✅ Compact stats updated in Redis');
    } catch (error) {
      console.error('❌ Failed to update compact stats in Redis:', error);
    }
  },

  // Get compact stats from cache
  async getCompactStats(): Promise<any | null> {
    try {
      const data = await redis.get(REDIS_KEYS.COMPACT_STATS);
      
      if (!data) return null;
      
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Check if cache is fresh (less than 2 minutes old)
      const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
      if (parsed.lastUpdated && parsed.lastUpdated < twoMinutesAgo) {
        console.log('🔄 Compact stats cache expired, updating...');
        await this.updateCompactStats();
        return await this.getCompactStats();
      }
      
      return parsed;
    } catch (error) {
      console.error('❌ Failed to get compact stats from Redis:', error);
      return null;
    }
  }
};



// Export default redis instance for backward compatibility
export default redis;

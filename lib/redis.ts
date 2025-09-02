import { Redis } from "@upstash/redis";

// Initialize Redis with user's credentials
export const redis = new Redis({
  url: 'https://immortal-reptile-46683.upstash.io',
  token: 'AbZbAAIncDE4Mzc0NzlmMWM3YzE0OWNlYmM4MzA1MDBkYTE0NWUwYXAxNDY2ODM',
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
  MARKET_STATS: 'market:stats',
  USER_PORTFOLIO: (userId: string) => `user:portfolio:${userId}`,
} as const;

// Types for Redis data
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

export interface RedisMarketStats {
  totalPredictions: number;
  totalStakes: number;
  activePredictions: number;
  resolvedPredictions: number;
  totalParticipants: number;
  lastUpdated: number;
}

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

  // Get prediction by ID
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
            prediction.question.toLowerCase().includes('test') ||
            prediction.description.toLowerCase().includes('test') ||
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
            prediction.question.toLowerCase().includes('test') ||
            prediction.description.toLowerCase().includes('test') ||
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
            prediction.question.toLowerCase().includes('test') ||
            prediction.description.toLowerCase().includes('test') ||
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

  // Save user stake
  async saveUserStake(stake: RedisUserStake): Promise<void> {
    try {
      const stakeKey = REDIS_KEYS.USER_STAKES(stake.userId, stake.predictionId);
      await redis.set(stakeKey, JSON.stringify(stake));
      console.log(`✅ User stake saved to Redis: ${stake.userId} on ${stake.predictionId}`);
    } catch (error) {
      console.error('❌ Failed to save user stake to Redis:', error);
      throw error;
    }
  },

  // Get user stakes for a prediction
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
          stakes.push(stake);
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
  }
};

// Export default redis instance for backward compatibility
export default redis;

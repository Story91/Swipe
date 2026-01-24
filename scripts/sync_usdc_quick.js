require('dotenv').config();
const { Redis } = require('@upstash/redis');
const hre = require("hardhat");

// Initialize Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// USDC Contract
const USDC_DUALPOOL_ADDRESS = "0xf5Fa6206c2a7d5473ae7468082c9D260DFF83205";
const USDC_DUALPOOL_ABI = [
  "function getPrediction(uint256 predictionId) view returns (bool registered, address creator, uint256 deadline, uint256 yesPool, uint256 noPool, bool resolved, bool cancelled, bool outcome, uint256 participantCount)"
];

// Only sync these specific predictions (registered on USDC contract)
const USDC_PREDICTION_IDS = [224, 225, 226];

async function main() {
  console.log("============================================================");
  console.log("Quick Sync: USDC Contract Data to Redis");
  console.log("============================================================\n");

  const provider = hre.ethers.provider;
  const contract = new hre.ethers.Contract(USDC_DUALPOOL_ADDRESS, USDC_DUALPOOL_ABI, provider);

  for (const numericId of USDC_PREDICTION_IDS) {
    const redisId = `pred_v2_${numericId}`;
    
    try {
      // Check USDC contract
      const usdcData = await contract.getPrediction(numericId);
      
      if (usdcData.registered) {
        // Get current Redis data
        const predData = await redis.get(`prediction:${redisId}`);
        if (!predData) {
          console.log(`⚠️ ${redisId}: Not found in Redis`);
          continue;
        }
        
        const pred = typeof predData === 'string' ? JSON.parse(predData) : predData;
        
        // Update with USDC data
        const yesPoolUsdc = Number(usdcData.yesPool) / 1e6;
        const noPoolUsdc = Number(usdcData.noPool) / 1e6;
        
        const updated = {
          ...pred,
          usdcPoolEnabled: true,
          usdcYesTotalAmount: Number(usdcData.yesPool),
          usdcNoTotalAmount: Number(usdcData.noPool),
          usdcResolved: usdcData.resolved,
          usdcCancelled: usdcData.cancelled,
          usdcOutcome: usdcData.outcome,
          usdcParticipantCount: Number(usdcData.participantCount)
        };
        
        // Save back to Redis
        await redis.set(`prediction:${redisId}`, JSON.stringify(updated));
        
        console.log(`✅ ${redisId}: USDC enabled`);
        console.log(`   Pool: YES=${yesPoolUsdc.toFixed(2)} USDC / NO=${noPoolUsdc.toFixed(2)} USDC`);
        console.log(`   Participants: ${usdcData.participantCount}`);
      } else {
        console.log(`❌ ${redisId}: Not registered on USDC contract`);
      }
    } catch (error) {
      console.log(`❌ ${redisId}: Error - ${error.message}`);
    }
  }

  console.log("\n✅ Quick sync complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

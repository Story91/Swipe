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

async function main() {
  console.log("============================================================");
  console.log("Syncing USDC Contract Data to Redis");
  console.log("============================================================\n");

  const provider = hre.ethers.provider;
  const contract = new hre.ethers.Contract(USDC_DUALPOOL_ADDRESS, USDC_DUALPOOL_ABI, provider);

  // Get all predictions from Redis active set
  const activeIds = await redis.smembers('predictions:active');
  console.log(`Found ${activeIds.length} active predictions in Redis\n`);

  let updatedCount = 0;

  for (const redisId of activeIds) {
    // Extract numeric ID from "pred_v2_X" format
    const numericId = parseInt(redisId.replace('pred_v2_', ''), 10);
    if (isNaN(numericId)) continue;

    try {
      // Check if registered on USDC contract
      const usdcData = await contract.getPrediction(numericId);
      
      if (usdcData.registered) {
        // Get current Redis data
        const predData = await redis.get(`prediction:${redisId}`);
        if (!predData) continue;
        
        const pred = typeof predData === 'string' ? JSON.parse(predData) : predData;
        
        // Update with USDC data
        const yesPoolUsdc = Number(usdcData.yesPool) / 1e6; // USDC has 6 decimals
        const noPoolUsdc = Number(usdcData.noPool) / 1e6;
        
        const updated = {
          ...pred,
          usdcPoolEnabled: true,
          usdcYesTotalAmount: Number(usdcData.yesPool), // raw value (6 decimals)
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
        updatedCount++;
      } else {
        console.log(`⏭️ ${redisId}: Not registered on USDC contract`);
      }
    } catch (error) {
      // Prediction not found on contract
      console.log(`⏭️ ${redisId}: Not on USDC contract`);
    }
  }

  console.log("\n============================================================");
  console.log(`DONE: Updated ${updatedCount} predictions with USDC data`);
  console.log("============================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

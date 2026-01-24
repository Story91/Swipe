require('dotenv').config();
const { Redis } = require('@upstash/redis');

// Initialize Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function main() {
  console.log("============================================================");
  console.log("Checking Live Predictions from Redis");
  console.log("============================================================\n");

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error("❌ Missing Redis credentials in .env file!");
    process.exit(1);
  }

  // Get all prediction IDs from active set
  const activeIds = await redis.smembers('predictions:active');
  console.log(`Found ${activeIds.length} predictions in active set\n`);

  const now = Math.floor(Date.now() / 1000);
  const livePredictions = [];

  console.log("Scanning for live predictions (not resolved, not cancelled, future deadline)...\n");

  for (const id of activeIds) {
    try {
      const predData = await redis.get(`prediction:${id}`);
      if (!predData) continue;
      
      const pred = typeof predData === 'string' ? JSON.parse(predData) : predData;
      
      // Skip test predictions
      if (id.startsWith('test_') || pred.creator === 'anonymous') continue;
      
      const isLive = !pred.resolved && !pred.cancelled && pred.deadline > now;
      
      if (isLive) {
        // Extract numeric ID from "pred_v2_X" format
        const numericId = id.replace('pred_v2_', '');
        
        livePredictions.push({
          id: numericId,
          fullId: id,
          question: pred.question?.substring(0, 60) + (pred.question?.length > 60 ? "..." : ""),
          deadline: pred.deadline,
          deadlineDate: new Date(pred.deadline * 1000).toISOString(),
          creator: pred.creator,
          category: pred.category,
          totalStakes: pred.totalStakes || 0,
          ethYes: (pred.yesTotalAmount || 0) / 1e18,
          ethNo: (pred.noTotalAmount || 0) / 1e18,
          swipeYes: (pred.swipeYesTotalAmount || 0) / 1e18,
          swipeNo: (pred.swipeNoTotalAmount || 0) / 1e18
        });
        
        console.log(`✅ Prediction ${id} - LIVE`);
        console.log(`   Question: ${pred.question?.substring(0, 60)}...`);
        console.log(`   Category: ${pred.category}`);
        console.log(`   Deadline: ${new Date(pred.deadline * 1000).toLocaleString()}`);
        console.log(`   Creator: ${pred.creator}`);
        console.log(`   Total Stakes: ${pred.totalStakes || 0}`);
        console.log(`   ETH Pools: YES=${((pred.yesTotalAmount || 0) / 1e18).toFixed(6)} / NO=${((pred.noTotalAmount || 0) / 1e18).toFixed(6)}`);
        console.log(`   SWIPE Pools: YES=${((pred.swipeYesTotalAmount || 0) / 1e18).toFixed(2)} / NO=${((pred.swipeNoTotalAmount || 0) / 1e18).toFixed(2)}`);
        console.log("");
      }
    } catch (e) {
      console.log(`⚠️ Error reading prediction ${id}: ${e.message}`);
    }
  }

  console.log("\n============================================================");
  console.log(`SUMMARY: Found ${livePredictions.length} live predictions`);
  console.log("============================================================\n");

  if (livePredictions.length > 0) {
    console.log("📋 IDs for registration script (copy this to register_predictions_usdc.js):");
    console.log("const PREDICTIONS_TO_REGISTER = [");
    livePredictions.forEach(p => {
      console.log(`  { id: ${p.id}, creator: "${p.creator}", deadline: ${p.deadline} },`);
    });
    console.log("];");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

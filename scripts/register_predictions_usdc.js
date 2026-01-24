const hre = require("hardhat");

// Contract addresses on Base Mainnet
const USDC_DUALPOOL_ADDRESS = "0xf5Fa6206c2a7d5473ae7468082c9D260DFF83205";

const USDC_DUALPOOL_ABI = [
  "function registerPrediction(uint256 predictionId, address creator, uint256 deadline) external",
  "function registerPredictionsBatch(uint256[] predictionIds, address[] creators, uint256[] deadlines) external",
  "function getPrediction(uint256 predictionId) view returns (bool registered, address creator, uint256 deadline, uint256 yesPool, uint256 noPool, bool resolved, bool cancelled, bool outcome, uint256 participantCount)",
  "function resolvers(address) view returns (bool)",
];

// Live predictions from Redis (run check_live_predictions.js to update)
const PREDICTIONS_TO_REGISTER = [
  { id: 224, creator: "0xb4acA7a95F4B618eD97A5b3593372abeB0c0C1eb", deadline: 1769196267 },
  { id: 225, creator: "0xb4acA7a95F4B618eD97A5b3593372abeB0c0C1eb", deadline: 1769268533 },
  { id: 226, creator: "0xb4acA7a95F4B618eD97A5b3593372abeB0c0C1eb", deadline: 1769369599 },
];

async function main() {
  console.log("=".repeat(60));
  console.log("Registering Predictions in USDC DualPool Contract");
  console.log("=".repeat(60));
  console.log("\nNetwork:", hre.network.name);

  const [signer] = await hre.ethers.getSigners();
  console.log("Signer:", signer.address);

  const usdcContract = new hre.ethers.Contract(
    USDC_DUALPOOL_ADDRESS,
    USDC_DUALPOOL_ABI,
    signer
  );

  // Check if signer is resolver
  const isResolver = await usdcContract.resolvers(signer.address);
  console.log("Is resolver:", isResolver);
  
  if (!isResolver) {
    console.log("❌ Signer is not a resolver! Cannot register predictions.");
    return;
  }

  // Use hardcoded predictions list
  const predictions = PREDICTIONS_TO_REGISTER;
  console.log(`\nUsing ${predictions.length} predictions from list`);
  
  if (predictions.length === 0) {
    console.log("⚠️ No predictions to register. Run check_live_predictions.js first.");
    return;
  }

  // Filter out already registered predictions
  const toRegister = [];
  for (const pred of predictions) {
    try {
      const existing = await usdcContract.getPrediction(pred.id);
      if (!existing.registered) {
        toRegister.push(pred);
        console.log(`  ✓ Will register: ${pred.id}`);
      } else {
        console.log(`  - Already registered: ${pred.id}`);
      }
    } catch (error) {
      toRegister.push(pred);
      console.log(`  ✓ Will register: ${pred.id}`);
    }
  }

  if (toRegister.length === 0) {
    console.log("\n✅ All predictions already registered!");
    return;
  }

  console.log(`\nRegistering ${toRegister.length} predictions...`);

  // Register in batches of 10
  const batchSize = 10;
  for (let i = 0; i < toRegister.length; i += batchSize) {
    const batch = toRegister.slice(i, i + batchSize);
    
    if (batch.length === 1) {
      // Single registration
      const pred = batch[0];
      console.log(`\nRegistering prediction ${pred.id}...`);
      
      try {
        const tx = await usdcContract.registerPrediction(
          pred.id,
          pred.creator,
          pred.deadline,
          { gasLimit: 200000 }
        );
        console.log(`  Tx: ${tx.hash}`);
        await tx.wait();
        console.log(`  ✅ Registered!`);
      } catch (error) {
        console.log(`  ❌ Failed: ${error.message}`);
      }
    } else {
      // Batch registration
      console.log(`\nRegistering batch of ${batch.length} predictions...`);
      
      const ids = batch.map(p => p.id);
      const creators = batch.map(p => p.creator);
      const deadlines = batch.map(p => p.deadline);
      
      try {
        const tx = await usdcContract.registerPredictionsBatch(
          ids,
          creators,
          deadlines,
          { gasLimit: 100000 * batch.length }
        );
        console.log(`  Tx: ${tx.hash}`);
        await tx.wait();
        console.log(`  ✅ Batch registered!`);
      } catch (error) {
        console.log(`  ❌ Batch failed: ${error.message}`);
        // Try individual registration
        for (const pred of batch) {
          try {
            const tx = await usdcContract.registerPrediction(
              pred.id,
              pred.creator,
              pred.deadline,
              { gasLimit: 200000 }
            );
            await tx.wait();
            console.log(`    ✅ Registered ${pred.id}`);
          } catch (err) {
            console.log(`    ❌ Failed ${pred.id}: ${err.message}`);
          }
        }
      }
    }
    
    // Wait between batches
    if (i + batchSize < toRegister.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Registration complete!");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

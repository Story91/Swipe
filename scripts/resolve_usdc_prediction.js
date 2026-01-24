/**
 * Resolve USDC DualPool prediction
 * Usage: npx hardhat run scripts/resolve_usdc_prediction.js --network base
 * 
 * Set environment variables:
 * - PREDICTION_ID: numeric prediction ID (e.g., 225)
 * - OUTCOME: true for YES, false for NO (default: true)
 */

const hre = require("hardhat");

const USDC_DUALPOOL_ADDRESS = "0xf5Fa6206c2a7d5473ae7468082c9D260DFF83205";

const USDC_DUALPOOL_ABI = [
  "function resolvePrediction(uint256 predictionId, bool outcome) external",
  "function getPrediction(uint256 predictionId) external view returns (bool registered, address creator, uint256 deadline, uint256 yesPool, uint256 noPool, bool resolved, bool cancelled, bool outcome, uint256 createdAt, uint256 resolvedAt, uint256 creatorReward)",
  "function resolver() external view returns (address)",
  "function owner() external view returns (address)"
];

async function main() {
  const predictionId = parseInt(process.env.PREDICTION_ID);
  const outcome = process.env.OUTCOME !== 'false'; // default true (YES wins)
  
  if (isNaN(predictionId)) {
    console.error("❌ Please set PREDICTION_ID environment variable");
    console.log("Usage: PREDICTION_ID=225 OUTCOME=true npx hardhat run scripts/resolve_usdc_prediction.js --network base");
    process.exit(1);
  }
  
  console.log(`\n🎯 Resolving USDC DualPool prediction ${predictionId} as ${outcome ? 'YES' : 'NO'}...\n`);
  
  const [signer] = await hre.ethers.getSigners();
  console.log(`📍 Using signer: ${signer.address}`);
  
  const contract = new hre.ethers.Contract(USDC_DUALPOOL_ADDRESS, USDC_DUALPOOL_ABI, signer);
  
  // Check current state
  console.log(`\n📊 Checking prediction ${predictionId} state...`);
  try {
    const pred = await contract.getPrediction(predictionId);
    console.log(`   Registered: ${pred[0]}`);
    console.log(`   Creator: ${pred[1]}`);
    console.log(`   YES Pool: $${Number(pred[3]) / 1e6}`);
    console.log(`   NO Pool: $${Number(pred[4]) / 1e6}`);
    console.log(`   Resolved: ${pred[5]}`);
    console.log(`   Cancelled: ${pred[6]}`);
    console.log(`   Outcome: ${pred[7] ? 'YES' : 'NO'}`);
    
    if (!pred[0]) {
      console.error(`\n❌ Prediction ${predictionId} is not registered in USDC contract!`);
      process.exit(1);
    }
    
    if (pred[5]) {
      console.log(`\n✅ Prediction ${predictionId} is already resolved as ${pred[7] ? 'YES' : 'NO'}`);
      process.exit(0);
    }
    
    if (pred[6]) {
      console.error(`\n❌ Prediction ${predictionId} is cancelled!`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Failed to get prediction: ${error.message}`);
    process.exit(1);
  }
  
  // Check if signer is resolver
  const resolver = await contract.resolver();
  const owner = await contract.owner();
  console.log(`\n🔐 Resolver: ${resolver}`);
  console.log(`🔐 Owner: ${owner}`);
  console.log(`🔐 Signer: ${signer.address}`);
  
  if (signer.address.toLowerCase() !== resolver.toLowerCase() && 
      signer.address.toLowerCase() !== owner.toLowerCase()) {
    console.error(`\n❌ Signer is not resolver or owner!`);
    process.exit(1);
  }
  
  // Resolve
  console.log(`\n🚀 Sending resolvePrediction(${predictionId}, ${outcome})...`);
  
  try {
    const tx = await contract.resolvePrediction(predictionId, outcome);
    console.log(`📝 Transaction hash: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
    
    // Verify
    const predAfter = await contract.getPrediction(predictionId);
    console.log(`\n✅ Prediction ${predictionId} resolved as ${predAfter[7] ? 'YES' : 'NO'}!`);
    
  } catch (error) {
    console.error(`\n❌ Transaction failed: ${error.message}`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

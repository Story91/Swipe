const hre = require("hardhat");

async function main() {
  console.log("Deploying SwipeClaim contract...");

  // V2 Contract Address (PredictionMarket V2)
  const V2_CONTRACT_ADDRESS = "0x2bA339Df34B98099a9047d9442075F7B3a792f74";
  
  // SWIPE TOKEN ADDRESS on Base
  const SWIPE_TOKEN_ADDRESS = "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9";

  // Deploy contract
  const SwipeClaim = await hre.ethers.getContractFactory("SwipeClaim");
  const swipeClaim = await SwipeClaim.deploy(V2_CONTRACT_ADDRESS, SWIPE_TOKEN_ADDRESS);

  await swipeClaim.waitForDeployment();

  const contractAddress = await swipeClaim.getAddress();
  console.log("\n✅ SwipeClaim deployed successfully!");
  console.log("Contract Address:", contractAddress);
  console.log("V2 Contract Address:", V2_CONTRACT_ADDRESS);
  console.log("SWIPE Token Address:", SWIPE_TOKEN_ADDRESS);
  
  console.log("\n📋 Contract Configuration:");
  console.log("- Tier 1: 10+ bets = 1,000,000 SWIPE (1M)");
  console.log("- Tier 2: 25+ bets = 10,000,000 SWIPE (10M)");
  console.log("- Tier 3: 50+ bets = 15,000,000 SWIPE (15M)");
  console.log("- Tier 4: 100+ bets = 25,000,000 SWIPE (25M) - MAX");
  console.log("- Max Prediction ID to check: 1000 (can be updated by owner)");
  console.log("- Counts both ETH stakes (placeStake) and SWIPE stakes (placeStakeWithToken)");
  
  console.log("\n⚠️  Next Steps:");
  console.log("1. Fund the contract with SWIPE tokens using depositSwipe()");
  console.log("2. Optionally set bet counts for users using setUserBetCount() for gas efficiency");
  console.log("3. Update maxPredictionId if needed using setMaxPredictionId()");
  console.log("4. Verify contract on BaseScan");
  console.log("5. Update frontend configuration with contract address");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


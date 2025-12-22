const hre = require("hardhat");

/**
 * Script to check user's bet count directly from the new contract
 */

async function main() {
  const SWIPE_CLAIM_CONTRACT = "0x9f5d800e4123e6cE6f429f5A5DD5018a631A2793"; // Nowy kontrakt
  const V2_CONTRACT_ADDRESS = "0x2bA339Df34B98099a9047d9442075F7B3a792f74";
  
  // ⚠️ ZMIEŃ NA SWÓJ ADRES!
  const USER_ADDRESS = "0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd"; // Twój adres
  
  console.log("🔍 Checking user bets...");
  console.log("User Address:", USER_ADDRESS);
  console.log("SwipeClaim Contract:", SWIPE_CLAIM_CONTRACT);
  console.log("V2 Contract:", V2_CONTRACT_ADDRESS);
  
  // Get SwipeClaim contract
  const swipeClaim = await hre.ethers.getContractAt(
    "SwipeClaim",
    SWIPE_CLAIM_CONTRACT
  );
  
  // Get V2 contract
  const v2Contract = await hre.ethers.getContractAt(
    [
      "function nextPredictionId() external view returns (uint256)",
      "function userStakes(uint256 predictionId, address user) external view returns (uint256 yesAmount, uint256 noAmount, bool claimed)",
      "function userSwipeStakes(uint256 predictionId, address user) external view returns (uint256 yesAmount, uint256 noAmount, bool claimed)"
    ],
    V2_CONTRACT_ADDRESS
  );
  
  // Check nextPredictionId
  const nextId = await v2Contract.nextPredictionId();
  const totalPredictions = Number(nextId) - 1;
  console.log("\n📊 V2 Contract Info:");
  console.log("nextPredictionId:", nextId.toString());
  console.log("Total predictions:", totalPredictions);
  
  // Check maxPredictionId in SwipeClaim
  const maxPredictionId = await swipeClaim.maxPredictionId();
  console.log("Max Prediction ID to check:", maxPredictionId.toString());
  
  // Count bets using contract function
  console.log("\n🔢 Counting bets using SwipeClaim.countUserBets()...");
  const betCount = await swipeClaim.countUserBets(USER_ADDRESS);
  console.log("Bet count from contract:", betCount.toString());
  
  // Manual check - check each prediction
  console.log("\n🔍 Manual check - checking each prediction...");
  let manualCount = 0;
  const maxToCheck = totalPredictions < Number(maxPredictionId) ? totalPredictions : Number(maxPredictionId);
  
  for (let i = 1; i <= maxToCheck; i++) {
    try {
      const [ethYes, ethNo] = await v2Contract.userStakes(i, USER_ADDRESS);
      const [swipeYes, swipeNo] = await v2Contract.userSwipeStakes(i, USER_ADDRESS);
      
      const hasEthStake = ethYes > 0n || ethNo > 0n;
      const hasSwipeStake = swipeYes > 0n || swipeNo > 0n;
      
      if (hasEthStake || hasSwipeStake) {
        manualCount++;
        console.log(`  ✓ Prediction ${i}: ETH(${hasEthStake ? 'YES' : ''}${hasEthStake && hasSwipeStake ? '/' : ''}${hasSwipeStake ? 'SWIPE' : ''})`);
      }
    } catch (error) {
      // Skip errors (prediction might not exist)
    }
  }
  
  console.log("\n📊 Results:");
  console.log("Contract countUserBets():", betCount.toString());
  console.log("Manual count:", manualCount);
  
  // Get claim info
  const [eligible, contractBetCount, rewardAmount] = await swipeClaim.getUserClaimInfo(USER_ADDRESS);
  console.log("\n💰 Claim Info:");
  console.log("Eligible:", eligible);
  console.log("Bet Count:", contractBetCount.toString());
  console.log("Reward Amount:", hre.ethers.formatEther(rewardAmount), "SWIPE");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


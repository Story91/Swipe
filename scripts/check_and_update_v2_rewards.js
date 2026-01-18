const hre = require("hardhat");

/**
 * Check current rewards and update referral reward to 10k SWIPE
 * 
 * Usage:
 *   npx hardhat run scripts/check_and_update_v2_rewards.js --network base
 */

async function main() {
  console.log("\n🔍 Checking V2 Contract Rewards...\n");

  // Contract addresses
  const V2_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT || "0xb545c176b980B5dbfBc4af3F4f1d978b5F17aCF0";
  
  if (!V2_CONTRACT_ADDRESS || V2_CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.error("❌ Error: NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT not set!");
    process.exit(1);
  }

  console.log("V2 Contract Address:", V2_CONTRACT_ADDRESS);
  console.log("");

  // Get contract instance
  const SwipeDailyRewards_V2 = await hre.ethers.getContractAt(
    "SwipeDailyRewards_V2",
    V2_CONTRACT_ADDRESS
  );

  // Check current rewards
  console.log("📊 Current Reward Values:");
  console.log("=".repeat(60));
  
  const baseDailyReward = await SwipeDailyRewards_V2.baseDailyReward();
  const streakBonusPerDay = await SwipeDailyRewards_V2.streakBonusPerDay();
  const referralReward = await SwipeDailyRewards_V2.referralReward();
  const shareCastReward = await SwipeDailyRewards_V2.shareCastReward();
  const createPredictionReward = await SwipeDailyRewards_V2.createPredictionReward();
  const tradingVolumeReward = await SwipeDailyRewards_V2.tradingVolumeReward();
  
  console.log("  Base Daily Reward:", hre.ethers.formatEther(baseDailyReward), "SWIPE");
  console.log("  Streak Bonus/Day:", hre.ethers.formatEther(streakBonusPerDay), "SWIPE");
  console.log("  Share Cast Reward:", hre.ethers.formatEther(shareCastReward), "SWIPE");
  console.log("  Create Prediction Reward:", hre.ethers.formatEther(createPredictionReward), "SWIPE");
  console.log("  Trading Volume Reward:", hre.ethers.formatEther(tradingVolumeReward), "SWIPE");
  console.log("  Referral Reward (current):", hre.ethers.formatEther(referralReward), "SWIPE");
  console.log("");

  // Check if referral reward needs to be updated
  const targetReferralReward = hre.ethers.parseEther("10000"); // 10k SWIPE (10000 * 10^18)
  
  if (referralReward.toString() === targetReferralReward.toString()) {
    console.log("✅ Referral reward is already set to 10k SWIPE");
  } else {
    console.log("🔄 Updating referral reward from", hre.ethers.formatEther(referralReward), "to 10k SWIPE...");
    
    try {
      const tx = await SwipeDailyRewards_V2.setReferralReward(targetReferralReward);
      console.log("  Transaction sent:", tx.hash);
      
      console.log("  Waiting for confirmation...");
      await tx.wait();
      
      console.log("✅ Referral reward updated successfully!");
      
      // Verify the change
      const newReferralReward = await SwipeDailyRewards_V2.referralReward();
      console.log("  New Referral Reward:", hre.ethers.formatEther(newReferralReward), "SWIPE");
    } catch (error) {
      console.error("❌ Error updating referral reward:", error.message);
      if (error.reason) {
        console.error("  Reason:", error.reason);
      }
      process.exit(1);
    }
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("✅ Done!");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
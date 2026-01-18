const hre = require("hardhat");

/**
 * Update all rewards in V2 contract to smaller values
 * 
 * Usage:
 *   npx hardhat run scripts/update_v2_rewards.js --network base
 */

async function main() {
  console.log("\n💰 Updating V2 Contract Rewards...\n");

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

  // New reward values (reduced by 25% from current values)
  // Current: baseDailyReward=50k, streakBonus=10k, shareCast=50k, createPrediction=75k, tradingVolume=100k
  // Reduced by 25%: multiply by 0.75
  const newRewards = {
    baseDailyReward: hre.ethers.parseEther("37500"),       // 37.5k SWIPE (was 50k, -25%)
    streakBonusPerDay: hre.ethers.parseEther("7500"),      // 7.5k SWIPE/day (was 10k, -25%)
    shareCastReward: hre.ethers.parseEther("37500"),       // 37.5k SWIPE (was 50k, -25%)
    createPredictionReward: hre.ethers.parseEther("56250"), // 56.25k SWIPE (was 75k, -25%)
    tradingVolumeReward: hre.ethers.parseEther("75000"),   // 75k SWIPE (was 100k, -25%)
    referralReward: hre.ethers.parseEther("10000"),        // 10k SWIPE (already reduced earlier)
    betaTesterReward: hre.ethers.parseEther("375000"),     // 375k SWIPE (was 500k, -25%)
    followSocialsReward: hre.ethers.parseEther("75000"),   // 75k SWIPE (was 100k, -25%)
    streak7Reward: hre.ethers.parseEther("187500"),        // 187.5k SWIPE (was 250k, -25%)
    streak30Reward: hre.ethers.parseEther("750000"),       // 750k SWIPE (was 1M, -25%)
    jackpotAmount: hre.ethers.parseEther("187500"),        // 187.5k SWIPE (was 250k, -25%)
  };

  console.log("📊 New Reward Values:");
  console.log("=".repeat(60));
  for (const [key, value] of Object.entries(newRewards)) {
    console.log(`  ${key}:`, hre.ethers.formatEther(value), "SWIPE");
  }
  console.log("");

  // Check current values
  console.log("📋 Current Values:");
  try {
    const current = {
      baseDailyReward: await SwipeDailyRewards_V2.baseDailyReward(),
      streakBonusPerDay: await SwipeDailyRewards_V2.streakBonusPerDay(),
      shareCastReward: await SwipeDailyRewards_V2.shareCastReward(),
      createPredictionReward: await SwipeDailyRewards_V2.createPredictionReward(),
      tradingVolumeReward: await SwipeDailyRewards_V2.tradingVolumeReward(),
      referralReward: await SwipeDailyRewards_V2.referralReward(),
      betaTesterReward: await SwipeDailyRewards_V2.betaTesterReward(),
      followSocialsReward: await SwipeDailyRewards_V2.followSocialsReward(),
      streak7Reward: await SwipeDailyRewards_V2.streak7Reward(),
      streak30Reward: await SwipeDailyRewards_V2.streak30Reward(),
      jackpotAmount: await SwipeDailyRewards_V2.jackpotAmount(),
    };

    console.log("  Base Daily:", hre.ethers.formatEther(current.baseDailyReward), "SWIPE");
    console.log("  Streak Bonus:", hre.ethers.formatEther(current.streakBonusPerDay), "SWIPE");
    console.log("  Share Cast:", hre.ethers.formatEther(current.shareCastReward), "SWIPE");
    console.log("  Create Prediction:", hre.ethers.formatEther(current.createPredictionReward), "SWIPE");
    console.log("  Trading Volume:", hre.ethers.formatEther(current.tradingVolumeReward), "SWIPE");
    console.log("  Referral:", hre.ethers.formatEther(current.referralReward), "SWIPE");
    console.log("  Beta Tester:", hre.ethers.formatEther(current.betaTesterReward), "SWIPE");
    console.log("  Follow Socials:", hre.ethers.formatEther(current.followSocialsReward), "SWIPE");
    console.log("  Streak 7:", hre.ethers.formatEther(current.streak7Reward), "SWIPE");
    console.log("  Streak 30:", hre.ethers.formatEther(current.streak30Reward), "SWIPE");
    console.log("  Jackpot:", hre.ethers.formatEther(current.jackpotAmount), "SWIPE");
    console.log("");
  } catch (error) {
    console.log("  ⚠️  Could not read current values");
  }

  // Update rewards
  console.log("🔄 Updating rewards...");
  try {
    // Update in batches to avoid gas issues
    const tx1 = await SwipeDailyRewards_V2.setBaseDailyReward(newRewards.baseDailyReward);
    console.log("  ✅ setBaseDailyReward:", tx1.hash);
    await tx1.wait();

    const tx2 = await SwipeDailyRewards_V2.setStreakBonusPerDay(newRewards.streakBonusPerDay);
    console.log("  ✅ setStreakBonusPerDay:", tx2.hash);
    await tx2.wait();

    const tx3 = await SwipeDailyRewards_V2.setShareCastReward(newRewards.shareCastReward);
    console.log("  ✅ setShareCastReward:", tx3.hash);
    await tx3.wait();

    const tx4 = await SwipeDailyRewards_V2.setCreatePredictionReward(newRewards.createPredictionReward);
    console.log("  ✅ setCreatePredictionReward:", tx4.hash);
    await tx4.wait();

    const tx5 = await SwipeDailyRewards_V2.setTradingVolumeReward(newRewards.tradingVolumeReward);
    console.log("  ✅ setTradingVolumeReward:", tx5.hash);
    await tx5.wait();

    const tx6 = await SwipeDailyRewards_V2.setReferralReward(newRewards.referralReward);
    console.log("  ✅ setReferralReward:", tx6.hash);
    await tx6.wait();

    const tx7 = await SwipeDailyRewards_V2.setBetaTesterReward(newRewards.betaTesterReward);
    console.log("  ✅ setBetaTesterReward:", tx7.hash);
    await tx7.wait();

    const tx8 = await SwipeDailyRewards_V2.setFollowSocialsReward(newRewards.followSocialsReward);
    console.log("  ✅ setFollowSocialsReward:", tx8.hash);
    await tx8.wait();

    const tx9 = await SwipeDailyRewards_V2.setStreak7Reward(newRewards.streak7Reward);
    console.log("  ✅ setStreak7Reward:", tx9.hash);
    await tx9.wait();

    const tx10 = await SwipeDailyRewards_V2.setStreak30Reward(newRewards.streak30Reward);
    console.log("  ✅ setStreak30Reward:", tx10.hash);
    await tx10.wait();

    const tx11 = await SwipeDailyRewards_V2.setJackpotAmount(newRewards.jackpotAmount);
    console.log("  ✅ setJackpotAmount:", tx11.hash);
    await tx11.wait();

    console.log("");
    console.log("✅ All rewards updated successfully!");
  } catch (error) {
    console.error("❌ Error updating rewards:", error.message);
    if (error.reason) {
      console.error("  Reason:", error.reason);
    }
    process.exit(1);
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
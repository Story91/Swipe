const hre = require("hardhat");

/**
 * Check current reward values in SwipeDailyRewards contract
 * Supports V2 and V3 contracts
 * 
 * Usage:
 *   npx hardhat run scripts/check_rewards.js --network base
 */

async function main() {
  console.log("\n🔍 Checking Reward Values...\n");

  // Try V3 first, then V2
  const V3_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_DAILY_REWARDS_V3_CONTRACT || process.env.DAILY_REWARDS_V3_CONTRACT;
  const V2_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT || process.env.DAILY_REWARDS_V2_CONTRACT || "0xb545c176b980B5dbfBc4af3F4f1d978b5F17aCF0";
  
  let contractAddress;
  let contractVersion;
  let contract;

  // Try V3 first
  if (V3_CONTRACT_ADDRESS && V3_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000") {
    try {
      contract = await hre.ethers.getContractAt("SwipeDailyRewards_V3", V3_CONTRACT_ADDRESS);
      contractAddress = V3_CONTRACT_ADDRESS;
      contractVersion = "V3";
      console.log("✅ Using V3 Contract");
    } catch (error) {
      console.log("⚠️  V3 contract not found, trying V2...");
    }
  }

  // Fallback to V2
  if (!contract) {
    contract = await hre.ethers.getContractAt("SwipeDailyRewards_V2", V2_CONTRACT_ADDRESS);
    contractAddress = V2_CONTRACT_ADDRESS;
    contractVersion = "V2";
    console.log("✅ Using V2 Contract");
  }

  console.log("Contract Address:", contractAddress);
  console.log("Contract Version:", contractVersion);
  console.log("");

  try {
    // Read all reward values
    console.log("📊 Current Reward Configuration:");
    console.log("=".repeat(70));

    // Base Daily Rewards
    console.log("\n💰 Base Daily Rewards:");
    const baseDailyReward = await contract.baseDailyReward();
    const streakBonusPerDay = await contract.streakBonusPerDay();
    const maxStreakBonusDays = await contract.maxStreakBonusDays();
    const jackpotAmount = await contract.jackpotAmount();
    const jackpotChance = await contract.jackpotChance();

    console.log("  Base Daily Reward:", hre.ethers.formatEther(baseDailyReward), "SWIPE");
    console.log("  Streak Bonus/Day:", hre.ethers.formatEther(streakBonusPerDay), "SWIPE");
    console.log("  Max Streak Bonus Days:", maxStreakBonusDays.toString());
    console.log("  Max Streak Bonus:", hre.ethers.formatEther(streakBonusPerDay * maxStreakBonusDays), "SWIPE");
    console.log("  Jackpot Amount:", hre.ethers.formatEther(jackpotAmount), "SWIPE");
    console.log("  Jackpot Chance:", jackpotChance.toString(), "%");

    // Task Rewards
    console.log("\n📋 Task Rewards:");
    const shareCastReward = await contract.shareCastReward();
    const createPredictionReward = await contract.createPredictionReward();
    const tradingVolumeReward = await contract.tradingVolumeReward();
    const referralReward = await contract.referralReward();

    console.log("  Share Cast:", hre.ethers.formatEther(shareCastReward), "SWIPE");
    console.log("  Create Prediction:", hre.ethers.formatEther(createPredictionReward), "SWIPE");
    console.log("  Trading Volume:", hre.ethers.formatEther(tradingVolumeReward), "SWIPE");
    console.log("  Referral (each user):", hre.ethers.formatEther(referralReward), "SWIPE");

    // Achievement Rewards
    console.log("\n🏆 Achievement Rewards:");
    const betaTesterReward = await contract.betaTesterReward();
    const followSocialsReward = await contract.followSocialsReward();
    const streak7Reward = await contract.streak7Reward();
    const streak30Reward = await contract.streak30Reward();

    console.log("  Beta Tester:", hre.ethers.formatEther(betaTesterReward), "SWIPE");
    console.log("  Follow Socials:", hre.ethers.formatEther(followSocialsReward), "SWIPE");
    console.log("  7-Day Streak:", hre.ethers.formatEther(streak7Reward), "SWIPE");
    console.log("  30-Day Streak:", hre.ethers.formatEther(streak30Reward), "SWIPE");

    // Pool Stats
    console.log("\n📊 Pool Statistics:");
    try {
      const poolStats = await contract.getPoolStats();
      console.log("  Pool Balance:", hre.ethers.formatEther(poolStats[0] || poolStats.poolBalance), "SWIPE");
      console.log("  Total Distributed:", hre.ethers.formatEther(poolStats[1] || poolStats.distributed), "SWIPE");
      console.log("  Total Users:", (poolStats[2] || poolStats.userCount).toString());
      console.log("  Total Claims:", (poolStats[3] || poolStats.claimCount).toString());
    } catch (error) {
      console.log("  ⚠️  Could not fetch pool stats");
    }

    // Contract Status
    console.log("\n⚙️  Contract Status:");
    const claimingEnabled = await contract.claimingEnabled();
    const paused = await contract.paused();
    const migrationEnabled = await contract.migrationEnabled().catch(() => null);
    
    console.log("  Claiming Enabled:", claimingEnabled ? "✅ Yes" : "❌ No");
    console.log("  Paused:", paused ? "⏸️  Yes" : "▶️  No");
    if (migrationEnabled !== null) {
      console.log("  Migration Enabled:", migrationEnabled ? "✅ Yes" : "❌ No");
    }

    console.log("\n" + "=".repeat(70));
    console.log("✅ Reward check complete!");
    console.log("=".repeat(70));

  } catch (error) {
    console.error("❌ Error reading reward values:", error.message);
    if (error.reason) {
      console.error("  Reason:", error.reason);
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

const hre = require("hardhat");

/**
 * Deploy SwipeDailyRewards V2 Contract
 *
 * V2 Improvements:
 * - Blacklist support
 * - Editable rewards
 * - Signature verification for referrals
 * - Reduced referral rewards (50k instead of 150k)
 * - Data migration from V1
 *
 * Usage:
 *   npx hardhat run scripts/deploy_SwipeDailyRewards_V2.js --network base
 */

async function main() {
  console.log("\n🚀 Deploying SwipeDailyRewards V2 Contract...\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  // Check balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Contract configuration
  const SWIPE_TOKEN_ADDRESS = process.env.SWIPE_TOKEN_ADDRESS || "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9";
  const V1_CONTRACT_ADDRESS = process.env.V1_CONTRACT_ADDRESS || ""; // Must be set!

  // Task verifier address - should be a dedicated backend wallet
  const TASK_VERIFIER_ADDRESS = process.env.TASK_VERIFIER_ADDRESS || deployer.address;

  if (!V1_CONTRACT_ADDRESS) {
    console.error("❌ Error: V1_CONTRACT_ADDRESS environment variable is required!");
    console.log("\nSet it with:");
    console.log("  export V1_CONTRACT_ADDRESS=0x...");
    process.exit(1);
  }

  console.log("Configuration:");
  console.log("  SWIPE Token:", SWIPE_TOKEN_ADDRESS);
  console.log("  V1 Contract:", V1_CONTRACT_ADDRESS);
  console.log("  Task Verifier:", TASK_VERIFIER_ADDRESS);
  console.log("");

  // Deploy contract
  console.log("Deploying SwipeDailyRewards_V2...");

  const SwipeDailyRewards_V2 = await hre.ethers.getContractFactory("SwipeDailyRewards_V2");
  const dailyRewardsV2 = await SwipeDailyRewards_V2.deploy(
    SWIPE_TOKEN_ADDRESS,
    TASK_VERIFIER_ADDRESS,
    V1_CONTRACT_ADDRESS
  );

  // Get deployment transaction
  const deploymentTx = dailyRewardsV2.deploymentTransaction();
  if (deploymentTx) {
    console.log("⏳ Waiting for deployment transaction:", deploymentTx.hash);
    await deploymentTx.wait(); // Wait for transaction confirmation
  }

  await dailyRewardsV2.waitForDeployment();

  const contractAddress = await dailyRewardsV2.getAddress();
  console.log("\n✅ SwipeDailyRewards V2 deployed to:", contractAddress);
  
  // Verify the contract code exists on blockchain
  const code = await hre.ethers.provider.getCode(contractAddress);
  if (code === "0x") {
    console.log("⚠️  WARNING: Contract code not found at address! Deployment may have failed.");
  } else {
    console.log("✅ Contract code verified on blockchain");
  }

  // Verify contract info (with error handling)
  console.log("\n📋 Contract Info:");
  try {
    console.log("  Owner:", await dailyRewardsV2.owner());
    console.log("  SWIPE Token:", await dailyRewardsV2.swipeToken());
    console.log("  V1 Contract:", await dailyRewardsV2.v1Contract());
    console.log("  Task Verifier:", await dailyRewardsV2.taskVerifier());
    console.log("  Claiming Enabled:", await dailyRewardsV2.claimingEnabled());
    console.log("  Paused:", await dailyRewardsV2.paused());
    console.log("  Migration Enabled:", await dailyRewardsV2.migrationEnabled());
  } catch (error) {
    console.log("  ⚠️  Could not read contract info (contract may need more time to confirm)");
    console.log("  Error:", error.message);
  }

  // Display reward structure (default values) - with error handling
  console.log("\n💰 Default Reward Structure:");
  try {
    console.log("  Base Daily Reward:", hre.ethers.formatEther(await dailyRewardsV2.baseDailyReward()), "SWIPE");
    console.log("  Streak Bonus/Day:", hre.ethers.formatEther(await dailyRewardsV2.streakBonusPerDay()), "SWIPE");
    console.log("  Max Streak Days:", (await dailyRewardsV2.maxStreakBonusDays()).toString());
    console.log("  Jackpot Amount:", hre.ethers.formatEther(await dailyRewardsV2.jackpotAmount()), "SWIPE");
    console.log("  Jackpot Chance:", (await dailyRewardsV2.jackpotChance()).toString(), "%");

    console.log("\n📋 Task Rewards:");
    console.log("  Share Cast:", hre.ethers.formatEther(await dailyRewardsV2.shareCastReward()), "SWIPE");
    console.log("  Create Prediction:", hre.ethers.formatEther(await dailyRewardsV2.createPredictionReward()), "SWIPE");
    console.log("  Trading Volume:", hre.ethers.formatEther(await dailyRewardsV2.tradingVolumeReward()), "SWIPE");
    console.log("  Referral (each):", hre.ethers.formatEther(await dailyRewardsV2.referralReward()), "SWIPE (reduced from 150k)");

    console.log("\n🏆 Achievement Rewards:");
    console.log("  Beta Tester:", hre.ethers.formatEther(await dailyRewardsV2.betaTesterReward()), "SWIPE");
    console.log("  Follow Socials:", hre.ethers.formatEther(await dailyRewardsV2.followSocialsReward()), "SWIPE");
    console.log("  7-Day Streak:", hre.ethers.formatEther(await dailyRewardsV2.streak7Reward()), "SWIPE");
    console.log("  30-Day Streak:", hre.ethers.formatEther(await dailyRewardsV2.streak30Reward()), "SWIPE");
  } catch (error) {
    console.log("  ⚠️  Could not read reward values (contract may need more time to confirm)");
    console.log("  Error:", error.message);
  }

  // Instructions
  console.log("\n" + "=".repeat(60));
  console.log("📝 NEXT STEPS:");
  console.log("=".repeat(60));
  console.log("\n1. Fund the contract with SWIPE tokens:");
  console.log(`   - Approve: SWIPE.approve("${contractAddress}", amount)`);
  console.log(`   - Deposit: DailyRewardsV2.depositSwipe(amount)`);
  console.log("   - Recommended: 250,000,000 SWIPE (250M)");

  console.log("\n2. (Optional) Configure rewards:");
  console.log(`   - dailyRewardsV2.setReferralReward(50_000 * 10**18)`);
  console.log(`   - dailyRewardsV2.setBaseDailyReward(60_000 * 10**18)`);

  console.log("\n3. (Optional) Add addresses to blacklist:");
  console.log(`   - dailyRewardsV2.setBlacklist(address, true)`);
  console.log(`   - dailyRewardsV2.batchSetBlacklist([addr1, addr2], [true, true])`);

  console.log("\n4. Migrate users from V1:");
  console.log("   - Users can migrate: dailyRewardsV2.migrateFromV1()");
  console.log("   - Or batch migrate: dailyRewardsV2.batchMigrateFromV1([addresses])");

  console.log("\n5. Update environment variables:");
  console.log(`   NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT=${contractAddress}`);
  console.log(`   V1_CONTRACT_ADDRESS=${V1_CONTRACT_ADDRESS}`);
  console.log(`   TASK_VERIFIER_PRIVATE_KEY=<your-verifier-private-key>`);

  console.log("\n6. Update backend API:");
  console.log("   - Add /api/referrals/verify endpoint");
  console.log("   - Update frontend to use V2 contract");

  console.log("\n7. Verify contract on Basescan:");
  console.log(`   npx hardhat verify --network base ${contractAddress} ${SWIPE_TOKEN_ADDRESS} ${TASK_VERIFIER_ADDRESS} ${V1_CONTRACT_ADDRESS}`);

  console.log("\n" + "=".repeat(60));
  console.log("🎉 V2 Deployment Complete!");
  console.log("=".repeat(60) + "\n");

  return contractAddress;
}

main()
  .then((address) => {
    console.log("V2 Contract deployed at:", address);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
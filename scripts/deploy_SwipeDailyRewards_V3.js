const hre = require("hardhat");

/**
 * Deploy SwipeDailyRewards V3 Contract
 *
 * V3 Improvements over V2:
 * - Signature verification for daily claims (prevents direct contract farming)
 * - All functions now require backend signature verification
 * - Full migration support from both V1 and V2
 *
 * Usage:
 *   npx hardhat run scripts/deploy_SwipeDailyRewards_V3.js --network base
 */

async function main() {
  console.log("\n🚀 Deploying SwipeDailyRewards V3 Contract...\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  // Check balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Contract configuration
  const SWIPE_TOKEN_ADDRESS = process.env.SWIPE_TOKEN_ADDRESS || "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9";
  const V1_CONTRACT_ADDRESS = process.env.V1_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000"; // Optional
  const V2_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT || ""; // Should be set!

  // Task verifier address - should be a dedicated backend wallet
  const TASK_VERIFIER_ADDRESS = process.env.TASK_VERIFIER_ADDRESS || deployer.address;

  if (!V2_CONTRACT_ADDRESS || V2_CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.error("❌ Error: NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT environment variable is required!");
    console.log("\nSet it with:");
    console.log("  export NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT=0x...");
    process.exit(1);
  }

  console.log("Configuration:");
  console.log("  SWIPE Token:", SWIPE_TOKEN_ADDRESS);
  console.log("  V1 Contract:", V1_CONTRACT_ADDRESS || "(not set, will use zero address)");
  console.log("  V2 Contract:", V2_CONTRACT_ADDRESS);
  console.log("  Task Verifier:", TASK_VERIFIER_ADDRESS);
  console.log("");

  // Use zero address for V1 if not provided
  const v1Contract = V1_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

  // Deploy contract
  console.log("Deploying SwipeDailyRewards_V3...");

  const SwipeDailyRewards_V3 = await hre.ethers.getContractFactory("SwipeDailyRewards_V3");
  const dailyRewardsV3 = await SwipeDailyRewards_V3.deploy(
    SWIPE_TOKEN_ADDRESS,
    TASK_VERIFIER_ADDRESS,
    v1Contract,
    V2_CONTRACT_ADDRESS
  );

  // Get deployment transaction
  const deploymentTx = dailyRewardsV3.deploymentTransaction();
  if (deploymentTx) {
    console.log("⏳ Waiting for deployment transaction:", deploymentTx.hash);
    await deploymentTx.wait(); // Wait for transaction confirmation
  }

  await dailyRewardsV3.waitForDeployment();

  const contractAddress = await dailyRewardsV3.getAddress();
  console.log("\n✅ SwipeDailyRewards V3 deployed to:", contractAddress);
  
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
    console.log("  Owner:", await dailyRewardsV3.owner());
    console.log("  SWIPE Token:", await dailyRewardsV3.swipeToken());
    console.log("  V1 Contract:", await dailyRewardsV3.v1Contract());
    console.log("  V2 Contract:", await dailyRewardsV3.v2Contract());
    console.log("  Task Verifier:", await dailyRewardsV3.taskVerifier());
    console.log("  Claiming Enabled:", await dailyRewardsV3.claimingEnabled());
    console.log("  Paused:", await dailyRewardsV3.paused());
    console.log("  Migration Enabled:", await dailyRewardsV3.migrationEnabled());
  } catch (error) {
    console.log("  ⚠️  Could not read contract info (contract may need more time to confirm)");
    console.log("  Error:", error.message);
  }

  // Display reward structure (default values) - with error handling
  console.log("\n💰 Default Reward Structure:");
  try {
    console.log("  Base Daily Reward:", hre.ethers.formatEther(await dailyRewardsV3.baseDailyReward()), "SWIPE");
    console.log("  Streak Bonus/Day:", hre.ethers.formatEther(await dailyRewardsV3.streakBonusPerDay()), "SWIPE");
    console.log("  Max Streak Days:", (await dailyRewardsV3.maxStreakBonusDays()).toString());
    console.log("  Jackpot Amount:", hre.ethers.formatEther(await dailyRewardsV3.jackpotAmount()), "SWIPE");
    console.log("  Jackpot Chance:", (await dailyRewardsV3.jackpotChance()).toString(), "%");

    console.log("\n📋 Task Rewards:");
    console.log("  Share Cast:", hre.ethers.formatEther(await dailyRewardsV3.shareCastReward()), "SWIPE");
    console.log("  Create Prediction:", hre.ethers.formatEther(await dailyRewardsV3.createPredictionReward()), "SWIPE");
    console.log("  Trading Volume:", hre.ethers.formatEther(await dailyRewardsV3.tradingVolumeReward()), "SWIPE");
    console.log("  Referral (each):", hre.ethers.formatEther(await dailyRewardsV3.referralReward()), "SWIPE");

    console.log("\n🏆 Achievement Rewards:");
    console.log("  Beta Tester:", hre.ethers.formatEther(await dailyRewardsV3.betaTesterReward()), "SWIPE");
    console.log("  Follow Socials:", hre.ethers.formatEther(await dailyRewardsV3.followSocialsReward()), "SWIPE");
    console.log("  7-Day Streak:", hre.ethers.formatEther(await dailyRewardsV3.streak7Reward()), "SWIPE");
    console.log("  30-Day Streak:", hre.ethers.formatEther(await dailyRewardsV3.streak30Reward()), "SWIPE");
  } catch (error) {
    console.log("  ⚠️  Could not read reward values (contract may need more time to confirm)");
    console.log("  Error:", error.message);
  }

  // Instructions
  console.log("\n" + "=".repeat(60));
  console.log("📝 NEXT STEPS:");
  console.log("=".repeat(60));
  console.log("\n1. Transfer SWIPE tokens from V2 to V3:");
  console.log(`   - Check V2 balance: V2Contract.swipeToken.balanceOf(V2_ADDRESS)`);
  console.log(`   - Approve: SWIPE.approve("${contractAddress}", amount)`);
  console.log(`   - Or use V2's emergencyWithdraw() and deposit to V3`);
  console.log(`   - Deposit to V3: DailyRewardsV3.depositSwipe(amount)`);
  console.log("   - Recommended: Transfer all from V2 to V3");

  console.log("\n2. Copy reward configuration from V2:");
  console.log(`   - Read values from V2`);
  console.log(`   - Set in V3: dailyRewardsV3.setBaseDailyReward(...)`);
  console.log(`   - Or use update script: scripts/update_v2_rewards.js`);

  console.log("\n3. Copy blacklist from V2 (if any):");
  console.log(`   - Check V2 blacklist`);
  console.log(`   - Set in V3: dailyRewardsV3.batchSetBlacklist([addresses], [true, ...])`);

  console.log("\n4. Migrate users from V1 to V3:");
  console.log("   - Users can migrate: dailyRewardsV3.migrateFromV1()");
  console.log("   - Or batch migrate (using script): npx hardhat run scripts/migrate_users_v1_to_v2.js --network base");
  console.log("   - Script automatically uses V3 if NEXT_PUBLIC_DAILY_REWARDS_V3_CONTRACT is set");

  console.log("\n5. Update environment variables:");
  console.log(`   NEXT_PUBLIC_DAILY_REWARDS_V3_CONTRACT=${contractAddress}`);
  console.log(`   NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT=${V2_CONTRACT_ADDRESS}`);
  console.log(`   V1_CONTRACT_ADDRESS=${v1Contract}`);
  console.log(`   TASK_VERIFIER_PRIVATE_KEY=<your-verifier-private-key>`);

  console.log("\n6. Create API endpoint for daily claim verification:");
  console.log("   - Add /api/daily-claims/verify endpoint");
  console.log("   - Updates frontend to use V3 with signature for claimDaily()");

  console.log("\n7. Verify contract on Basescan:");
  console.log(`   npx hardhat verify --network base ${contractAddress} ${SWIPE_TOKEN_ADDRESS} ${TASK_VERIFIER_ADDRESS} ${v1Contract} ${V2_CONTRACT_ADDRESS}`);

  console.log("\n" + "=".repeat(60));
  console.log("🎉 V3 Deployment Complete!");
  console.log("=".repeat(60));
  console.log("\n⚠️  IMPORTANT: V3 requires signature for claimDaily()");
  console.log("   Make sure backend API /api/daily-claims/verify is ready!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });

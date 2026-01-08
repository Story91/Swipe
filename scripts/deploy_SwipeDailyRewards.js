const hre = require("hardhat");

/**
 * Deploy SwipeDailyRewards Contract
 * 
 * This contract enables daily SWIPE rewards with:
 * - Base daily claim: 500 SWIPE
 * - Streak bonuses: up to +1500 SWIPE at 15 days
 * - 5% jackpot chance: 5000 SWIPE
 * - Task rewards: 500-1000 SWIPE
 * - Achievements: 1000-10000 SWIPE
 * - Referrals: 2000 SWIPE each
 * 
 * Usage:
 *   npx hardhat run scripts/deploy_SwipeDailyRewards.js --network base
 */

async function main() {
  console.log("\n🚀 Deploying SwipeDailyRewards Contract...\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  
  // Check balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Contract configuration
  const SWIPE_TOKEN_ADDRESS = "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9";
  
  // Task verifier address - should be a dedicated backend wallet
  // For now, use deployer address (update this in production!)
  const TASK_VERIFIER_ADDRESS = process.env.TASK_VERIFIER_ADDRESS || deployer.address;

  console.log("Configuration:");
  console.log("  SWIPE Token:", SWIPE_TOKEN_ADDRESS);
  console.log("  Task Verifier:", TASK_VERIFIER_ADDRESS);
  console.log("");

  // Deploy contract
  console.log("Deploying SwipeDailyRewards...");
  
  const SwipeDailyRewards = await hre.ethers.getContractFactory("SwipeDailyRewards");
  const dailyRewards = await SwipeDailyRewards.deploy(
    SWIPE_TOKEN_ADDRESS,
    TASK_VERIFIER_ADDRESS
  );

  await dailyRewards.waitForDeployment();
  
  const contractAddress = await dailyRewards.getAddress();
  console.log("\n✅ SwipeDailyRewards deployed to:", contractAddress);

  // Verify contract info
  console.log("\n📋 Contract Info:");
  console.log("  Owner:", await dailyRewards.owner());
  console.log("  SWIPE Token:", await dailyRewards.swipeToken());
  console.log("  Task Verifier:", await dailyRewards.taskVerifier());
  console.log("  Claiming Enabled:", await dailyRewards.claimingEnabled());
  console.log("  Paused:", await dailyRewards.paused());

  // Display reward structure
  console.log("\n💰 Reward Structure:");
  console.log("  Base Daily Reward:", hre.ethers.formatEther(await dailyRewards.BASE_DAILY_REWARD()), "SWIPE");
  console.log("  Streak Bonus/Day:", hre.ethers.formatEther(await dailyRewards.STREAK_BONUS_PER_DAY()), "SWIPE");
  console.log("  Max Streak Days:", (await dailyRewards.MAX_STREAK_BONUS_DAYS()).toString());
  console.log("  Jackpot Amount:", hre.ethers.formatEther(await dailyRewards.JACKPOT_AMOUNT()), "SWIPE");
  console.log("  Jackpot Chance:", (await dailyRewards.JACKPOT_CHANCE()).toString(), "%");
  
  console.log("\n📋 Task Rewards:");
  console.log("  Share Cast:", hre.ethers.formatEther(await dailyRewards.SHARE_CAST_REWARD()), "SWIPE");
  console.log("  Create Prediction:", hre.ethers.formatEther(await dailyRewards.CREATE_PREDICTION_REWARD()), "SWIPE");
  console.log("  Trading Volume:", hre.ethers.formatEther(await dailyRewards.TRADING_VOLUME_REWARD()), "SWIPE");
  console.log("  Referral (each):", hre.ethers.formatEther(await dailyRewards.REFERRAL_REWARD()), "SWIPE");

  console.log("\n🏆 Achievement Rewards:");
  console.log("  Beta Tester:", hre.ethers.formatEther(await dailyRewards.BETA_TESTER_REWARD()), "SWIPE");
  console.log("  Follow Socials:", hre.ethers.formatEther(await dailyRewards.FOLLOW_SOCIALS_REWARD()), "SWIPE");
  console.log("  7-Day Streak:", hre.ethers.formatEther(await dailyRewards.STREAK_7_REWARD()), "SWIPE");
  console.log("  30-Day Streak:", hre.ethers.formatEther(await dailyRewards.STREAK_30_REWARD()), "SWIPE");

  // Instructions
  console.log("\n" + "=".repeat(60));
  console.log("📝 NEXT STEPS:");
  console.log("=".repeat(60));
  console.log("\n1. Fund the contract with SWIPE tokens:");
  console.log(`   - Approve: SWIPE.approve("${contractAddress}", amount)`);
  console.log(`   - Deposit: DailyRewards.depositSwipe(amount)`);
  console.log("   - Recommended: 250,000,000 SWIPE (250M)");
  
  console.log("\n2. Update environment variables:");
  console.log(`   NEXT_PUBLIC_DAILY_REWARDS_CONTRACT=${contractAddress}`);
  console.log(`   TASK_VERIFIER_PRIVATE_KEY=<your-verifier-private-key>`);
  
  console.log("\n3. (Optional) Set up a dedicated task verifier wallet:");
  console.log("   - Generate new wallet for backend signing");
  console.log("   - Call: dailyRewards.setTaskVerifier(newVerifierAddress)");
  
  console.log("\n4. Verify contract on Basescan:");
  console.log(`   npx hardhat verify --network base ${contractAddress} ${SWIPE_TOKEN_ADDRESS} ${TASK_VERIFIER_ADDRESS}`);

  console.log("\n" + "=".repeat(60));
  console.log("🎉 Deployment Complete!");
  console.log("=".repeat(60) + "\n");

  return contractAddress;
}

main()
  .then((address) => {
    console.log("Contract deployed at:", address);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });


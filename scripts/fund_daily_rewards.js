const hre = require("hardhat");

/**
 * Fund SwipeDailyRewards Contract with SWIPE tokens
 * 
 * Usage:
 *   npx hardhat run scripts/fund_daily_rewards.js --network base
 * 
 * Environment variables:
 *   DAILY_REWARDS_CONTRACT - Address of deployed SwipeDailyRewards
 *   FUND_AMOUNT - Amount of SWIPE to fund (default: 250000000)
 */

async function main() {
  console.log("\n💰 Funding SwipeDailyRewards Contract...\n");

  // Get signer
  const [signer] = await hre.ethers.getSigners();
  console.log("Signer address:", signer.address);

  // Contract addresses
  const SWIPE_TOKEN = "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9";
  const DAILY_REWARDS_CONTRACT = process.env.DAILY_REWARDS_CONTRACT || process.env.NEXT_PUBLIC_DAILY_REWARDS_CONTRACT;

  if (!DAILY_REWARDS_CONTRACT || DAILY_REWARDS_CONTRACT === "0x0000000000000000000000000000000000000000") {
    console.error("❌ Error: DAILY_REWARDS_CONTRACT not set");
    console.log("   Set environment variable: DAILY_REWARDS_CONTRACT=0x...");
    process.exit(1);
  }

  console.log("SWIPE Token:", SWIPE_TOKEN);
  console.log("Daily Rewards Contract:", DAILY_REWARDS_CONTRACT);

  // Amount to fund (default 250M SWIPE)
  const fundAmount = process.env.FUND_AMOUNT || "250000000";
  const fundAmountWei = hre.ethers.parseEther(fundAmount);
  console.log("Fund Amount:", fundAmount, "SWIPE");

  // ERC20 ABI for approve and balanceOf
  const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)"
  ];

  // Daily Rewards ABI for deposit
  const DAILY_REWARDS_ABI = [
    "function depositSwipe(uint256 amount) external",
    "function getPoolStats() external view returns (uint256 poolBalance, uint256 distributed, uint256 userCount, uint256 claimCount)"
  ];

  // Get contract instances
  const swipeToken = new hre.ethers.Contract(SWIPE_TOKEN, ERC20_ABI, signer);
  const dailyRewards = new hre.ethers.Contract(DAILY_REWARDS_CONTRACT, DAILY_REWARDS_ABI, signer);

  // Check signer's SWIPE balance
  const signerBalance = await swipeToken.balanceOf(signer.address);
  console.log("\nSigner SWIPE Balance:", hre.ethers.formatEther(signerBalance), "SWIPE");

  if (signerBalance < fundAmountWei) {
    console.error("❌ Error: Insufficient SWIPE balance");
    console.log("   Required:", fundAmount, "SWIPE");
    console.log("   Available:", hre.ethers.formatEther(signerBalance), "SWIPE");
    process.exit(1);
  }

  // Check current pool stats
  console.log("\n📊 Current Pool Stats:");
  try {
    const [poolBalance, distributed, userCount, claimCount] = await dailyRewards.getPoolStats();
    console.log("  Pool Balance:", hre.ethers.formatEther(poolBalance), "SWIPE");
    console.log("  Distributed:", hre.ethers.formatEther(distributed), "SWIPE");
    console.log("  Users:", userCount.toString());
    console.log("  Claims:", claimCount.toString());
  } catch (error) {
    console.log("  (Could not fetch pool stats)");
  }

  // Step 1: Approve SWIPE spending
  console.log("\n1️⃣ Approving SWIPE spending...");
  const currentAllowance = await swipeToken.allowance(signer.address, DAILY_REWARDS_CONTRACT);
  
  if (currentAllowance < fundAmountWei) {
    const approveTx = await swipeToken.approve(DAILY_REWARDS_CONTRACT, fundAmountWei);
    console.log("   Approval TX:", approveTx.hash);
    await approveTx.wait();
    console.log("   ✅ Approval confirmed");
  } else {
    console.log("   ✅ Already approved");
  }

  // Step 2: Deposit SWIPE to contract
  console.log("\n2️⃣ Depositing SWIPE to contract...");
  const depositTx = await dailyRewards.depositSwipe(fundAmountWei);
  console.log("   Deposit TX:", depositTx.hash);
  await depositTx.wait();
  console.log("   ✅ Deposit confirmed");

  // Verify new pool balance
  console.log("\n📊 Updated Pool Stats:");
  try {
    const [poolBalance, distributed, userCount, claimCount] = await dailyRewards.getPoolStats();
    console.log("  Pool Balance:", hre.ethers.formatEther(poolBalance), "SWIPE");
    console.log("  Distributed:", hre.ethers.formatEther(distributed), "SWIPE");
    console.log("  Users:", userCount.toString());
    console.log("  Claims:", claimCount.toString());
  } catch (error) {
    console.log("  (Could not fetch pool stats)");
  }

  console.log("\n✅ Funding complete!");
  console.log("   Contract is now ready for daily claims.\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Funding failed:", error);
    process.exit(1);
  });


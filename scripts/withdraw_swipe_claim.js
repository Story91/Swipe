const hre = require("hardhat");

/**
 * Script to withdraw all SWIPE tokens from SwipeClaim contract
 * Only owner can call this
 */

async function main() {
  const SWIPE_CLAIM_CONTRACT = "0x0CDeE2092eC4c8759806CAB9912A25A61Bc17832"; // Stary kontrakt
  
  console.log("💰 Withdrawing SWIPE from SwipeClaim contract...");
  console.log("Contract Address:", SWIPE_CLAIM_CONTRACT);
  
  // Get signer
  const [signer] = await hre.ethers.getSigners();
  console.log("Owner address:", await signer.getAddress());
  
  // Get SwipeClaim contract
  const swipeClaim = await hre.ethers.getContractAt(
    "SwipeClaim",
    SWIPE_CLAIM_CONTRACT,
    signer
  );
  
  // Check balance before
  const balanceBefore = await swipeClaim.getSwipeBalance();
  console.log("\nContract SWIPE balance before:", hre.ethers.formatEther(balanceBefore), "SWIPE");
  
  if (balanceBefore === 0n) {
    console.log("❌ No SWIPE to withdraw!");
    process.exit(0);
  }
  
  // Withdraw
  console.log("\n💰 Withdrawing SWIPE...");
  const tx = await swipeClaim.emergencyWithdrawSwipe();
  console.log("Transaction:", tx.hash);
  console.log("⏳ Waiting for confirmation...");
  await tx.wait(2);
  console.log("✅ Withdrawn!");
  
  // Check balance after
  const balanceAfter = await swipeClaim.getSwipeBalance();
  console.log("\nContract SWIPE balance after:", hre.ethers.formatEther(balanceAfter), "SWIPE");
  
  // Check owner balance
  const SWIPE_TOKEN_ADDRESS = "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9";
  const swipeToken = await hre.ethers.getContractAt(
    [
      "function balanceOf(address account) external view returns (uint256)"
    ],
    SWIPE_TOKEN_ADDRESS,
    signer
  );
  
  const ownerBalance = await swipeToken.balanceOf(await signer.getAddress());
  console.log("\n✅ Your SWIPE balance:", hre.ethers.formatEther(ownerBalance), "SWIPE");
  console.log("\n🎉 Withdrawal complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


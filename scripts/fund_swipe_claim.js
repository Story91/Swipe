const hre = require("hardhat");

/**
 * Script to fund SwipeClaim contract with SWIPE tokens
 * 
 * Usage:
 * 1. First approve SWIPE token to SwipeClaim contract
 * 2. Then run: npx hardhat run scripts/fund_swipe_claim.js --network base
 */

async function main() {
  // ⚠️ ZMIEŃ TE ADRESY NA SWOJE!
  const SWIPE_CLAIM_CONTRACT = "0x9f5d800e4123e6cE6f429f5A5DD5018a631A2793"; // Nowy adres SwipeClaim z poprawką
  const SWIPE_TOKEN_ADDRESS = "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9";
  const AMOUNT_TO_DEPOSIT = hre.ethers.parseEther("100000000"); // 100M SWIPE

  console.log("💰 Funding SwipeClaim contract...");
  console.log("SwipeClaim Address:", SWIPE_CLAIM_CONTRACT);
  console.log("SWIPE Token Address:", SWIPE_TOKEN_ADDRESS);
  console.log("Amount to deposit:", hre.ethers.formatEther(AMOUNT_TO_DEPOSIT), "SWIPE");

  // Get signer
  const [signer] = await hre.ethers.getSigners();
  console.log("Deployer address:", await signer.getAddress());

  // Get SWIPE token contract
  const swipeToken = await hre.ethers.getContractAt(
    [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function balanceOf(address account) external view returns (uint256)",
      "function allowance(address owner, address spender) external view returns (uint256)"
    ],
    SWIPE_TOKEN_ADDRESS,
    signer
  );

  // Check balance
  const balance = await swipeToken.balanceOf(await signer.getAddress());
  console.log("\nYour SWIPE balance:", hre.ethers.formatEther(balance), "SWIPE");

  if (balance < AMOUNT_TO_DEPOSIT) {
    console.error("❌ Insufficient SWIPE balance!");
    console.error("You need:", hre.ethers.formatEther(AMOUNT_TO_DEPOSIT), "SWIPE");
    console.error("You have:", hre.ethers.formatEther(balance), "SWIPE");
    process.exit(1);
  }

  // Check current allowance
  const currentAllowance = await swipeToken.allowance(
    await signer.getAddress(),
    SWIPE_CLAIM_CONTRACT
  );
  console.log("Current allowance:", hre.ethers.formatEther(currentAllowance), "SWIPE");

  // Approve if needed
  if (currentAllowance < AMOUNT_TO_DEPOSIT) {
    console.log("\n📝 Approving SWIPE token...");
    const approveTx = await swipeToken.approve(SWIPE_CLAIM_CONTRACT, AMOUNT_TO_DEPOSIT);
    console.log("Approval transaction:", approveTx.hash);
    console.log("⏳ Waiting for approval confirmation...");
    await approveTx.wait(2); // Wait for 2 confirmations
    console.log("✅ Approved!");
    
    // Small delay to ensure approval is fully processed
    console.log("⏳ Waiting 3 seconds before deposit...");
    await new Promise(resolve => setTimeout(resolve, 3000));
  } else {
    console.log("✅ Already approved");
  }

  // Get SwipeClaim contract
  const swipeClaim = await hre.ethers.getContractAt(
    "SwipeClaim",
    SWIPE_CLAIM_CONTRACT,
    signer
  );

  // Deposit SWIPE with increased gas price
  console.log("\n💰 Depositing SWIPE to contract...");
  
  // Get current gas price and increase it by 20%
  const feeData = await signer.provider.getFeeData();
  const increasedGasPrice = feeData.gasPrice ? (feeData.gasPrice * 120n / 100n) : undefined;
  
  const depositTx = await swipeClaim.depositSwipe(AMOUNT_TO_DEPOSIT, {
    gasPrice: increasedGasPrice
  });
  console.log("Deposit transaction:", depositTx.hash);
  console.log("⏳ Waiting for deposit confirmation...");
  await depositTx.wait(2); // Wait for 2 confirmations
  console.log("✅ Deposited!");

  // Check contract balance
  const contractBalance = await swipeClaim.getSwipeBalance();
  console.log("\n✅ Contract SWIPE balance:", hre.ethers.formatEther(contractBalance), "SWIPE");
  console.log("\n🎉 Funding complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


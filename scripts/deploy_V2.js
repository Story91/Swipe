const hre = require("hardhat");

async function main() {
  console.log("Deploying PredictionMarket V2...");

  // SWIPE TOKEN ADDRESS NA BASE
  const SWIPE_TOKEN_ADDRESS = "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9";

  // Deploy contract with SWIPE token address
  const PredictionMarketV2 = await hre.ethers.getContractFactory("PredictionMarketV2");
  const predictionMarket = await PredictionMarketV2.deploy(SWIPE_TOKEN_ADDRESS);

  await predictionMarket.waitForDeployment();

  console.log("PredictionMarket V2 deployed to:", await predictionMarket.getAddress());
  console.log("SWIPE Token Address:", SWIPE_TOKEN_ADDRESS);

  // Configure contract after deployment
  console.log("\nConfiguring contract...");

  // 1. Set SWIPE as supported token
  await predictionMarket.setSupportedToken(SWIPE_TOKEN_ADDRESS, true);
  console.log("✓ SWIPE token supported");

  // 2. Set creation fees
  await predictionMarket.setCreationFee("0x0000000000000000000000000000000000000000", hre.ethers.parseEther("0.0001")); // ETH
  await predictionMarket.setCreationFee(SWIPE_TOKEN_ADDRESS, hre.ethers.parseEther("200000")); // 200k SWIPE
  console.log("✓ Creation fees set");

  console.log("\nDeployment complete!");
  console.log("Contract Address:", await predictionMarket.getAddress());
  console.log("\nNext steps:");
  console.log("1. Verify on BaseScan");
  console.log("2. Update frontend configuration");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
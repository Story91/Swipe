const hre = require("hardhat");

async function main() {
  console.log("=".repeat(60));
  console.log("Deploying PredictionMarket_USDC_DualPool to BASE MAINNET");
  console.log("=".repeat(60));
  console.log("\nNetwork:", hre.network.name);

  // Verify we're on mainnet
  if (hre.network.name !== "base") {
    throw new Error(`Wrong network! Expected 'base', got '${hre.network.name}'`);
  }

  // Official USDC on Base Mainnet
  const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  console.log("USDC Address (Official):", USDC_ADDRESS);

  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log("\nDeployer:", deployer.address);
  
  // Check balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance < hre.ethers.parseEther("0.0003")) {
    throw new Error("Insufficient ETH balance for deployment! Need at least 0.0003 ETH");
  }

  // Confirm deployment
  console.log("\n" + "!".repeat(60));
  console.log("WARNING: You are about to deploy to BASE MAINNET!");
  console.log("This will use REAL ETH for gas and interact with REAL USDC.");
  console.log("!".repeat(60));

  // Deploy the contract
  console.log("\nDeploying PredictionMarket_USDC_DualPool...");
  const PredictionMarketUSDC = await hre.ethers.getContractFactory("PredictionMarket_USDC_DualPool");
  
  const predictionMarket = await PredictionMarketUSDC.deploy(USDC_ADDRESS, {
    gasLimit: 5000000,
  });

  console.log("Waiting for deployment confirmation...");
  await predictionMarket.waitForDeployment();
  const contractAddress = await predictionMarket.getAddress();

  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUCCESSFUL!");
  console.log("=".repeat(60));
  console.log("\nContract Address:", contractAddress);
  console.log("USDC Address:", USDC_ADDRESS);
  console.log("Network: Base Mainnet");
  console.log("Chain ID: 8453");

  // Wait a bit for the contract to be indexed
  console.log("\nWaiting 30 seconds for block confirmations...");
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Verify contract configuration
  console.log("\n--- Contract Configuration ---");
  try {
    const owner = await predictionMarket.owner();
    console.log("Owner:", owner);
    
    const isResolver = await predictionMarket.resolvers(deployer.address);
    console.log("Deployer is resolver:", isResolver);

    const [platformFee, creatorFee, earlyExitFee, minBet] = await predictionMarket.getFeeConfig();
    console.log("\n--- Fee Configuration ---");
    console.log(`Platform Fee: ${Number(platformFee)/100}%`);
    console.log(`Creator Fee: ${Number(creatorFee)/100}%`);
    console.log(`Early Exit Fee: ${Number(earlyExitFee)/100}%`);
    console.log(`Min Bet: ${Number(minBet)/1e6} USDC`);
  } catch (error) {
    console.log("Note: Could not read contract state immediately (this is normal)");
  }

  console.log("\n" + "=".repeat(60));
  console.log("NEXT STEPS:");
  console.log("=".repeat(60));
  console.log("\n1. Add to .env:");
  console.log(`   NEXT_PUBLIC_USDC_DUALPOOL_CONTRACT=${contractAddress}`);
  console.log("\n2. Verify contract on BaseScan:");
  console.log(`   npx hardhat verify --network base ${contractAddress} "${USDC_ADDRESS}"`);
  console.log("\n3. Update lib/contract.ts with new address");
  console.log("\n4. Test with small amounts first!");

  return { 
    contractAddress, 
    usdcAddress: USDC_ADDRESS,
    network: "base",
    chainId: 8453
  };
}

main()
  .then((result) => {
    console.log("\n--- Deployment Result ---");
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nDeployment failed:", error.message);
    process.exit(1);
  });

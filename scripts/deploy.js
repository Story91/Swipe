const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying Prediction Market Contract...");

  // Get the contract factory
  const PredictionMarket = await ethers.getContractFactory("PredictionMarket");

  // Deploy the contract
  const predictionMarket = await PredictionMarket.deploy();

  // Wait for deployment to finish
  await predictionMarket.waitForDeployment();

  const contractAddress = await predictionMarket.getAddress();

  console.log("✅ Prediction Market deployed successfully!");
  console.log("📍 Contract Address:", contractAddress);
  console.log("🔗 Network:", network.name);
  console.log("👤 Deployer:", await predictionMarket.owner());

  // Verify contract on block explorer if not localhost/hardhat
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\n🔍 Verifying contract on block explorer...");

    try {
      await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [],
      });
      console.log("✅ Contract verified successfully!");
    } catch (error) {
      console.log("❌ Contract verification failed:", error.message);
      console.log("📝 You can verify manually later with:");
      console.log(`npx hardhat verify --network ${network.name} ${contractAddress}`);
    }
  }

  console.log("\n🎉 Deployment complete!");
  console.log("📋 Contract Details:");
  console.log(`   Address: ${contractAddress}`);
  console.log(`   Network: ${network.name}`);
  console.log(`   Explorer: https://basescan.org/address/${contractAddress}`);

  return contractAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });

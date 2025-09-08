const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying PredictionMarket V2...");

  // Get the contract factory
  const PredictionMarketV2 = await ethers.getContractFactory("PredictionMarketV2");

  // Deploy the contract
  const predictionMarketV2 = await PredictionMarketV2.deploy();

  await predictionMarketV2.deployed();

  console.log("✅ PredictionMarket V2 deployed to:", predictionMarketV2.address);

  // Save deployment info
  const fs = require("fs");
  const deploymentInfo = {
    contractAddress: predictionMarketV2.address,
    network: network.name,
    deployedAt: new Date().toISOString(),
    version: "V2"
  };

  fs.writeFileSync(
    "./deployment_V2.json",
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("📝 Deployment info saved to deployment_V2.json");

  // Verify contract on Etherscan (if on mainnet/testnet)
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("⏳ Waiting for block confirmations...");
    await predictionMarketV2.deployTransaction.wait(6);

    console.log("🔍 Verifying contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: predictionMarketV2.address,
        constructorArguments: [],
      });
      console.log("✅ Contract verified!");
    } catch (error) {
      console.log("❌ Verification failed:", error.message);
    }
  }

  console.log("\n🎉 Deployment completed!");
  console.log("📋 Next steps:");
  console.log("1. Update NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file");
  console.log("2. Update contract ABI in lib/contract.ts");
  console.log("3. Test the new features");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });

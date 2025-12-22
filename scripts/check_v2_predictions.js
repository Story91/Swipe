const hre = require("hardhat");

/**
 * Script to check how many predictions are in V2 contract
 * This helps determine what maxPredictionId to set
 */

async function main() {
  const V2_CONTRACT_ADDRESS = "0x2bA339Df34B98099a9047d9442075F7B3a792f74";
  
  console.log("🔍 Checking V2 contract predictions...");
  
  // Get V2 contract
  const v2Contract = await hre.ethers.getContractAt(
    [
      "function nextPredictionId() external view returns (uint256)"
    ],
    V2_CONTRACT_ADDRESS
  );
  
  // Get nextPredictionId
  const nextId = await v2Contract.nextPredictionId();
  const totalPredictions = Number(nextId) - 1; // nextId is the NEXT ID, so actual count is nextId - 1
  
  console.log("\n📊 V2 Contract Info:");
  console.log("nextPredictionId:", nextId.toString());
  console.log("Total predictions:", totalPredictions);
  console.log("\n💡 Recommendation:");
  console.log(`Set maxPredictionId to at least ${totalPredictions + 100} (with some buffer)`);
  console.log(`Or set to ${totalPredictions + 1000} for future growth`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


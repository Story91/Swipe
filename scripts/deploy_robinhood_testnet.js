/**
 * Deploy MockUSDC + PredictionMarket_USDC_DualPool to Robinhood Chain testnet.
 *
 * Purpose: validate that solc 0.8.20 output compiled with viaIR and an evmVersion
 * of `paris` is accepted and executable on ArbOS 61 before committing to the
 * Robinhood port. Robinhood testnet has neither USDG nor a canonical USDC, so the
 * market is deployed against a mock 6-decimal stablecoin.
 *
 * Usage: npm run deploy:robinhood:testnet
 * Fund the deployer first at https://faucet.testnet.chain.robinhood.com/
 */

const hre = require("hardhat");

async function main() {
  if (hre.network.name !== "robinhoodTestnet") {
    throw new Error(`Wrong network! Expected 'robinhoodTestnet', got '${hre.network.name}'`);
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No signer available. Is PRIVATE_KEY set in .env.local?");
  }
  console.log("Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");
  if (balance === 0n) {
    throw new Error(
      "Deployer has no testnet ETH. Fund it at https://faucet.testnet.chain.robinhood.com/"
    );
  }

  console.log("\nDeploying MockUSDC...");
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const mockUsdc = await MockUSDC.deploy();
  await mockUsdc.waitForDeployment();
  const mockUsdcAddress = await mockUsdc.getAddress();
  console.log("MockUSDC:", mockUsdcAddress);

  console.log("\nDeploying PredictionMarket_USDC_DualPool...");
  const DualPool = await hre.ethers.getContractFactory("PredictionMarket_USDC_DualPool");
  const dualPool = await DualPool.deploy(mockUsdcAddress);
  await dualPool.waitForDeployment();
  const dualPoolAddress = await dualPool.getAddress();
  console.log("DualPool:", dualPoolAddress);

  // Read the deployed contracts back, so we prove the bytecode actually EXECUTES
  // on ArbOS rather than merely that the deploy transaction was mined.
  console.log("\n--- Post-deploy verification ---");
  console.log("MockUSDC decimals:", await mockUsdc.decimals());
  console.log("MockUSDC symbol:", await mockUsdc.symbol());
  console.log("DualPool owner:", await dualPool.owner());
  console.log("DualPool usdc():", await dualPool.usdc());
  console.log("Deployer is resolver:", await dualPool.resolvers(deployer.address));

  const [platformFee, creatorFee, earlyExitFee, minBet] = await dualPool.getFeeConfig();
  console.log(
    `Fees - platform ${Number(platformFee) / 100}%, creator ${Number(creatorFee) / 100}%, ` +
    `exit ${Number(earlyExitFee) / 100}%, minBet ${Number(minBet) / 1e6}`
  );

  console.log("\nAdd to .env.local:");
  console.log(`ROBINHOOD_TESTNET_MOCK_USDC=${mockUsdcAddress}`);
  console.log(`ROBINHOOD_TESTNET_DUALPOOL=${dualPoolAddress}`);

  console.log("\nVerify on Blockscout:");
  console.log(`npx hardhat verify --network robinhoodTestnet ${dualPoolAddress} "${mockUsdcAddress}"`);

  return { mockUsdcAddress, dualPoolAddress, chainId: 46630 };
}

main()
  .then((result) => {
    console.log("\n" + JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nDeployment failed:", error.message);
    process.exit(1);
  });

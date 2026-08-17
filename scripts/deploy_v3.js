const { ethers, network } = require("hardhat");

/**
 * Deploys PredictionMarket_V3 and applies the V3 launch configuration.
 *
 * The rates are not contract defaults on purpose: they are policy, and policy
 * that lives in the constructor cannot be changed without a redeploy. Setting
 * them here keeps the source identical across chains.
 */

// The collateral for each network. Never look these up on an explorer at
// deploy time: searching Robinhood Chain for "USDC" returns 18-decimal
// impostors with no liquidity.
const COLLATERAL = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC, 6 decimals
  robinhood: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", // USDG, 6 decimals
  robinhoodTestnet: process.env.ROBINHOOD_TESTNET_MOCK_USDC,
};

const PLATFORM_FEE = 300; // 3% of the losing pool
const MIN_BET = 100_000; // 0.1 token at 6 decimals
const CREATOR_BOND = 10_000_000; // 10 tokens at 6 decimals

async function main() {
  const collateral = COLLATERAL[network.name];
  if (!collateral) {
    throw new Error(`No collateral address configured for network ${network.name}`);
  }

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying as ${deployer.address} on ${network.name}`);
  console.log(`Collateral: ${collateral}`);

  // Confirm the token is what we think it is before anything depends on it.
  const erc20 = await ethers.getContractAt(
    ["function symbol() view returns (string)", "function decimals() view returns (uint8)"],
    collateral
  );
  const [symbol, decimals] = [await erc20.symbol(), await erc20.decimals()];
  console.log(`Collateral reports ${symbol}, ${decimals} decimals`);
  if (Number(decimals) !== 6) {
    throw new Error(`Expected a 6-decimal collateral, got ${decimals}`);
  }

  const Market = await ethers.getContractFactory("PredictionMarket_V3");
  const market = await Market.deploy(collateral);
  await market.waitForDeployment();
  const address = await market.getAddress();
  console.log(`PredictionMarket_V3 deployed at ${address}`);

  console.log("Applying launch configuration...");
  await (await market.setPlatformFee(PLATFORM_FEE)).wait();
  await (await market.setMinBet(MIN_BET)).wait();
  await (await market.setCreatorBondAmount(CREATOR_BOND)).wait();
  await (await market.setBondExempt(deployer.address, true)).wait();

  console.log(`  platformFee       ${await market.platformFee()}`);
  console.log(`  creatorFee        ${await market.creatorFee()}`);
  console.log(`  minBet            ${await market.minBet()}`);
  console.log(`  creatorBondAmount ${await market.creatorBondAmount()}`);

  console.log(`\nVerify with:\n  npx hardhat verify --network ${network.name} ${address} ${collateral}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

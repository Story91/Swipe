const { ethers, network } = require("hardhat");

/**
 * Deploys PredictionMarket_V3 and applies the V3 launch configuration.
 *
 * The rates are not contract defaults on purpose: they are policy, and policy
 * that lives in the constructor cannot be changed without a redeploy. Setting
 * them here keeps the source identical across chains.
 *
 * Resumable, and that is the point. The first Base deploy lost its second
 * configuration transaction to "in-flight transaction limit reached for
 * delegated accounts" and left a deployed contract with the wrong minBet.
 * Re-running this script at that moment would have deployed a *second*
 * contract rather than finishing the first. So:
 *
 *   V3_ADDRESS=0x... npx hardhat run scripts/deploy_v3.js --network <net>
 *
 * skips the deploy and only configures. Nothing else changes.
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

/**
 * Sends one configuration transaction and does not return until the account has
 * nothing in flight.
 *
 * `.wait()` alone was not enough on Base: it returned from one node while the
 * next send hit another that still counted the previous transaction as pending.
 * Waiting for pending and latest nonces to agree is what actually settles it.
 */
async function sendConfig(label, send, deployer) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const tx = await send();
      const receipt = await tx.wait(1);
      if (receipt.status !== 1) {
        throw new Error(`${label} reverted in ${receipt.hash}`);
      }

      // Drain: do not start the next send while this one is still counted.
      for (let i = 0; i < 30; i++) {
        const [pending, latest] = await Promise.all([
          ethers.provider.getTransactionCount(deployer.address, "pending"),
          ethers.provider.getTransactionCount(deployer.address, "latest"),
        ]);
        if (pending === latest) break;
        await new Promise((r) => setTimeout(r, 1000));
      }

      console.log(`  ${label} ok (${tx.hash})`);
      return;
    } catch (error) {
      const message = error?.message ?? String(error);
      const retryable = /in-flight transaction limit|nonce|replacement/i.test(message);
      if (!retryable || attempt === 3) throw error;
      console.log(`  ${label} attempt ${attempt} failed (${message.slice(0, 80)}), retrying`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

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

  let market;
  let address = process.env.V3_ADDRESS;
  if (address) {
    // Resume path. Confirm it is really this contract on this chain before
    // sending it owner-only transactions.
    market = Market.attach(address);
    const attachedCollateral = await market.collateral();
    if (attachedCollateral.toLowerCase() !== collateral.toLowerCase()) {
      throw new Error(
        `${address} holds ${attachedCollateral}, not ${collateral}. Wrong contract or wrong network.`
      );
    }
    console.log(`Resuming configuration of ${address}`);
  } else {
    market = await Market.deploy(collateral);
    await market.waitForDeployment();
    address = await market.getAddress();
    console.log(`PredictionMarket_V3 deployed at ${address}`);
    console.log(`  if anything below fails, resume with V3_ADDRESS=${address}`);
  }

  console.log("Applying launch configuration...");
  await sendConfig("setPlatformFee", () => market.setPlatformFee(PLATFORM_FEE), deployer);
  await sendConfig("setMinBet", () => market.setMinBet(MIN_BET), deployer);

  // Read the result back and refuse to report success on a value we did not
  // confirm. The Base run printed a minBet that was simply wrong, because the
  // read landed on a node that had not caught the block yet.
  const [platform, creator, exit, minimumBet] = await market.getFeeConfig();
  console.log(`  platformFee       ${platform}`);
  console.log(`  creatorFee        ${creator}`);
  console.log(`  earlyExitFee      ${exit}`);
  console.log(`  minBet            ${minimumBet}`);

  const wrong = [];
  if (Number(platform) !== PLATFORM_FEE) wrong.push(`platformFee ${platform} != ${PLATFORM_FEE}`);
  if (Number(minimumBet) !== MIN_BET) wrong.push(`minBet ${minimumBet} != ${MIN_BET}`);
  if (wrong.length) {
    throw new Error(
      `Configuration did not stick: ${wrong.join(", ")}. ` +
        `Resume with V3_ADDRESS=${address} rather than redeploying.`
    );
  }

  console.log(`\nDeployed and configured: ${address}`);
  console.log(`Verify with:\n  npx hardhat verify --network ${network.name} ${address} ${collateral}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

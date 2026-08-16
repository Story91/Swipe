/**
 * Deploy PredictionMarket_USDG_DualPool.
 *
 * Collateral is chosen per network:
 *   robinhoodTestnet - the MockUSDC already deployed there (no USDG on testnet)
 *   robinhood        - Paxos USDG, verified on-chain as symbol USDG, 6 decimals
 *   base             - canonical USDC
 *
 * Never resolve the collateral address by explorer search: Robinhood Chain has
 * impostor 18-decimal tokens named "USD Coin".
 *
 * Usage: npx hardhat run scripts/deploy_usdg_dualpool.js --network robinhoodTestnet
 */

const hre = require("hardhat");

const COLLATERAL = {
  robinhoodTestnet: process.env.ROBINHOOD_TESTNET_MOCK_USDC,
  robinhood: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", // Paxos USDG
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // canonical USDC
};

async function main() {
  const network = hre.network.name;
  const collateral = COLLATERAL[network];

  if (!collateral) {
    throw new Error(
      `No collateral configured for network '${network}'. ` +
      `On robinhoodTestnet, set ROBINHOOD_TESTNET_MOCK_USDC in .env.local.`
    );
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("No signer. Is PRIVATE_KEY set in .env.local?");

  console.log(`Network:    ${network}`);
  console.log(`Deployer:   ${deployer.address}`);
  console.log(`Collateral: ${collateral}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance:    ${hre.ethers.formatEther(balance)} ETH`);
  if (balance === 0n) throw new Error("Deployer has no gas on this network.");

  // Confirm the collateral is what we think it is before locking it in as an
  // immutable constructor argument.
  const token = new hre.ethers.Contract(
    collateral,
    [
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
    ],
    hre.ethers.provider
  );
  const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
  console.log(`Collateral is ${symbol} with ${decimals} decimals`);
  if (Number(decimals) !== 6) {
    throw new Error(
      `Collateral has ${decimals} decimals, expected 6. minBet and MIN_BET_FLOOR assume 6.`
    );
  }

  console.log("\nDeploying PredictionMarket_USDG_DualPool...");
  const Market = await hre.ethers.getContractFactory("PredictionMarket_USDG_DualPool");
  const market = await Market.deploy(collateral);
  await market.waitForDeployment();
  const address = await market.getAddress();
  console.log("Deployed:", address);

  // Read it back, so we know the bytecode executes and not just that it deployed.
  console.log("\n--- Post-deploy verification ---");
  console.log("owner:            ", await market.owner());
  console.log("collateral:       ", await market.collateral());
  console.log("deployer resolver:", await market.resolvers(deployer.address));
  const [platform, creator, exit, minBet] = await market.getFeeConfig();
  console.log(
    `fees:              platform ${Number(platform) / 100}%, creator ${Number(creator) / 100}%, ` +
    `exit ${Number(exit) / 100}%, minBet ${Number(minBet) / 1e6}`
  );
  console.log("refund grace:     ", (await market.REFUND_GRACE_PERIOD()) / 86400n, "days");

  const envKey =
    network === "robinhoodTestnet"
      ? "ROBINHOOD_TESTNET_USDG_DUALPOOL"
      : network === "robinhood"
        ? "ROBINHOOD_USDG_DUALPOOL"
        : "BASE_USDG_DUALPOOL";

  console.log(`\nAdd to .env.local:\n${envKey}=${address}`);
  console.log(
    `\nVerify:\nnpx hardhat verify --network ${network} ${address} "${collateral}"`
  );

  return { address, collateral, network };
}

main()
  .then((r) => { console.log("\n" + JSON.stringify(r, null, 2)); process.exit(0); })
  .catch((e) => { console.error("\nDeployment failed:", e.message); process.exit(1); });

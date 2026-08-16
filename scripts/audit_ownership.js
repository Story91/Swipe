/**
 * Read-only ownership and balance audit.
 *
 * Written for one purpose: after a suspected key compromise, establish what the
 * compromised address still controls and how much is still sitting in each
 * contract. Sends no transactions.
 *
 * Usage: npx hardhat run scripts/audit_ownership.js --network base
 */

const hre = require("hardhat");

const CONTRACTS = {
  "PredictionMarketV2": "0x2bA339Df34B98099a9047d9442075F7B3a792f74",
  "PredictionMarket_USDC_DualPool": "0xf5Fa6206c2a7d5473ae7468082c9D260DFF83205",
  "SwipeClaim": "0x9f5d800e4123e6cE6f429f5A5DD5018a631A2793",
  "SwipeDailyRewards_V3": "0x363fB0b68a6a2657daAE93bcfEe8fC1D472391fE",
};

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SWIPE = "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9";

const OWNER_ABI = ["function owner() view returns (address)"];
const PENDING_ABI = ["function pendingOwner() view returns (address)"];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
const V2_FEES_ABI = ["function ethFees() view returns (uint256)", "function swipeFees() view returns (uint256)"];
const POOL_FEES_ABI = ["function platformFeeBalance() view returns (uint256)"];

async function tryCall(fn, label) {
  try {
    return await fn();
  } catch (e) {
    return `<${label} unavailable>`;
  }
}

async function main() {
  const provider = hre.ethers.provider;
  const net = await provider.getNetwork();
  console.log(`Network: ${net.name} (chainId ${net.chainId})\n`);

  const usdc = new hre.ethers.Contract(USDC, ERC20_ABI, provider);
  const swipe = new hre.ethers.Contract(SWIPE, ERC20_ABI, provider);

  for (const [name, address] of Object.entries(CONTRACTS)) {
    console.log("=".repeat(64));
    console.log(`${name}`);
    console.log(`  address        ${address}`);

    const owner = await tryCall(
      () => new hre.ethers.Contract(address, OWNER_ABI, provider).owner(),
      "owner"
    );
    console.log(`  owner          ${owner}`);

    const pending = await tryCall(
      () => new hre.ethers.Contract(address, PENDING_ABI, provider).pendingOwner(),
      "no pendingOwner"
    );
    console.log(`  pendingOwner   ${pending}`);

    const eth = await provider.getBalance(address);
    console.log(`  ETH balance    ${hre.ethers.formatEther(eth)}`);

    const usdcBal = await tryCall(() => usdc.balanceOf(address), "usdc");
    if (typeof usdcBal !== "string") {
      console.log(`  USDC balance   ${Number(usdcBal) / 1e6}`);
    }

    const swipeBal = await tryCall(() => swipe.balanceOf(address), "swipe");
    if (typeof swipeBal !== "string") {
      console.log(`  SWIPE balance  ${hre.ethers.formatEther(swipeBal)}`);
    }

    if (name === "PredictionMarketV2") {
      const c = new hre.ethers.Contract(address, V2_FEES_ABI, provider);
      const ef = await tryCall(() => c.ethFees(), "ethFees");
      const sf = await tryCall(() => c.swipeFees(), "swipeFees");
      if (typeof ef !== "string") console.log(`  ethFees        ${hre.ethers.formatEther(ef)} ETH`);
      if (typeof sf !== "string") console.log(`  swipeFees      ${hre.ethers.formatEther(sf)} SWIPE`);
    }

    if (name === "PredictionMarket_USDC_DualPool") {
      const c = new hre.ethers.Contract(address, POOL_FEES_ABI, provider);
      const pf = await tryCall(() => c.platformFeeBalance(), "platformFeeBalance");
      if (typeof pf !== "string") console.log(`  platformFees   ${Number(pf) / 1e6} USDC`);
    }
    console.log("");
  }

  const [signer] = await hre.ethers.getSigners();
  if (signer) {
    console.log("=".repeat(64));
    console.log(`Signer configured in .env.local: ${signer.address}`);
    console.log("Compare against the owners above: matching means this key still controls that contract.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });

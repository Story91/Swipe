/**
 * Read-only: what is still sitting on the compromised wallet, and what is
 * still owed to it. Sends no transactions.
 *
 * Usage: npx hardhat run scripts/audit_compromised_wallet.js --network base
 */

const hre = require("hardhat");

const COMPROMISED = "0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd";
const STAKING_MANAGER = "0x7D96076C750e65B60561491278280e3C324E1944";

const TOKENS = {
  SWIPE: "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  WETH: "0x4200000000000000000000000000000000000006",
};

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

async function main() {
  const provider = hre.ethers.provider;

  console.log("Compromised wallet", COMPROMISED);
  const eth = await provider.getBalance(COMPROMISED);
  console.log(`  ETH                    ${hre.ethers.formatEther(eth)}`);

  for (const [name, address] of Object.entries(TOKENS)) {
    try {
      const t = new hre.ethers.Contract(address, ERC20, provider);
      const [bal, dec] = await Promise.all([t.balanceOf(COMPROMISED), t.decimals()]);
      console.log(`  ${name.padEnd(22)} ${hre.ethers.formatUnits(bal, dec)}`);
    } catch {
      console.log(`  ${name.padEnd(22)} <read failed>`);
    }
  }

  // Staked position inside the Flaunch staking manager, if any.
  console.log("");
  console.log("Inside the Flaunch StakingManager");
  const sm = new hre.ethers.Contract(
    STAKING_MANAGER,
    [
      "function balances(address) view returns (uint256)",
      "function creatorFees() view returns (uint256)",
      "function claimableOwnerFees() view returns (uint256)",
      "function creatorTotalClaimed() view returns (uint256)",
      "function VALID_SHARE_TOTAL() view returns (uint256)",
      "function creatorShare() view returns (uint256)",
      "function ownerShare() view returns (uint256)",
    ],
    provider
  );

  for (const fn of [
    "creatorFees",
    "claimableOwnerFees",
    "creatorTotalClaimed",
  ]) {
    try {
      const v = await sm[fn]();
      console.log(`  ${fn.padEnd(22)} ${hre.ethers.formatEther(v)} ETH  (${v} wei)`);
    } catch {
      console.log(`  ${fn.padEnd(22)} <unavailable>`);
    }
  }

  try {
    const staked = await sm.balances(COMPROMISED);
    console.log(`  staked by wallet       ${hre.ethers.formatEther(staked)} SWIPE`);
  } catch {
    console.log(`  staked by wallet       <unavailable>`);
  }

  try {
    const [total, cs, os] = await Promise.all([
      sm.VALID_SHARE_TOTAL(),
      sm.creatorShare(),
      sm.ownerShare(),
    ]);
    console.log("");
    console.log("Fee split");
    console.log(`  VALID_SHARE_TOTAL      ${total}`);
    console.log(`  creatorShare           ${cs}  (${(Number(cs) * 100) / Number(total)}%)`);
    console.log(`  ownerShare             ${os}  (${(Number(os) * 100) / Number(total)}%)`);
    console.log(`  stakers get the rest   ${(100 - (Number(cs) * 100) / Number(total) - (Number(os) * 100) / Number(total)).toFixed(2)}%`);
  } catch {
    console.log("  <share config unavailable>");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });

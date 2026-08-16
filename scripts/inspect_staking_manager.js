/**
 * Read-only inspection of the Flaunch StakingManager clone that holds SWIPE.
 * Establishes who controls it after the 0xF1fa... key compromise.
 *
 * Usage: npx hardhat run scripts/inspect_staking_manager.js --network base
 */

const hre = require("hardhat");

const CLONE = "0x7D96076C750e65B60561491278280e3C324E1944";
const SWIPE = "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9";
const COMPROMISED = "0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd";
const NEW_KEY = "0xD4885A5aa53446843CABcDE1F35DE9b4E906030e";

// Only the getters we care about; avoids depending on the full verified ABI.
const ABI = [
  "function managerOwner() view returns (address)",
  "function owner() view returns (address)",
  "function creator() view returns (address)",
  "function creatorShare() view returns (uint256)",
  "function ownerShare() view returns (uint256)",
  "function stakingToken() view returns (address)",
  "function minStakeDuration() view returns (uint256)",
  "function minEscrowDuration() view returns (uint256)",
  "function claimableOwnerFees() view returns (uint256)",
  "function creatorFees() view returns (uint256)",
  "function balances(address) view returns (uint256)",
];

async function read(c, name, ...args) {
  try {
    const v = await c[name](...args);
    console.log(`  ${name.padEnd(22)} ${v}`);
    return v;
  } catch {
    console.log(`  ${name.padEnd(22)} <unavailable>`);
    return null;
  }
}

async function main() {
  const provider = hre.ethers.provider;
  const c = new hre.ethers.Contract(CLONE, ABI, provider);

  console.log("Flaunch StakingManager clone", CLONE);
  console.log("");

  const controllers = [];
  for (const fn of ["managerOwner", "owner", "creator"]) {
    const v = await read(c, fn);
    if (v && v !== hre.ethers.ZeroAddress) controllers.push([fn, v]);
  }

  for (const fn of [
    "stakingToken",
    "creatorShare",
    "ownerShare",
    "minStakeDuration",
    "minEscrowDuration",
    "claimableOwnerFees",
    "creatorFees",
  ]) {
    await read(c, fn);
  }

  const swipe = new hre.ethers.Contract(
    SWIPE,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );
  const held = await swipe.balanceOf(CLONE);
  console.log(`  SWIPE held             ${hre.ethers.formatEther(held)}`);

  console.log("");
  console.log("Control check");
  if (controllers.length === 0) {
    console.log("  No controlling address readable through these getters.");
  }
  for (const [fn, addr] of controllers) {
    const who =
      addr.toLowerCase() === COMPROMISED.toLowerCase()
        ? "COMPROMISED KEY"
        : addr.toLowerCase() === NEW_KEY.toLowerCase()
          ? "new key"
          : "third party / other contract";
    console.log(`  ${fn} = ${addr}  -> ${who}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });

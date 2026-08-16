/**
 * Read-only inspection of the SWIPE token on Base and of the address that
 * appears to control it. Sends no transactions.
 *
 * Usage: npx hardhat run scripts/inspect_swipe_token.js --network base
 */

const hre = require("hardhat");

const SWIPE = "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9";
const SUSPECT = "0x7D96076C750e65B60561491278280e3C324E1944";

const PROBES = [
  ["owner()", "function owner() view returns (address)"],
  ["Ownable pendingOwner()", "function pendingOwner() view returns (address)"],
  ["name()", "function name() view returns (string)"],
  ["symbol()", "function symbol() view returns (string)"],
  ["decimals()", "function decimals() view returns (uint8)"],
  ["totalSupply()", "function totalSupply() view returns (uint256)"],
];

async function probe(address, label, sig, provider) {
  try {
    const c = new hre.ethers.Contract(address, [sig], provider);
    const fn = sig.match(/function (\w+)\(/)[1];
    const value = await c[fn]();
    console.log(`  ${label.padEnd(24)} ${value}`);
    return value;
  } catch {
    console.log(`  ${label.padEnd(24)} <not present>`);
    return null;
  }
}

async function main() {
  const provider = hre.ethers.provider;

  console.log("=".repeat(70));
  console.log("SWIPE token", SWIPE);
  for (const [label, sig] of PROBES) await probe(SWIPE, label, sig, provider);

  const swipe = new hre.ethers.Contract(
    SWIPE,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );
  const held = await swipe.balanceOf(SUSPECT);
  console.log(`  suspect balance          ${hre.ethers.formatEther(held)} SWIPE`);

  console.log("");
  console.log("=".repeat(70));
  console.log("Suspect address", SUSPECT);

  const code = await provider.getCode(SUSPECT);
  console.log(`  bytecode size            ${(code.length - 2) / 2} bytes`);
  console.log(`  is contract              ${code !== "0x"}`);

  if (code !== "0x") {
    for (const [label, sig] of PROBES) await probe(SUSPECT, label, sig, provider);
    // Flaunch positions are ERC-721; a manager would expose these.
    for (const [label, sig] of [
      ["ERC721 name()", "function name() view returns (string)"],
      ["memecoin()", "function memecoin() view returns (address)"],
      ["flaunch()", "function flaunch() view returns (address)"],
      ["positionManager()", "function positionManager() view returns (address)"],
      ["poolManager()", "function poolManager() view returns (address)"],
      ["treasury()", "function treasury() view returns (address)"],
    ]) {
      await probe(SUSPECT, label, sig, provider);
    }
  }

  console.log("");
  console.log("Explorer: https://basescan.org/address/" + SUSPECT);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });

require("dotenv").config({ path: ".env.local" });
const { ethers, network } = require("hardhat");

/**
 * One-time role grant: lets REGISTRAR_ADDRESS resolve markets, so the weekly
 * routine signs with the limited operational key instead of the owner's.
 *
 *   npx hardhat run scripts/grant_resolver.js --network base
 *   npx hardhat run scripts/grant_resolver.js --network robinhood
 *
 * Signs with PRIVATE_KEY, which must be the contract owner. Idempotent: an
 * already-granted role is reported and skipped.
 */

const MARKETS = {
  base: process.env.NEXT_PUBLIC_BASE_V4_CONTRACT || "0x4129d706c283e6bAC749CFe9221AD322981917E6",
  robinhood: process.env.NEXT_PUBLIC_ROBINHOOD_V4_CONTRACT || "0x41a6Fd3d35C0F9DD13773A763358E35B5216eEe4",
};

async function main() {
  const resolver = process.env.REGISTRAR_ADDRESS;
  if (!/^0x[0-9a-fA-F]{40}$/.test(resolver ?? "")) {
    throw new Error("REGISTRAR_ADDRESS is not set to an address");
  }
  const address = MARKETS[network.name];
  if (!address) throw new Error(`No V4 market configured for network ${network.name}`);

  const [signer] = await ethers.getSigners();
  const market = await ethers.getContractAt("PredictionMarket_V4", address, signer);

  const owner = await market.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`${signer.address} is not the owner of ${address} (owner is ${owner})`);
  }

  if (await market.resolvers(resolver)) {
    console.log(`${resolver} is already a resolver on ${network.name}, nothing to do`);
    return;
  }

  const tx = await market.setResolver(resolver, true);
  const receipt = await tx.wait(1);
  if (receipt.status !== 1) throw new Error(`setResolver reverted in ${tx.hash}`);

  const granted = await market.resolvers(resolver);
  if (!granted) throw new Error("setResolver succeeded but resolvers() still reads false");
  console.log(`${resolver} is now a resolver on ${network.name} (${tx.hash})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

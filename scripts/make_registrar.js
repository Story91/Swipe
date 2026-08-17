require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const { Wallet } = require("ethers");

/**
 * Creates the key the server uses to open markets, and nothing else.
 *
 *   node scripts/make_registrar.js
 *
 * Writes REGISTRAR_PRIVATE_KEY and REGISTRAR_ADDRESS into .env.local and prints
 * only the address. The private key is never printed, because a transcript, a
 * screen share or a scrollback is a place secrets escape from, and one has
 * already escaped that way in this project.
 *
 * What this key can do, once granted with setRegistrar: call
 * registerPrediction and registerPredictionsBatch. That is the entire list. It
 * cannot resolve, cancel, refund, change a fee, withdraw, or transfer
 * ownership. Losing it means someone can create junk markets, which earns them
 * nothing and is revoked with one setRegistrar call.
 *
 * It must never be the deployer. The deployer is the owner and a resolver, and
 * putting that key on a server is the thing V4 was written to avoid.
 */

const ENV = ".env.local";

function main() {
  if (process.env.REGISTRAR_PRIVATE_KEY) {
    const existing = new Wallet(process.env.REGISTRAR_PRIVATE_KEY);
    console.log("A registrar key already exists. Not overwriting it.");
    console.log(`  address ${existing.address}`);
    console.log("Delete REGISTRAR_PRIVATE_KEY from .env.local first if you mean to rotate it.");
    return;
  }

  const wallet = Wallet.createRandom();

  const lines = [
    "",
    "# Opens markets that users propose. Granted with setRegistrar on V4.",
    "# Can register markets and do nothing else: it cannot resolve, cancel,",
    "# change a fee, or move a balance. Needs a little gas on each chain.",
    `REGISTRAR_ADDRESS=${wallet.address}`,
    `REGISTRAR_PRIVATE_KEY=${wallet.privateKey}`,
    "",
  ].join("\n");

  fs.appendFileSync(ENV, lines);

  console.log("Registrar key written to .env.local");
  console.log(`  address ${wallet.address}`);
  console.log("");
  console.log("Next:");
  console.log("  1. Send a small amount of gas to that address on Base and on Robinhood.");
  console.log("  2. Deploy with REGISTRAR_ADDRESS set, which grants the role.");
  console.log("  3. Put REGISTRAR_PRIVATE_KEY in the Vercel project environment.");
  console.log("");
  console.log("The private key is in .env.local and was deliberately not printed here.");
}

main();

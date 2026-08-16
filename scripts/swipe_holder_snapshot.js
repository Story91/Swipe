/**
 * Reconstruct SWIPE holder balances on Base from Transfer events.
 *
 * An ERC-20 stores only current balances, so "held for more than a week" cannot
 * be read from the contract — it has to be replayed from history. This walks
 * every Transfer log, rebuilds each address's balance over time, and reports
 * three different readings of "long-term holder" so the airdrop rule can be
 * chosen from real numbers rather than guessed:
 *
 *   balanceAtCutoff   - balance at a fixed past block. The usual airdrop rule:
 *                       simple, and impossible to game after the fact.
 *   heldContinuously  - held a non-zero balance from the cutoff through to now,
 *                       never selling to zero in between.
 *   firstSeenBefore   - first acquired before the cutoff, whatever happened since.
 *
 * Read-only. Writes a JSON report and sends no transactions.
 *
 * Usage:
 *   npx hardhat run scripts/swipe_holder_snapshot.js --network base
 *   HOLDER_DAYS=7 npx hardhat run scripts/swipe_holder_snapshot.js --network base
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const SWIPE = "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO = "0x0000000000000000000000000000000000000000";

// Contracts that hold tokens on behalf of users rather than as holders.
const EXCLUDE = new Set(
  [
    "0x7D96076C750e65B60561491278280e3C324E1944", // Flaunch StakingManager
    ZERO,
  ].map((a) => a.toLowerCase())
);

const HOLDER_DAYS = Number(process.env.HOLDER_DAYS || 7);
const CHUNK = Number(process.env.LOG_CHUNK || 5000);

async function findDeploymentBlock(provider, latest) {
  // Binary search for the first block where the token has code.
  let low = 0n;
  let high = BigInt(latest);
  while (low < high) {
    const mid = (low + high) / 2n;
    const code = await provider.getCode(SWIPE, mid);
    if (code === "0x") low = mid + 1n;
    else high = mid;
  }
  return low;
}

async function main() {
  const provider = hre.ethers.provider;
  const latest = await provider.getBlockNumber();

  console.log("Locating deployment block...");
  const deployedAt = await findDeploymentBlock(provider, latest);
  console.log(`  token deployed at block ${deployedAt}`);
  console.log(`  latest block            ${latest}`);
  console.log(`  range                   ${BigInt(latest) - deployedAt} blocks`);

  const latestBlock = await provider.getBlock(latest);
  const cutoffTime = latestBlock.timestamp - HOLDER_DAYS * 86400;

  // Compare block numbers, not timestamps. Fetching a timestamp per transfer
  // block would add one RPC round trip per block and dominate the runtime.
  // Base produces a block every 2 seconds, and the boundary only has to be
  // accurate to within a few blocks for a day-scale cutoff.
  const BASE_BLOCK_SECONDS = 2;
  const cutoffBlock = BigInt(latest) - BigInt(Math.floor((HOLDER_DAYS * 86400) / BASE_BLOCK_SECONDS));
  console.log(`  cutoff block            ${cutoffBlock} (~${HOLDER_DAYS}d ago)`);

  console.log(`\nFetching Transfer logs in chunks of ${CHUNK}...`);
  const logs = [];
  let from = deployedAt;
  let fetched = 0;

  while (from <= BigInt(latest)) {
    const to = from + BigInt(CHUNK) - 1n > BigInt(latest) ? BigInt(latest) : from + BigInt(CHUNK) - 1n;
    try {
      const chunk = await provider.getLogs({
        address: SWIPE,
        topics: [TRANSFER_TOPIC],
        fromBlock: from,
        toBlock: to,
      });
      logs.push(...chunk);
      fetched += chunk.length;
      if (chunk.length > 0) {
        process.stdout.write(`\r  ${from}-${to}: ${fetched} transfers so far   `);
      }
    } catch (e) {
      console.log(`\n  chunk ${from}-${to} failed (${e.message.slice(0, 60)}), halving`);
      // Retry the same range in smaller pieces rather than losing it.
      const half = (to - from) / 2n;
      if (half < 1n) throw e;
      const first = await provider.getLogs({ address: SWIPE, topics: [TRANSFER_TOPIC], fromBlock: from, toBlock: from + half });
      const second = await provider.getLogs({ address: SWIPE, topics: [TRANSFER_TOPIC], fromBlock: from + half + 1n, toBlock: to });
      logs.push(...first, ...second);
      fetched += first.length + second.length;
    }
    from = to + 1n;
  }

  console.log(`\n  ${logs.length} Transfer events total`);

  // Block timestamps, fetched once per distinct block that matters.
  console.log("\nReplaying balances...");
  const balances = new Map();
  const firstSeen = new Map();
  const balanceAtCutoff = new Map();
  const wentToZeroAfterCutoff = new Set();

  logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

  let cutoffCaptured = false;
  for (const log of logs) {
    const fromAddr = ("0x" + log.topics[1].slice(26)).toLowerCase();
    const toAddr = ("0x" + log.topics[2].slice(26)).toLowerCase();
    const value = BigInt(log.data);

    if (!cutoffCaptured && BigInt(log.blockNumber) > cutoffBlock) {
      for (const [addr, bal] of balances) balanceAtCutoff.set(addr, bal);
      cutoffCaptured = true;
    }

    if (fromAddr !== ZERO) {
      const next = (balances.get(fromAddr) || 0n) - value;
      balances.set(fromAddr, next);
      if (cutoffCaptured && next <= 0n) wentToZeroAfterCutoff.add(fromAddr);
    }
    if (toAddr !== ZERO) {
      balances.set(toAddr, (balances.get(toAddr) || 0n) + value);
      if (!firstSeen.has(toAddr)) firstSeen.set(toAddr, BigInt(log.blockNumber));
    }
  }
  if (!cutoffCaptured) {
    for (const [addr, bal] of balances) balanceAtCutoff.set(addr, bal);
  }

  const fmt = (v) => hre.ethers.formatEther(v);

  const current = [...balances.entries()]
    .filter(([addr, bal]) => bal > 0n && !EXCLUDE.has(addr))
    .sort((a, b) => (b[1] > a[1] ? 1 : -1));

  const atCutoff = [...balanceAtCutoff.entries()]
    .filter(([addr, bal]) => bal > 0n && !EXCLUDE.has(addr));

  const continuous = atCutoff.filter(
    ([addr]) => !wentToZeroAfterCutoff.has(addr) && (balances.get(addr) || 0n) > 0n
  );

  const firstBefore = current.filter(
    ([addr]) => (firstSeen.get(addr) ?? BigInt(latest)) <= cutoffBlock
  );

  console.log("\n" + "=".repeat(64));
  console.log(`Cutoff: ${HOLDER_DAYS} days ago (${new Date(cutoffTime * 1000).toISOString()})`);
  console.log(`  holders now                       ${current.length}`);
  console.log(`  balanceAtCutoff  (held then)      ${atCutoff.length}`);
  console.log(`  heldContinuously (then and since) ${continuous.length}`);
  console.log(`  firstSeenBefore  (acquired then)  ${firstBefore.length}`);

  const report = {
    token: SWIPE,
    chainId: 8453,
    generatedAtBlock: latest,
    cutoffBlock: cutoffBlock.toString(),
    cutoffTimestamp: cutoffTime,
    holderDays: HOLDER_DAYS,
    excluded: [...EXCLUDE],
    transferCount: logs.length,
    counts: {
      holdersNow: current.length,
      balanceAtCutoff: atCutoff.length,
      heldContinuously: continuous.length,
      firstSeenBefore: firstBefore.length,
    },
    holdersNow: current.map(([a, b]) => ({ address: a, balance: b.toString(), formatted: fmt(b) })),
    balanceAtCutoff: atCutoff.map(([a, b]) => ({ address: a, balance: b.toString(), formatted: fmt(b) })),
    heldContinuously: continuous.map(([a, b]) => ({
      address: a,
      balanceAtCutoff: b.toString(),
      balanceNow: (balances.get(a) || 0n).toString(),
    })),
  };

  const out = path.join(__dirname, "..", "docs", `swipe-holder-snapshot-${latest}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nWritten: ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("\n" + e.message); process.exit(1); });

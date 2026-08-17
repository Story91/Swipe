require("dotenv").config({ path: ".env.local" });
const { ethers, network } = require("hardhat");
const { Redis } = require("@upstash/redis");

/**
 * Creates one market end to end: allocates its number, registers it on chain,
 * and writes the Redis record the app reads.
 *
 * registerPrediction is onlyRegistrar on V4, so a market cannot be minted
 * straight from a user's wallet. This is the operator's tool for making them by
 * hand; the server does the same thing for markets people propose.
 *
 *   QUESTION="Will ETH close above $4,000 on 31 Dec?" HOURS=168 \
 *     npx hardhat run scripts/create_market.js --network base
 *
 * Optional: DESCRIPTION, CATEGORY, IMAGE_URL, CREATOR (defaults to the signer,
 * and this address is paid the 0.5% creator fee).
 *
 * Order matters. The number is allocated first, then the chain, then Redis. If
 * the chain call fails the number is burned and nothing is published, which
 * costs nothing. The other order would leave a registered market the app cannot
 * see, and the next allocation could hand its number to a different market.
 *
 * Plain CommonJS on purpose: hardhat runs this without transpiling, so it cannot
 * import lib/*.ts. The addresses below therefore mirror lib/chains/index.ts and
 * must be kept in step with it. The collateral check further down is what
 * catches them drifting apart, rather than trusting the copy.
 */

const CHAINS = {
  base: {
    key: "base",
    market: process.env.NEXT_PUBLIC_BASE_V4_CONTRACT || "0x4129d706c283e6bAC749CFe9221AD322981917E6",
    collateral: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    explorer: "https://basescan.org",
    /** Base is the identity namespace, so its keys keep the shape they have. */
    prefix: "",
  },
  robinhood: {
    key: "robinhood",
    market: process.env.NEXT_PUBLIC_ROBINHOOD_V4_CONTRACT || "0x41a6Fd3d35C0F9DD13773A763358E35B5216eEe4",
    collateral: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    explorer: "https://robinhoodchain.blockscout.com",
    prefix: "robinhood:",
  },
};

/**
 * The same counter lib/marketAllocator.ts allocates from, written out because
 * hardhat runs this file untranspiled and it cannot import a .ts module.
 *
 * These two were briefly different. The web proposal path counted from
 * market:v3:next_id and stamped pred_v3_, this script counted from
 * market:v4:next_id and stamped pred_v4_, and both registered against the same
 * V4 contract. Neither probe could see the other's records, so the two of them
 * could hand out one on-chain market number twice. marketAllocator.test.ts
 * asserts this exact string, so changing it there fails the suite here.
 */
const V4_ID_COUNTER = "market:v4:next_id";
const MAX_PROBES = 50;

/**
 * The same pools CreatePredictionModal offers, so a market made here carries the
 * identical chart to one made in the form. Mirrors CRYPTO_OPTIONS in that file.
 */
const CHARTS = {
  BTC: { chain: "eth", pool: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599" },
  ETH: { chain: "eth", pool: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" },
  SOL: { chain: "solana", pool: "So11111111111111111111111111111111111111112" },
  XRP: { chain: "bsc", pool: "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe" },
  BNB: { chain: "eth", pool: "0xb8c77482e45f1f44de1745f52c74426c631bdd52" },
  SWIPE: { chain: "base", pool: "0xd0187d77af0ed6a44f0a631b406c78b30e160aa9" },
};

function chartUrl(symbol) {
  const c = CHARTS[symbol];
  if (!c) throw new Error(`CRYPTO must be one of ${Object.keys(CHARTS).join(", ")}`);
  return (
    `https://www.geckoterminal.com/${c.chain}/pools/${c.pool}` +
    `?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=ffffff`
  );
}

const READBACK_ATTEMPTS = 10;
const READBACK_DELAY_MS = 3000;

/** Reads the market until a node that has the block answers, or we give up. */
async function readBack(market, numericId) {
  let last;
  for (let attempt = 1; attempt <= READBACK_ATTEMPTS; attempt++) {
    try {
      last = await market.getPrediction(numericId);
      if (last[0]) return last;
    } catch (error) {
      last = null;
    }
    if (attempt < READBACK_ATTEMPTS) {
      console.log(`  read-back ${attempt}/${READBACK_ATTEMPTS} says not registered, waiting`);
      await new Promise((resolve) => setTimeout(resolve, READBACK_DELAY_MS));
    }
  }
  throw new Error(
    `Market ${numericId} still reads as unregistered after ${READBACK_ATTEMPTS} tries. ` +
      `If the registration transaction succeeded, re-run with ADOPT_ID= rather than creating it again.`
  );
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** Same rule as lib/marketAllocator.ts: INCR, never a scan for the highest id. */
async function allocateId(redis, prefix) {
  for (let attempt = 0; attempt < MAX_PROBES; attempt++) {
    const candidate = await redis.incr(V4_ID_COUNTER);
    if (!Number.isSafeInteger(candidate) || candidate < 1) break;
    const existing = await redis.get(`${prefix}prediction:pred_v4_${candidate}`);
    if (existing === null || existing === undefined) return candidate;
  }
  throw new Error(`Could not find a free market id. The counter ${V4_ID_COUNTER} is behind.`);
}

async function main() {
  const question = process.env.QUESTION?.trim();
  const hours = Number(process.env.HOURS ?? 168);

  if (!question) throw new Error("QUESTION is required");
  if (question.length > 200) throw new Error("QUESTION must be 200 characters or fewer");
  if (!Number.isFinite(hours) || hours < 1) throw new Error("HOURS must be at least 1");

  const crypto = process.env.CRYPTO?.trim().toUpperCase();
  const chain = CHAINS[network.name];
  if (!chain) throw new Error(`No configuration for network ${network.name}`);

  const [signer] = await ethers.getSigners();
  const creator = (process.env.CREATOR ?? signer.address).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(creator)) throw new Error("CREATOR must be an address");

  const market = await ethers.getContractAt("PredictionMarket_V4", chain.market, signer);

  // Confirms the address holds the contract we think it does, on the chain we
  // think we are on. This is what catches the address copy above drifting from
  // lib/chains, rather than trusting that it did not.
  const onChainCollateral = await market.collateral();
  if (onChainCollateral.toLowerCase() !== chain.collateral.toLowerCase()) {
    throw new Error(
      `${chain.market} holds ${onChainCollateral}, expected ${chain.collateral}. Wrong address or wrong network.`
    );
  }

  // Refuse early rather than reverting, because a revert is indistinguishable
  // from a dozen other failures.
  //
  // The role to check is registrar, not resolver. V4 split them: a resolver
  // settles markets and cannot open one. Checking the wrong role here would
  // pass for a key that then reverts, and fail for a key that would have
  // worked.
  const [isOwner, isRegistrar] = await Promise.all([
    market.owner().then((o) => o.toLowerCase() === signer.address.toLowerCase()),
    market.registrars(signer.address),
  ]);
  if (!isOwner && !isRegistrar) {
    throw new Error(
      `${signer.address} cannot open markets on ${chain.market}. ` +
        `It is neither the owner nor a registrar. Grant it with setRegistrar.`
    );
  }

  const redis = new Redis({
    url: requireEnv("UPSTASH_REDIS_REST_URL"),
    token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
  });

  // ADOPT_ID writes the Redis record for a market already registered on chain.
  // For exactly the case this script produced once: it registered the market,
  // then threw on a lagging read before publishing, leaving a market that exists
  // on chain and cannot be seen in the app. Registering again would revert.
  const adopt = process.env.ADOPT_ID ? Number(process.env.ADOPT_ID) : null;
  const numericId = adopt ?? (await allocateId(redis, chain.prefix));
  const id = `pred_v4_${numericId}`;
  let deadline = Math.floor(Date.now() / 1000) + Math.round(hours * 3600);

  console.log(`Creating ${id} on ${chain.key}`);
  console.log(`  market    ${chain.market}`);
  console.log(`  creator   ${creator}`);
  console.log(`  deadline  ${new Date(deadline * 1000).toISOString()} (${hours}h)`);
  console.log(`  question  ${question}`);

  let txHash = 'already on chain';
  if (adopt === null) {
    const tx = await market.registerPrediction(numericId, creator, deadline);
    const receipt = await tx.wait(1);
    if (receipt.status !== 1) throw new Error(`Registration reverted in ${tx.hash}`);
    txHash = tx.hash;
    console.log(`  registered in ${txHash}`);
  } else {
    console.log(`  adopting market ${numericId}`);
  }

  // Read it back. The receipt says the transaction succeeded; this says the
  // market exists and is the one we meant.
  //
  // Retried because a single read is not trustworthy here. The RPC endpoint is
  // load balanced across nodes, and one that has not caught up to the block the
  // receipt came from answers "not registered" about a market that is plainly
  // registered. That already happened once: the first run threw here, after the
  // chain call succeeded, leaving a live market with no Redis record.
  const onChain = await readBack(market, numericId);
  if (onChain[1].toLowerCase() !== creator) {
    throw new Error(`Creator on chain is ${onChain[1]}, expected ${creator}`);
  }

  // In adopt mode the deadline argument was never used; take the real one.
  if (adopt !== null) deadline = Number(onChain[2]);

  const now = Math.floor(Date.now() / 1000);
  const endsAt = new Date(deadline * 1000);
  const record = {
    id,
    question,
    description: process.env.DESCRIPTION?.trim() ?? "",
    category: process.env.CATEGORY?.trim() || "Crypto",
    imageUrl: crypto ? chartUrl(crypto) : (process.env.IMAGE_URL?.trim() ?? ""),
    includeChart: Boolean(crypto),
    selectedCrypto: crypto,
    endDate: endsAt.toISOString().slice(0, 10),
    endTime: endsAt.toISOString().slice(11, 16),
    deadline,
    yesTotalAmount: 0,
    noTotalAmount: 0,
    swipeYesTotalAmount: 0,
    swipeNoTotalAmount: 0,
    usdcPoolEnabled: true,
    usdcYesTotalAmount: 0,
    usdcNoTotalAmount: 0,
    resolved: false,
    cancelled: false,
    createdAt: now,
    creator,
    verified: true,
    approved: true,
    // Already registered on chain, so it belongs in the live feed. Setting this
    // true would hide a market people can actually bet on.
    needsApproval: false,
    participants: [],
    totalStakes: 0,
    // The contract this was actually registered on, which is the V4 address in
    // CHAINS above. It said "V3" while minting pred_v4_ ids, so the record
    // disagreed with its own id about which contract holds the money.
    contractVersion: "V4",
  };

  const p = chain.prefix;
  await redis.set(`${p}prediction:${id}`, JSON.stringify(record));
  await redis.sadd(`${p}predictions`, id);
  await redis.sadd(`${p}predictions:active`, id);
  await redis.srem(`${p}predictions:pending_approval`, id);
  await redis.srem(`${p}predictions:resolved`, id);
  await redis.sadd(`${p}predictions:category:${record.category}`, id);
  await redis.incr(`${p}predictions:count`);
  // The listing snapshot is rebuilt on the next read; dropping it is what makes
  // the new market appear rather than waiting out the cache.
  await redis.del(`${p}predictions:index`);

  console.log(`\nLive: ${id}`);
  console.log(`  ${chain.explorer}/address/${chain.market}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

# Phase 1: Chain Configuration Layer + Robinhood Testnet Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every hardcoded Base-chain assumption with a single chain-configuration module, and prove the contracts deploy to Robinhood Chain testnet.

**Architecture:** A new `lib/chains/` module owns chain identity, RPC URLs, contract addresses and collateral-token metadata. All 21 files that currently import `base` from `viem/chains`/`wagmi/chains` consume it instead. Separately, `hardhat.config.js` gains Robinhood testnet, and a deploy script puts `MockUSDC` + `PredictionMarket_USDC_DualPool` on chain 46630 to validate that solc 0.8.20 + `viaIR` + `evmVersion: paris` bytecode is accepted by ArbOS 61.

**Tech Stack:** Next.js 15.3.6 (App Router), viem 2.x, wagmi 2.x, Hardhat 2.26.x, Solidity 0.8.20, Vitest (added by this plan), Upstash Redis.

**Spec:** `docs/superpowers/specs/2026-08-16-swipe-rebuild-design.md`

## Global Constraints

- **Do not add `evmVersion` to `hardhat.config.js`.** Hardhat currently resolves solc 0.8.20 to `paris`, confirmed by `npx hardhat compile` printing `evm target: paris`. Setting `shanghai`/`cancun` emits PUSH0 and can brick deployment on ArbOS.
- **TypeScript target is below ES2020** — BigInt literals (`0n`) are a compile error (TS2737). Use `BigInt(0)` or plain `0`.
- **No `NEXT_PUBLIC_` prefix on any secret.** Values so prefixed are inlined into the browser bundle.
- Existing env var names stay valid. `NEXT_PUBLIC_BASE_RPC_URL` remains the Base RPC source; this plan adds names, it does not rename existing ones.
- Robinhood Chain facts, all verified live: mainnet chainId **4663**, RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `https://robinhoodchain.blockscout.com`. Testnet chainId **46630**, RPC `https://rpc.testnet.chain.robinhood.com`, explorer `https://explorer.testnet.chain.robinhood.com`, faucet `https://faucet.testnet.chain.robinhood.com/`. Native gas token is **ETH** on both.
- Mainnet USDG is `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (Paxos, 6 decimals, verified on-chain). **There is no USDG on testnet and no canonical USDC on either** — explorer search returns 18-decimal impostors. Never resolve a stablecoin address by explorer search.
- After every task: `npx tsc --noEmit` must exit 0 and `npm run build` must succeed.

---

## File Structure

**Created:**
- `lib/chains/types.ts` — `ChainKey`, `ChainConfig`, `StableToken`, `ChainContracts`
- `lib/chains/definitions.ts` — viem `Chain` objects for Robinhood mainnet + testnet
- `lib/chains/index.ts` — the `CHAINS` registry, lookup helpers, `createChainPublicClient`
- `lib/chains/index.test.ts` — unit tests for the registry
- `lib/chains/no-direct-imports.test.ts` — guard test preventing regression
- `scripts/deploy_robinhood_testnet.js` — MockUSDC + DualPool deploy for chain 46630
- `vitest.config.ts` — test runner config

**Modified:**
- `hardhat.config.js` — add `robinhoodTestnet` + `robinhood` networks, Blockscout verification entries, drop dead `baseGoerli`
- `package.json` — add `test:unit`, `deploy:robinhood:testnet`; add `vitest` devDependency
- `wagmi.ts:2,25,39` — consume chain config
- `app/providers.tsx:4,18` — consume chain config
- 18 API route files + `app/components/Modals/CreatePredictionModal.tsx` — consume chain config

---

## Task 1: Robinhood testnet deploy

Answers the one unverified question that gates the whole Robinhood effort: does our bytecode deploy on ArbOS 61? Runs before any refactor so a negative answer costs nothing.

**Files:**
- Modify: `hardhat.config.js:17-45` (networks), `hardhat.config.js:49-58` (customChains), `hardhat.config.js:30-34` (remove `baseGoerli`)
- Create: `scripts/deploy_robinhood_testnet.js`
- Modify: `package.json` (scripts block)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: two deployed testnet addresses, recorded in `.env.local` as
  `ROBINHOOD_TESTNET_MOCK_USDC` and `ROBINHOOD_TESTNET_DUALPOOL`. Task 2 uses
  these as the `robinhoodTestnet` entry's `stable.address` and `contracts.dualPool`.

- [ ] **Step 1: Add Robinhood networks to hardhat config**

In `hardhat.config.js`, delete the `baseGoerli` block (lines 30-34 — the chain is discontinued) and add both Robinhood networks to `networks`:

```js
    robinhoodTestnet: {
      url: process.env.ROBINHOOD_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 46630,
    },
    robinhood: {
      url: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 4663,
    },
```

Also remove the now-dead `deploy:base-goerli` reference if any remains in `package.json`.

- [ ] **Step 2: Add Blockscout verification entries**

Robinhood uses Blockscout, not Etherscan. Append to the `customChains` array in `hardhat.config.js`:

```js
      {
        network: "robinhoodTestnet",
        chainId: 46630,
        urls: {
          apiURL: "https://explorer.testnet.chain.robinhood.com/api",
          browserURL: "https://explorer.testnet.chain.robinhood.com"
        }
      },
      {
        network: "robinhood",
        chainId: 4663,
        urls: {
          apiURL: "https://robinhoodchain.blockscout.com/api",
          browserURL: "https://robinhoodchain.blockscout.com"
        }
      }
```

Blockscout accepts any non-empty API key string; the existing `apiKey` value is fine.

- [ ] **Step 3: Verify the chain is reachable and confirm chain ID**

```bash
curl -s -X POST https://rpc.testnet.chain.robinhood.com \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

Expected: `{"jsonrpc":"2.0","id":1,"result":"0xb626"}` — `0xb626` is 46630.
If this returns anything else, STOP and report; the rest of the task is invalid.

- [ ] **Step 4: Write the deploy script**

Create `scripts/deploy_robinhood_testnet.js`:

```js
const hre = require("hardhat");

async function main() {
  if (hre.network.name !== "robinhoodTestnet") {
    throw new Error(`Wrong network! Expected 'robinhoodTestnet', got '${hre.network.name}'`);
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");
  if (balance === 0n) {
    throw new Error("Deployer has no testnet ETH. Fund it at https://faucet.testnet.chain.robinhood.com/");
  }

  // Robinhood testnet has no USDG and no canonical USDC, so the market is
  // deployed against a mock 6-decimal stablecoin.
  console.log("\nDeploying MockUSDC...");
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const mockUsdc = await MockUSDC.deploy();
  await mockUsdc.waitForDeployment();
  const mockUsdcAddress = await mockUsdc.getAddress();
  console.log("MockUSDC:", mockUsdcAddress);

  console.log("\nDeploying PredictionMarket_USDC_DualPool...");
  const DualPool = await hre.ethers.getContractFactory("PredictionMarket_USDC_DualPool");
  const dualPool = await DualPool.deploy(mockUsdcAddress);
  await dualPool.waitForDeployment();
  const dualPoolAddress = await dualPool.getAddress();
  console.log("DualPool:", dualPoolAddress);

  // Prove the deployed bytecode actually executes on ArbOS, not just that it deployed.
  console.log("\n--- Post-deploy verification ---");
  console.log("MockUSDC decimals:", await mockUsdc.decimals());
  console.log("DualPool owner:", await dualPool.owner());
  console.log("DualPool usdc():", await dualPool.usdc());
  console.log("Deployer is resolver:", await dualPool.resolvers(deployer.address));

  const [platformFee, creatorFee, earlyExitFee, minBet] = await dualPool.getFeeConfig();
  console.log(`Fees — platform ${Number(platformFee) / 100}%, creator ${Number(creatorFee) / 100}%, exit ${Number(earlyExitFee) / 100}%, minBet ${Number(minBet) / 1e6}`);

  console.log("\nAdd to .env.local:");
  console.log(`ROBINHOOD_TESTNET_MOCK_USDC=${mockUsdcAddress}`);
  console.log(`ROBINHOOD_TESTNET_DUALPOOL=${dualPoolAddress}`);

  return { mockUsdcAddress, dualPoolAddress };
}

main()
  .then((r) => { console.log("\n" + JSON.stringify(r, null, 2)); process.exit(0); })
  .catch((e) => { console.error("\nDeployment failed:", e.message); process.exit(1); });
```

Note `balance === 0n` is valid here — `hardhat.config.js` and `scripts/` are plain
CommonJS run by Node, not compiled by the app's tsconfig, so the ES2020 constraint
in Global Constraints does not apply to this file.

- [ ] **Step 5: Add npm scripts**

In `package.json` scripts:

```json
    "deploy:robinhood:testnet": "hardhat run scripts/deploy_robinhood_testnet.js --network robinhoodTestnet",
```

- [ ] **Step 6: Compile and confirm the EVM target**

Run: `npx hardhat compile --force`
Expected: `Compiled N Solidity files successfully (evm target: paris).`

If it says anything other than `paris`, STOP — deploying shanghai/cancun bytecode
risks an invalid-opcode failure on ArbOS.

- [ ] **Step 7: Fund the deployer and deploy**

Fund the address held in `PRIVATE_KEY` at `https://faucet.testnet.chain.robinhood.com/`, then:

Run: `npm run deploy:robinhood:testnet`
Expected: both addresses printed, `MockUSDC decimals: 6`, `DualPool usdc()` equal to the MockUSDC address, `Deployer is resolver: true`.

If deployment reverts with an invalid-opcode error, STOP and report — that is the
scenario the Global Constraints warn about and it changes the design.

- [ ] **Step 8: Record the addresses**

Append the two printed lines to `.env.local`. Do not commit `.env.local` (it is covered by `.env*` in `.gitignore`).

- [ ] **Step 9: Verify the contracts on Blockscout**

```bash
npx hardhat verify --network robinhoodTestnet <DUALPOOL_ADDRESS> "<MOCK_USDC_ADDRESS>"
```

Expected: verification succeeds, or reports already-verified. A failure here is
non-blocking for the plan — record it and continue.

- [ ] **Step 10: Commit**

```bash
git add hardhat.config.js scripts/deploy_robinhood_testnet.js package.json
git commit -m "feat: add Robinhood Chain networks and testnet deploy script"
```

---

## Task 2: Chain configuration module

**Files:**
- Create: `vitest.config.ts`, `lib/chains/types.ts`, `lib/chains/definitions.ts`, `lib/chains/index.ts`
- Test: `lib/chains/index.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ROBINHOOD_TESTNET_MOCK_USDC` and `ROBINHOOD_TESTNET_DUALPOOL` from Task 1.
- Produces, all imported from `@/lib/chains`:
  - `type ChainKey = 'base' | 'robinhoodTestnet' | 'robinhood'`
  - `getChainConfig(key?: ChainKey): ChainConfig` — defaults to `DEFAULT_CHAIN_KEY`
  - `DEFAULT_CHAIN_KEY: ChainKey`
  - `createChainPublicClient(key?: ChainKey): PublicClient`
  - `CHAINS: Record<ChainKey, ChainConfig>`

- [ ] **Step 1: Install and configure Vitest**

```bash
npm install --save-dev vitest
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

Add to `package.json` scripts (leave `"test": "hardhat test"` alone — it runs the Solidity suite):

```json
    "test:unit": "vitest run",
```

- [ ] **Step 2: Write the failing test**

Create `lib/chains/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CHAINS, getChainConfig, DEFAULT_CHAIN_KEY } from './index';

describe('chain registry', () => {
  it('defaults to Base', () => {
    expect(DEFAULT_CHAIN_KEY).toBe('base');
    expect(getChainConfig().viemChain.id).toBe(8453);
  });

  it('exposes the verified Robinhood chain ids', () => {
    expect(CHAINS.robinhood.viemChain.id).toBe(4663);
    expect(CHAINS.robinhoodTestnet.viemChain.id).toBe(46630);
  });

  it('uses ETH as the native gas token on every chain', () => {
    for (const cfg of Object.values(CHAINS)) {
      expect(cfg.viemChain.nativeCurrency.symbol).toBe('ETH');
      expect(cfg.viemChain.nativeCurrency.decimals).toBe(18);
    }
  });

  it('declares a 6-decimal stablecoin on every chain', () => {
    for (const cfg of Object.values(CHAINS)) {
      expect(cfg.stable.decimals).toBe(6);
    }
  });

  it('pins Base USDC to the canonical address', () => {
    expect(CHAINS.base.stable.address.toLowerCase())
      .toBe('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
  });

  it('pins Robinhood mainnet collateral to Paxos USDG, not an explorer lookalike', () => {
    expect(CHAINS.robinhood.stable.symbol).toBe('USDG');
    expect(CHAINS.robinhood.stable.address.toLowerCase())
      .toBe('0x5fc5360d0400a0fd4f2af552add042d716f1d168');
  });

  it('never returns an empty rpc url', () => {
    for (const cfg of Object.values(CHAINS)) {
      expect(cfg.rpcUrl).toMatch(/^https?:\/\//);
    }
  });

  it('throws on an unknown chain key', () => {
    // @ts-expect-error deliberately invalid key
    expect(() => getChainConfig('ethereum')).toThrow(/unknown chain/i);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 4: Write the types**

Create `lib/chains/types.ts`:

```ts
import type { Chain } from 'viem';

export type ChainKey = 'base' | 'robinhoodTestnet' | 'robinhood';

export interface StableToken {
  address: `0x${string}`;
  symbol: string;
  /** USDC and USDG are both 6-decimal; the payout math assumes it. */
  decimals: number;
}

export interface ChainContracts {
  /** PredictionMarketV2 — ETH + SWIPE pools. Absent on chains without $SWIPE. */
  v2?: `0x${string}`;
  /** PredictionMarket_USDC_DualPool — stablecoin pools. */
  dualPool?: `0x${string}`;
  swipeClaim?: `0x${string}`;
}

export interface ChainConfig {
  key: ChainKey;
  label: string;
  viemChain: Chain;
  rpcUrl: string;
  explorer: string;
  contracts: ChainContracts;
  stable: StableToken;
}
```

- [ ] **Step 5: Write the chain definitions**

Create `lib/chains/definitions.ts`:

```ts
import { defineChain } from 'viem';

/** Arbitrum Orbit (Nitro, ArbOS 61). Chain id verified live via eth_chainId. */
export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
});

export const robinhoodTestnetChain = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com'] } },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://explorer.testnet.chain.robinhood.com' },
  },
  testnet: true,
});
```

- [ ] **Step 6: Write the registry**

Create `lib/chains/index.ts`:

```ts
import { base } from 'viem/chains';
import { createPublicClient, http, type PublicClient } from 'viem';
import { robinhoodChain, robinhoodTestnetChain } from './definitions';
import type { ChainConfig, ChainKey } from './types';

export type { ChainConfig, ChainKey, StableToken, ChainContracts } from './types';
export { robinhoodChain, robinhoodTestnetChain } from './definitions';

const ZERO = '0x0000000000000000000000000000000000000000' as const;

export const CHAINS: Record<ChainKey, ChainConfig> = {
  base: {
    key: 'base',
    label: 'Base',
    viemChain: base,
    rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    contracts: {
      v2: (process.env.NEXT_PUBLIC_CONTRACT_V2_ADDRESS
        || '0x2bA339Df34B98099a9047d9442075F7B3a792f74') as `0x${string}`,
      dualPool: (process.env.NEXT_PUBLIC_USDC_DUALPOOL_CONTRACT
        || '0xf5Fa6206c2a7d5473ae7468082c9D260DFF83205') as `0x${string}`,
      swipeClaim: (process.env.NEXT_PUBLIC_SWIPE_CLAIM_CONTRACT || ZERO) as `0x${string}`,
    },
    stable: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
      decimals: 6,
    },
  },

  robinhoodTestnet: {
    key: 'robinhoodTestnet',
    label: 'Robinhood Testnet',
    viemChain: robinhoodTestnetChain,
    rpcUrl: process.env.ROBINHOOD_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com',
    explorer: 'https://explorer.testnet.chain.robinhood.com',
    contracts: {
      // No $SWIPE on Robinhood, so no v2 leg by design (spec section 2, non-goals).
      dualPool: (process.env.ROBINHOOD_TESTNET_DUALPOOL || ZERO) as `0x${string}`,
    },
    stable: {
      // Testnet has no USDG; Task 1 deploys MockUSDC as the stand-in.
      address: (process.env.ROBINHOOD_TESTNET_MOCK_USDC || ZERO) as `0x${string}`,
      symbol: 'mUSDC',
      decimals: 6,
    },
  },

  robinhood: {
    key: 'robinhood',
    label: 'Robinhood',
    viemChain: robinhoodChain,
    rpcUrl: process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com',
    explorer: 'https://robinhoodchain.blockscout.com',
    contracts: {
      dualPool: (process.env.ROBINHOOD_DUALPOOL_CONTRACT || ZERO) as `0x${string}`,
    },
    stable: {
      // Paxos USDG. Verified on-chain: symbol() == "USDG", decimals() == 6.
      // Explorer search for "USDC" on this chain returns 18-decimal impostors —
      // never substitute a looked-up address here.
      address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
      symbol: 'USDG',
      decimals: 6,
    },
  },
};

export const DEFAULT_CHAIN_KEY: ChainKey = 'base';

export function getChainConfig(key: ChainKey = DEFAULT_CHAIN_KEY): ChainConfig {
  const config = CHAINS[key];
  if (!config) throw new Error(`Unknown chain: ${key}`);
  return config;
}

/**
 * Single construction point for server-side read clients. Replaces the
 * createPublicClient({ chain: base, transport: http(... || 'https://mainnet.base.org') })
 * block duplicated across 18 API routes.
 */
export function createChainPublicClient(key: ChainKey = DEFAULT_CHAIN_KEY): PublicClient {
  const { viemChain, rpcUrl } = getChainConfig(key);
  return createPublicClient({ chain: viemChain, transport: http(rpcUrl) }) as PublicClient;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test:unit`
Expected: PASS, 8 tests.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add lib/chains vitest.config.ts package.json package-lock.json
git commit -m "feat: add chain configuration module with Robinhood Chain support"
```

---

## Task 3: Migrate server routes to the chain module

**Files:**
- Modify (18 API routes): `app/api/predictions/auto-sync/route.ts`, `app/api/blockchain/events/route.ts`, `app/api/blockchain/prediction/[id]/route.ts`, `app/api/sync/v2/route.ts`, `app/api/sync/v2/incremental/route.ts`, `app/api/sync/v2/active/route.ts`, `app/api/sync/v2/active-stakes/route.ts`, `app/api/sync/v2/claims/route.ts`, `app/api/sync/v2/recent/route.ts`, `app/api/sync/v2/resolved/route.ts`, `app/api/sync/prediction/[id]/route.ts`, `app/api/sync/usdc/route.ts`, `app/api/swipe-claim/claim-history/route.ts`, `app/api/predictions/[id]/stakes/route.ts`, `app/api/debug/leaderboard-data/route.ts`, `app/api/debug/blockchain-prediction/route.ts`, `app/api/admin/rescan-v2-leaderboard/route.ts`, `app/api/admin/sync-user-blockchain/route.ts`
- Modify (3 routes using the other RPC var names): `app/api/daily-claims/verify/route.ts:79`, `app/api/referrals/verify/route.ts:92`, `app/api/daily-tasks/verify/route.ts:495`

**Interfaces:**
- Consumes: `createChainPublicClient` and `getChainConfig` from `@/lib/chains` (Task 2).
- Produces: no new exports. After this task no file under `app/api/` imports from `viem/chains`.

- [ ] **Step 1: Migrate one route and confirm the shape works**

In `app/api/sync/usdc/route.ts`, replace lines 2-3:

```ts
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
```

with:

```ts
import { createChainPublicClient } from '@/lib/chains';
```

Then replace the client construction (search the file for `createPublicClient({`) with:

```ts
const publicClient = createChainPublicClient();
```

Remove any now-unused `http` / `createPublicClient` imports. Leave every other line untouched.

- [ ] **Step 2: Typecheck the single-file change**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Apply the identical change to the remaining 17 routes**

Repeat Step 1 for each of the other 17 files in the **Files** list. The pattern is
identical in all of them. Two cautions:

- Some routes construct the client at module scope, others inside the handler. Keep
  it where it already is; only swap the construction expression.
- `app/api/sync/v2/incremental/route.ts` also references `CONTRACTS.V2` from
  `lib/contract.ts`. Do **not** touch that in this task — contract-address
  centralisation is Task 5.

- [ ] **Step 4: Migrate the three ethers-based routes**

These use `ethers.JsonRpcProvider` and three different env var names, which is the
env-drift described in the spec. In each, replace the provider URL expression:

`app/api/daily-claims/verify/route.ts:79` and `app/api/referrals/verify/route.ts:92`:
```ts
const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org');
```
becomes:
```ts
const provider = new ethers.JsonRpcProvider(getChainConfig().rpcUrl);
```

`app/api/daily-tasks/verify/route.ts:495`:
```ts
transport: http(process.env.ALCHEMY_RPC_URL || 'https://mainnet.base.org'),
```
becomes:
```ts
transport: http(getChainConfig().rpcUrl),
```

Add `import { getChainConfig } from '@/lib/chains';` to each of the three files.

This is a behaviour change and an intended one: these three routes currently fall
through to the public `mainnet.base.org` endpoint while the rest of the app uses the
configured RPC, which is why daily-task verification is slow and rate-limited.

- [ ] **Step 5: Verify no server route imports the chain directly**

Run: `grep -rn "from 'viem/chains'" app/ ; echo "exit=$?"`
Expected: no matches, `exit=1`.

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add app/api
git commit -m "refactor: route all server RPC construction through chain config"
```

---

## Task 4: Migrate client entry points

**Files:**
- Modify: `wagmi.ts:2,25,39`
- Modify: `app/providers.tsx:4,18`
- Modify: `app/components/Modals/CreatePredictionModal.tsx:6` and its four `chainId: base.id` call sites (lines ~183, ~487, ~505, ~538)

**Interfaces:**
- Consumes: `getChainConfig`, `DEFAULT_CHAIN_KEY` from `@/lib/chains` (Task 2).
- Produces: no new exports.

- [ ] **Step 1: Migrate `wagmi.ts`**

Replace line 2 `import { base } from 'wagmi/chains';` with:

```ts
import { getChainConfig } from '@/lib/chains';
```

Then inside `getConfig()`, before `return createConfig({`:

```ts
  const activeChain = getChainConfig();
```

Replace `chains: [base],` with:

```ts
    chains: [activeChain.viemChain],
```

and replace the transports block with:

```ts
    transports: {
      [activeChain.viemChain.id]: http(activeChain.rpcUrl),
    },
```

Note this also removes the non-null assertion on `NEXT_PUBLIC_BASE_RPC_URL!` — the
config supplies a fallback, so an unset env var no longer yields `http(undefined)`.

- [ ] **Step 2: Migrate `app/providers.tsx`**

Replace the `base` import on line 4 with `import { getChainConfig } from '@/lib/chains';`
and change the provider prop on line 18 from `chain={base}` to:

```tsx
    <MiniKitProvider chain={getChainConfig().viemChain}>
```

- [ ] **Step 3: Migrate `CreatePredictionModal.tsx`**

Replace the `base` import on line 6 with `import { getChainConfig } from '@/lib/chains';`,
add near the top of the component body:

```ts
  const activeChainId = getChainConfig().viemChain.id;
```

then replace each of the four `chainId: base.id,` occurrences with:

```ts
        chainId: activeChainId,
```

- [ ] **Step 4: Verify no direct chain imports remain outside `lib/chains/`**

```bash
grep -rn "from 'viem/chains'\|from 'wagmi/chains'" app/ lib/ wagmi.ts | grep -v '^lib/chains/'
echo "exit=$?"
```
Expected: no matches. (Run from Git Bash; the Task 5 guard test covers the same
invariant automatically and is the authoritative check.)

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both exit 0.

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`, open `http://localhost:3000`, connect a wallet.
Expected: wallet connects on Base (chain id 8453), the market list renders, and the
browser console shows no RPC errors. This is the check that the wagmi transport
rewiring did not break connection handling — no automated test covers it.

- [ ] **Step 7: Commit**

```bash
git add wagmi.ts app/providers.tsx app/components/Modals/CreatePredictionModal.tsx
git commit -m "refactor: route client chain wiring through chain config"
```

---

## Task 5: Centralise contract addresses and lock in the guard

`lib/contract.ts` still holds hardcoded addresses with fallbacks under env var names
that differ from those in `.env.local` (`NEXT_PUBLIC_V2_CONTRACT_ADDRESS` in code vs
`NEXT_PUBLIC_CONTRACT_V2_ADDRESS` in env). The fallbacks happen to equal the real
values, so the drift is currently invisible — and would silently point at Base
addresses once a second chain exists.

**Files:**
- Modify: `lib/contract.ts:4,7,1333,1362,1423`
- Create: `lib/chains/no-direct-imports.test.ts`

**Interfaces:**
- Consumes: `getChainConfig` from `@/lib/chains` (Task 2).
- Produces: `V1_CONTRACT_ADDRESS`, `V2_CONTRACT_ADDRESS`, `SWIPE_CLAIM_CONTRACT_ADDRESS`,
  `USDC_DUALPOOL_CONTRACT_ADDRESS` keep their existing names and string types, so no
  consumer changes.

- [ ] **Step 1: Write the guard test**

Create `lib/chains/no-direct-imports.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const ALLOWED = path.join('lib', 'chains');
const SCAN_DIRS = ['app', 'lib'];
const EXTS = new Set(['.ts', '.tsx']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.has(path.extname(full))) out.push(full);
  }
  return out;
}

describe('chain abstraction is not bypassed', () => {
  it('no module outside lib/chains imports a chain directly', () => {
    const files = SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d)))
      .concat(path.join(ROOT, 'wagmi.ts'));

    const offenders = files.filter(file => {
      const rel = path.relative(ROOT, file);
      if (rel.startsWith(ALLOWED)) return false;
      const src = readFileSync(file, 'utf8');
      return /from ['"](viem|wagmi)\/chains['"]/.test(src);
    }).map(f => path.relative(ROOT, f));

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it passes**

Run: `npm run test:unit`
Expected: PASS. Tasks 3 and 4 already removed every offender; this test prevents the
refactor from silently regressing.

- [ ] **Step 3: Point `lib/contract.ts` at the chain config**

Replace lines 4 and 7:

```ts
export const V1_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_V1_CONTRACT_ADDRESS || '0xdc21A340835C41a14Eb1C856Ce902464D04774E3';
export const V2_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_V2_CONTRACT_ADDRESS || '0x2bA339Df34B98099a9047d9442075F7B3a792f74';
```

with:

```ts
import { getChainConfig } from './chains';

// V1 is Base-only legacy and is not part of the chain registry.
export const V1_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0xdc21A340835C41a14Eb1C856Ce902464D04774E3';
export const V2_CONTRACT_ADDRESS = getChainConfig().contracts.v2 ?? '';
```

Note the V1 env var name is corrected to `NEXT_PUBLIC_CONTRACT_ADDRESS`, which is the
name actually present in `.env.local`.

- [ ] **Step 4: Point the remaining three addresses at the chain config**

Line 1362:
```ts
export const SWIPE_CLAIM_CONTRACT_ADDRESS = getChainConfig().contracts.swipeClaim ?? '';
```

Lines 1333 and 1423 (both currently hardcode the DualPool address):
```ts
export const USDC_DUALPOOL_CONTRACT_ADDRESS = getChainConfig().contracts.dualPool ?? '';
```
and in the `CONTRACTS` object at line 1333, use `USDC_DUALPOOL_CONTRACT_ADDRESS`.

- [ ] **Step 5: Typecheck, unit test, contract test, build**

Run: `npx tsc --noEmit && npm run test:unit && npm test && npm run build`
Expected: all four exit 0; `npm test` reports 33 passing, 13 pending.

- [ ] **Step 6: Commit**

```bash
git add lib/contract.ts lib/chains/no-direct-imports.test.ts
git commit -m "refactor: source contract addresses from chain config, add regression guard"
```

---

## Done when

- `npm run test:unit` passes, including the guard test.
- `npm test` reports 33 passing, 13 pending.
- `npx tsc --noEmit` and `npm run build` both exit 0.
- `MockUSDC` and `PredictionMarket_USDC_DualPool` are live on Robinhood testnet
  (chain 46630), with `usdc()`, `owner()` and `getFeeConfig()` readable.
- No file outside `lib/chains/` imports from `viem/chains` or `wagmi/chains`.
- The app still runs against Base with no behaviour change, other than the three
  daily-task/referral routes now using the configured RPC instead of the public one.

## Not in this phase

- UI chain switcher — needs the Redis namespacing of Phase 5 first, otherwise two
  chains would write to the same keys.
- API authentication — Phase 2.
- Robinhood **mainnet** deploy — Phase 6, gated on this task and Phase 5.

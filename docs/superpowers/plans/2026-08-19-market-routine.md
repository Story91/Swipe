# Weekly market routine implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate weekly creation and proof-backed resolution of crypto price markets on Base and Robinhood Chain.

**Architecture:** A pure-logic module `lib/marketRoutine/` with injected dependencies (the `AllocatorStore` pattern from `lib/marketAllocator.ts`), two cron API routes that wire real dependencies, a one-time resolver-role script, and an admin card that runs the same code with `dryRun`. Every market is created carrying a machine-readable `resolutionSpec`; resolution executes that spec and stores a `resolutionProof` before updating Redis.

**Tech Stack:** Next.js App Router, viem ^2.27.2 (server-side signing with `REGISTRAR_PRIVATE_KEY`), Upstash Redis, Vitest, Hardhat only for the one-time grant script.

**Spec:** `docs/superpowers/specs/2026-08-19-market-routine-design.md`

## Global constraints

- Verification gate before claiming done: `npx tsc --noEmit`, `npx vitest run`, `npm run build` all pass, outputs quoted. `npx hardhat test` only if any `.sol` changed (none should).
- Commits authored by Story91 only. Plain `git commit`, never a `Co-Authored-By` trailer, never `-c user.email`.
- No em or en dashes in any user-visible copy (admin card text included). Headings capitalise the first word only.
- Base V4 market `0x4129d706c283e6bAC749CFe9221AD322981917E6`, Robinhood V4 market `0x41a6Fd3d35C0F9DD13773A763358E35B5216eEe4`. Never write to any other address; all writes resolve the address through `getWritableMarket` and check `isWritableMarket`.
- The signer for routine writes is `REGISTRAR_PRIVATE_KEY` (address `0x75724e9bF95B08359DA046EFA6d49557b675C080`). The owner key (`PRIVATE_KEY`) is used only by `scripts/grant_resolver.js`.
- Vitest picks up `lib/**/*.test.ts` and `app/**/*.test.ts`, node environment, `@` aliases the repo root.
- Existing exports this plan consumes (do not re-implement): `allocateMarketId(store, predictionKey)` and `MARKET_ID_COUNTER` from `lib/marketAllocator.ts`; `parseMarketId`, `marketNumber`, `CURRENT_GENERATION` from `lib/marketId.ts`; `redis`, `REDIS_KEYS`, `chainNamespace`, `redisHelpers`, `invalidatePredictionsCache` from `lib/redis.ts`; `getChainConfig`, `createChainPublicClient`, `getWritableMarket`, `isWritableMarket`, `ChainKey` from `lib/chains`; `USDG_DUALPOOL_ABI` from `lib/contract.ts`; `requireAdmin` from `lib/auth/requireAdmin.ts`; `useAdminRequest` from `lib/auth/useAdminRequest.ts`; `useActiveChain` from `lib/chains/activeChain.ts`.
- V4 `getPrediction(uint256)` returns, in order: `registered:bool, creator:address, deadline:uint256, yesPool:uint256, noPool:uint256, resolved:bool, cancelled:bool, outcome:bool, refundable:bool, participantCount:uint256`. `registerPrediction(predictionId:uint256, creator:address, deadline:uint256)`. `resolvePrediction(predictionId:uint256, outcome:bool)`. `setResolver(resolver:address, enabled:bool)`.

---

### Task 1: types and the pending-set key

**Files:**
- Modify: `lib/types/redis.ts` (append to `RedisPrediction`, add two interfaces)
- Modify: `lib/redis.ts` (one entry in `REDIS_KEYS`)
- Test: `lib/redisKeys.test.ts` (append one describe block)

**Interfaces:**
- Consumes: `chainNamespace` already in `lib/redis.ts`.
- Produces: `ResolutionSpec`, `ResolutionProof` exported from `lib/types/redis.ts`; optional `RedisPrediction` fields `createdByRoutine`, `resolutionSpec`, `resolutionProof`, `resolveFailures`; `REDIS_KEYS.ROUTINE_PENDING(chain?)`.

- [ ] **Step 1: Write the failing test**

Append to `lib/redisKeys.test.ts` (match the file's existing import style):

```ts
describe('ROUTINE_PENDING', () => {
  it('is unprefixed on Base and prefixed on Robinhood', () => {
    expect(REDIS_KEYS.ROUTINE_PENDING()).toBe('routine:pending');
    expect(REDIS_KEYS.ROUTINE_PENDING('base')).toBe('routine:pending');
    expect(REDIS_KEYS.ROUTINE_PENDING('robinhood')).toBe('robinhood:routine:pending');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/redisKeys.test.ts`
Expected: FAIL, `ROUTINE_PENDING` is not a function.

- [ ] **Step 3: Implement**

In `lib/redis.ts`, inside `REDIS_KEYS` directly after the `PREDICTIONS_INDEX` entry:

```ts
  /**
   * Markets the weekly routine created and has not yet resolved. The resolver
   * reads this set instead of scanning predictions:active, which still holds
   * hundreds of stale V2 ids.
   */
  ROUTINE_PENDING: (chain?: ChainKey) => `${chainNamespace(chain)}routine:pending`,
```

In `lib/types/redis.ts`, above `RedisPrediction`:

```ts
/** How a routine-created market is settled: read this pool, compare to this
 *  threshold. Written at creation so resolution never guesses. */
export interface ResolutionSpec {
  source: 'geckoterminal' | 'dexscreener';
  /** The source's network id, 'base' or 'robinhood'. */
  network: string;
  poolAddress: string;
  comparator: 'above';
  /** USD. Strictly above wins YES; equality resolves NO. */
  threshold: number;
  template: 'price_at_close';
}

/** What the resolver actually observed before it sent the transaction.
 *  source 'chain' marks a backfill: the transaction landed in an earlier run
 *  that died before writing Redis, so the outcome was read back on-chain. */
export interface ResolutionProof {
  source: 'geckoterminal' | 'dexscreener' | 'chain';
  sourceUrl: string | null;
  observedPrice: number | null;
  threshold: number;
  comparator: 'above';
  outcome: boolean;
  fetchedAt: number;
  deadline: number;
  resolvedTx: string | null;
  raw?: unknown;
  note?: string;
}
```

Inside `RedisPrediction`, after the `contractVersion` field:

```ts
  // Weekly routine bookkeeping. Absent on every hand-made market.
  createdByRoutine?: boolean;
  resolutionSpec?: ResolutionSpec;
  resolutionProof?: ResolutionProof;
  /** Consecutive failed price fetches; 24 flags the market in the admin card. */
  resolveFailures?: number;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/redisKeys.test.ts` then `npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/types/redis.ts lib/redis.ts lib/redisKeys.test.ts
git commit -m "feat(routine): resolution spec and proof types, pending-set key"
```

---

### Task 2: planning helpers, thresholds and the weekend grid

**Files:**
- Create: `lib/marketRoutine/planning.ts`
- Test: `lib/marketRoutine/planning.test.ts`

**Interfaces:**
- Produces: `roundTwoSignificant(value: number): number`, `pickThreshold(priceUsd: number, change24hPct: number, index: number): number`, `weekendDeadlines(nowUnix: number): number[]`, `formatThreshold(value: number): string`, `buildQuestion(symbol: string, threshold: number): string`.

- [ ] **Step 1: Write the failing tests**

`lib/marketRoutine/planning.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  roundTwoSignificant,
  pickThreshold,
  weekendDeadlines,
  formatThreshold,
  buildQuestion,
} from './planning';

describe('roundTwoSignificant', () => {
  it('keeps two significant digits at any magnitude', () => {
    expect(roundTwoSignificant(64728)).toBe(65000);
    expect(roundTwoSignificant(0.4712)).toBe(0.47);
    expect(roundTwoSignificant(0.0001234)).toBe(0.00012);
  });
});

describe('pickThreshold', () => {
  it('clamps the distance to 3 percent when the token barely moved', () => {
    // 0.5% clamps to 3%, target 103. Two significant digits would collapse
    // that to 100, the price itself, so the fallback keeps a third digit.
    expect(pickThreshold(100, 0.5, 0)).toBe(103);
  });
  it('clamps the distance to 10 percent for wild tokens', () => {
    expect(pickThreshold(100, 25, 0)).toBe(110);
  });
  it('alternates direction by index', () => {
    // 105 rounds up to 110 at two significant digits, still above the price.
    expect(pickThreshold(100, 5, 0)).toBe(110);
    expect(pickThreshold(100, 5, 1)).toBe(95);
  });
  it('uses the absolute change for the distance', () => {
    expect(pickThreshold(100, -8, 0)).toBe(110);
  });
  it('never lands on the wrong side of the price', () => {
    // Target 98.94 rounds to 99, still below 102, so two digits suffice here.
    expect(pickThreshold(102, 3, 1)).toBe(99);
  });
});

describe('weekendDeadlines', () => {
  it('builds the grid for the Friday after a Wednesday run', () => {
    // Wednesday 2026-08-19 12:07 UTC. Grid values were computed by hand for
    // the 2026-08-21 weekend and cross-checked against live markets created
    // this week.
    const wednesday = Date.UTC(2026, 7, 19, 12, 7, 0) / 1000;
    expect(weekendDeadlines(wednesday)).toEqual([
      1787342400, // Fri 21 Aug 20:00
      1787428800, // Sat 22 Aug 20:00
      1787443140, // Sat 22 Aug 23:59
      1787508000, // Sun 23 Aug 18:00
      1787529540, // Sun 23 Aug 23:59
    ]);
  });
  it('skips to next week when Friday 20:00 is less than 24h away', () => {
    const fridayNoon = Date.UTC(2026, 7, 21, 12, 0, 0) / 1000;
    const grid = weekendDeadlines(fridayNoon);
    expect(grid[0]).toBe(Date.UTC(2026, 7, 28, 20, 0, 0) / 1000);
    expect(grid).toHaveLength(5);
  });
});

describe('formatThreshold', () => {
  it('renders every magnitude without scientific notation', () => {
    expect(formatThreshold(64000)).toBe('64,000');
    expect(formatThreshold(92)).toBe('92');
    expect(formatThreshold(6.6)).toBe('6.6');
    expect(formatThreshold(0.49)).toBe('0.49');
    expect(formatThreshold(0.00012)).toBe('0.00012');
    expect(formatThreshold(0.00000024)).toBe('0.00000024');
  });
  it('never rounds a three-digit threshold away', () => {
    expect(formatThreshold(0.484)).toBe('0.484');
    expect(formatThreshold(103)).toBe('103');
  });
});

describe('buildQuestion', () => {
  it('uses the single provable template', () => {
    expect(buildQuestion('AERO', 0.49)).toBe(
      'Will AERO be above $0.49 when this market closes?'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/marketRoutine/planning.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`lib/marketRoutine/planning.ts`:

```ts
/**
 * Pure planning arithmetic for the weekly routine: which threshold a market
 * gets, when it closes, and how the question reads. No IO, so every rule here
 * is unit tested directly.
 */

const DAY = 86_400;

export function roundTwoSignificant(value: number): number {
  return Number(value.toPrecision(2));
}

/**
 * Threshold distance scales with the token's own 24h movement, clamped to a
 * 3% to 10% band. Direction alternates by batch index so the weekend's set is
 * not one-sided: even indexes need a rise for YES, odd indexes only need the
 * price to hold.
 *
 * Rounded to two significant digits, except when that rounding lands the
 * threshold on the price or across it (103 rounds to 100 for a $100 token,
 * erasing the whole distance); then a third digit is kept.
 */
export function pickThreshold(
  priceUsd: number,
  change24hPct: number,
  index: number
): number {
  const distance = Math.min(10, Math.max(3, Math.abs(change24hPct)));
  const above = index % 2 === 0;
  const target = priceUsd * (above ? 1 + distance / 100 : 1 - distance / 100);
  const two = roundTwoSignificant(target);
  const stillOnItsSide = above ? two > priceUsd : two < priceUsd;
  return stillOnItsSide ? two : Number(target.toPrecision(3));
}

/**
 * The fixed weekend grid, all UTC: Friday 20:00, Saturday 20:00, Saturday
 * 23:59, Sunday 18:00, Sunday 23:59. Anchored to the first Friday whose 20:00
 * is at least 24 hours after `nowUnix`, so a batch never opens a market that
 * closes within a day.
 */
export function weekendDeadlines(nowUnix: number): number[] {
  for (let t = nowUnix; ; t += DAY) {
    const d = new Date(t * 1000);
    if (d.getUTCDay() !== 5) continue;
    const dayStart =
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
    const friday2000 = dayStart + 20 * 3600;
    if (friday2000 < nowUnix + DAY) continue;
    return [
      friday2000,
      dayStart + DAY + 20 * 3600,
      dayStart + DAY + 23 * 3600 + 59 * 60,
      dayStart + 2 * DAY + 18 * 3600,
      dayStart + 2 * DAY + 23 * 3600 + 59 * 60,
    ];
  }
}

/**
 * The threshold exactly as chosen, formatted for a question: thousands get
 * separators, tiny prices never flip into exponent form. This must not round
 * again; the question and the resolutionSpec have to show the same number.
 */
export function formatThreshold(value: number): string {
  if (value >= 1000) return Math.round(value).toLocaleString('en-US');
  const s = String(value);
  if (!s.includes('e')) return s;
  // String() falls back to exponent form below 1e-6; rebuild fixed form.
  return value.toFixed(12).replace(/0+$/, '');
}

export function buildQuestion(symbol: string, threshold: number): string {
  return `Will ${symbol} be above $${formatThreshold(threshold)} when this market closes?`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/marketRoutine/planning.test.ts`
Expected: PASS, all 10 assertions.

- [ ] **Step 5: Commit**

```bash
git add lib/marketRoutine/planning.ts lib/marketRoutine/planning.test.ts
git commit -m "feat(routine): thresholds, weekend grid and question template"
```

---

### Task 3: token selection

**Files:**
- Create: `lib/marketRoutine/tokenSelection.ts`
- Test: `lib/marketRoutine/tokenSelection.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `JsonFetch = (url: string) => Promise<unknown>`; `SelectedToken { symbol; poolAddress; network: 'base' | 'robinhood'; source: 'geckoterminal' | 'dexscreener'; priceUsd; change24hPct; chartUrl }`; `PoolCandidate { symbol; poolAddress; priceUsd; liquidityUsd; volume24hUsd; change24hPct }`; `STABLE_WRAPPED_DENYLIST: string[]`; `ROBINHOOD_CANDIDATES: string[]`; `filterAndRank(candidates, max?): PoolCandidate[]`; `selectBaseTokens(fetchJson, max?): Promise<SelectedToken[]>`; `selectRobinhoodTokens(fetchJson, candidates?, max?): Promise<SelectedToken[]>`.

- [ ] **Step 1: Write the failing tests**

`lib/marketRoutine/tokenSelection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  filterAndRank,
  selectBaseTokens,
  selectRobinhoodTokens,
  type PoolCandidate,
  type JsonFetch,
} from './tokenSelection';

function candidate(over: Partial<PoolCandidate>): PoolCandidate {
  return {
    symbol: 'AERO',
    poolAddress: '0xpool',
    priceUsd: 0.47,
    liquidityUsd: 1_000_000,
    volume24hUsd: 500_000,
    change24hPct: 4,
    ...over,
  };
}

describe('filterAndRank', () => {
  it('drops denylisted symbols case-insensitively', () => {
    expect(filterAndRank([candidate({ symbol: 'usdc' })])).toEqual([]);
    expect(filterAndRank([candidate({ symbol: 'WETH' })])).toEqual([]);
  });
  it('drops anything priced within 2 percent of one dollar', () => {
    expect(filterAndRank([candidate({ symbol: 'FAKESTABLE', priceUsd: 1.015 })])).toEqual([]);
    expect(filterAndRank([candidate({ symbol: 'VIRTUAL', priceUsd: 1.08 })])).toHaveLength(1);
  });
  it('enforces the liquidity and volume floors', () => {
    expect(filterAndRank([candidate({ liquidityUsd: 49_000 })])).toEqual([]);
    expect(filterAndRank([candidate({ volume24hUsd: 9_000 })])).toEqual([]);
  });
  it('keeps one pool per symbol, the deepest', () => {
    const shallow = candidate({ poolAddress: '0xa', liquidityUsd: 60_000 });
    const deep = candidate({ poolAddress: '0xb', liquidityUsd: 900_000 });
    const out = filterAndRank([shallow, deep]);
    expect(out).toHaveLength(1);
    expect(out[0].poolAddress).toBe('0xb');
  });
  it('ranks by 24h volume and cuts at max', () => {
    const pools = ['A', 'B', 'C'].map((s, i) =>
      candidate({ symbol: s, poolAddress: `0x${s}`, volume24hUsd: (i + 1) * 100_000 })
    );
    const out = filterAndRank(pools, 2);
    expect(out.map((p) => p.symbol)).toEqual(['C', 'B']);
  });
});

describe('selectBaseTokens', () => {
  it('parses trending pools and builds GeckoTerminal chart urls', async () => {
    const fetchJson: JsonFetch = async () => ({
      data: [
        {
          attributes: {
            name: 'AERO / USDC 0.3%',
            address: '0xaeropool',
            base_token_price_usd: '0.47',
            reserve_in_usd: '900000',
            volume_usd: { h24: '400000' },
            price_change_percentage: { h24: '-4.2' },
          },
        },
        {
          attributes: {
            name: 'USDC / WETH',
            address: '0xstablepool',
            base_token_price_usd: '0.9999',
            reserve_in_usd: '5000000',
            volume_usd: { h24: '9000000' },
            price_change_percentage: { h24: '0.01' },
          },
        },
      ],
    });
    const out = await selectBaseTokens(fetchJson);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      symbol: 'AERO',
      network: 'base',
      source: 'geckoterminal',
      poolAddress: '0xaeropool',
      priceUsd: 0.47,
      change24hPct: -4.2,
    });
    expect(out[0].chartUrl).toBe(
      'https://www.geckoterminal.com/base/pools/0xaeropool?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=ffffff'
    );
  });
});

describe('selectRobinhoodTokens', () => {
  it('takes the deepest robinhood pair per candidate and ranks by volume', async () => {
    const fetchJson: JsonFetch = async (url) => {
      if (url.includes('q=CASHCAT')) {
        return {
          pairs: [
            {
              chainId: 'robinhood',
              pairAddress: '0xdeep',
              priceUsd: '0.09',
              baseToken: { symbol: 'CASHCAT' },
              liquidity: { usd: 1_400_000 },
              volume: { h24: 7_000_000 },
              priceChange: { h24: 12 },
            },
            {
              chainId: 'robinhood',
              pairAddress: '0xshallow',
              priceUsd: '0.09',
              baseToken: { symbol: 'CASHCAT' },
              liquidity: { usd: 60_000 },
              volume: { h24: 100_000 },
              priceChange: { h24: 12 },
            },
            {
              chainId: 'solana',
              pairAddress: 'notours',
              priceUsd: '0.09',
              baseToken: { symbol: 'CASHCAT' },
              liquidity: { usd: 9_000_000 },
              volume: { h24: 1 },
            },
          ],
        };
      }
      return { pairs: [] };
    };
    const out = await selectRobinhoodTokens(fetchJson, ['CASHCAT', 'BRODIE']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      symbol: 'CASHCAT',
      network: 'robinhood',
      source: 'dexscreener',
      poolAddress: '0xdeep',
    });
    expect(out[0].chartUrl).toBe(
      'https://dexscreener.com/robinhood/0xdeep?embed=1&theme=dark&trades=0&info=0'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/marketRoutine/tokenSelection.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`lib/marketRoutine/tokenSelection.ts`:

```ts
/**
 * Which tokens get a market this week.
 *
 * Base asks GeckoTerminal's trending list. Robinhood Chain is not indexed by
 * GeckoTerminal, and DexScreener has no public per-chain ranking, so its side
 * ranks a curated candidate list by live volume instead. Both funnel through
 * one filter: no stables, no wrapped majors, real liquidity, real volume.
 *
 * The selected pool is deliberately the same pool the card's chart embeds and
 * the same pool the resolver reads: what people watch is what settles.
 */

export type JsonFetch = (url: string) => Promise<unknown>;

export interface SelectedToken {
  symbol: string;
  poolAddress: string;
  network: 'base' | 'robinhood';
  source: 'geckoterminal' | 'dexscreener';
  priceUsd: number;
  change24hPct: number;
  chartUrl: string;
}

export interface PoolCandidate {
  symbol: string;
  poolAddress: string;
  priceUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  change24hPct: number;
}

/** Symbols that are money or a wrapper around money, not a market. */
export const STABLE_WRAPPED_DENYLIST = [
  'USDC', 'USDBC', 'USDT', 'USDS', 'SUSDS', 'USDE', 'USDG', 'DAI', 'FRAX',
  'GHO', 'SYRUPUSDC', 'WETH', 'ETH', 'WBTC', 'CBBTC', 'CBETH', 'WEETH',
  'WSTETH', 'RETH', 'AWETH', 'CLBTC',
];

const MIN_LIQUIDITY_USD = 50_000;
const MIN_VOLUME_24H_USD = 10_000;

/**
 * Robinhood Chain natives worth considering, ranked live each week. Adding a
 * token is a one-line edit here. Replace this list with trending once
 * GeckoTerminal indexes the chain.
 */
export const ROBINHOOD_CANDIDATES = [
  'CASHCAT', 'BRODIE', 'HOODRAT', 'ARROW', 'DIH', 'DOGINHOOD', 'STONK',
  'PIGGY',
];

export function filterAndRank(
  candidates: PoolCandidate[],
  max = 5
): PoolCandidate[] {
  const deny = new Set(STABLE_WRAPPED_DENYLIST);
  const kept = candidates.filter(
    (c) =>
      !deny.has(c.symbol.toUpperCase()) &&
      Number.isFinite(c.priceUsd) &&
      c.priceUsd > 0 &&
      Math.abs(c.priceUsd - 1) > 0.02 &&
      c.liquidityUsd > MIN_LIQUIDITY_USD &&
      c.volume24hUsd > MIN_VOLUME_24H_USD
  );

  const bySymbol = new Map<string, PoolCandidate>();
  for (const c of kept) {
    const key = c.symbol.toUpperCase();
    const prev = bySymbol.get(key);
    if (!prev || c.liquidityUsd > prev.liquidityUsd) bySymbol.set(key, c);
  }

  return [...bySymbol.values()]
    .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
    .slice(0, max);
}

interface GtPool {
  attributes?: {
    name?: string;
    address?: string;
    base_token_price_usd?: string;
    reserve_in_usd?: string;
    volume_usd?: { h24?: string };
    price_change_percentage?: { h24?: string };
  };
}

export async function selectBaseTokens(
  fetchJson: JsonFetch,
  max = 5
): Promise<SelectedToken[]> {
  const json = (await fetchJson(
    'https://api.geckoterminal.com/api/v2/networks/base/trending_pools'
  )) as { data?: GtPool[] };

  const candidates: PoolCandidate[] = (json.data ?? []).flatMap((p) => {
    const a = p.attributes ?? {};
    const symbol = (a.name ?? '').split('/')[0].trim();
    const priceUsd = Number(a.base_token_price_usd);
    if (!symbol || !a.address || !Number.isFinite(priceUsd)) return [];
    return [
      {
        symbol,
        poolAddress: a.address,
        priceUsd,
        liquidityUsd: Number(a.reserve_in_usd ?? 0),
        volume24hUsd: Number(a.volume_usd?.h24 ?? 0),
        change24hPct: Number(a.price_change_percentage?.h24 ?? 0),
      },
    ];
  });

  return filterAndRank(candidates, max).map((c) => ({
    symbol: c.symbol,
    poolAddress: c.poolAddress,
    network: 'base' as const,
    source: 'geckoterminal' as const,
    priceUsd: c.priceUsd,
    change24hPct: c.change24hPct,
    chartUrl:
      `https://www.geckoterminal.com/base/pools/${c.poolAddress}` +
      '?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=ffffff',
  }));
}

interface DsPair {
  chainId?: string;
  pairAddress?: string;
  priceUsd?: string;
  baseToken?: { symbol?: string };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
}

export async function selectRobinhoodTokens(
  fetchJson: JsonFetch,
  candidates: string[] = ROBINHOOD_CANDIDATES,
  max = 5
): Promise<SelectedToken[]> {
  const pools: PoolCandidate[] = [];

  for (const symbol of candidates) {
    const json = (await fetchJson(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`
    )) as { pairs?: DsPair[] };

    const best = (json.pairs ?? [])
      .filter(
        (p) =>
          p.chainId === 'robinhood' &&
          p.pairAddress &&
          (p.baseToken?.symbol ?? '').toUpperCase() === symbol.toUpperCase() &&
          Number.isFinite(Number(p.priceUsd))
      )
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];

    if (!best) continue;
    pools.push({
      symbol: symbol.toUpperCase(),
      poolAddress: best.pairAddress as string,
      priceUsd: Number(best.priceUsd),
      liquidityUsd: best.liquidity?.usd ?? 0,
      volume24hUsd: best.volume?.h24 ?? 0,
      change24hPct: best.priceChange?.h24 ?? 0,
    });
  }

  return filterAndRank(pools, max).map((c) => ({
    symbol: c.symbol,
    poolAddress: c.poolAddress,
    network: 'robinhood' as const,
    source: 'dexscreener' as const,
    priceUsd: c.priceUsd,
    change24hPct: c.change24hPct,
    chartUrl: `https://dexscreener.com/robinhood/${c.poolAddress}?embed=1&theme=dark&trades=0&info=0`,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/marketRoutine/tokenSelection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/marketRoutine/tokenSelection.ts lib/marketRoutine/tokenSelection.test.ts
git commit -m "feat(routine): weekly token selection with liquidity and volume floors"
```

---

### Task 4: price observation and outcome evaluation

**Files:**
- Create: `lib/marketRoutine/priceProof.ts`
- Test: `lib/marketRoutine/priceProof.test.ts`

**Interfaces:**
- Consumes: `ResolutionSpec` from `@/lib/types/redis`; `JsonFetch` from `./tokenSelection`.
- Produces: `PriceObservation { price: number; sourceUrl: string; fetchedAt: number; raw: unknown }`; `proofUrl(spec): string`; `fetchObservation(spec, fetchJson, nowUnix): Promise<PriceObservation>`; `evaluateOutcome(spec, observation): boolean`.

- [ ] **Step 1: Write the failing tests**

`lib/marketRoutine/priceProof.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { proofUrl, fetchObservation, evaluateOutcome } from './priceProof';
import type { ResolutionSpec } from '@/lib/types/redis';

const geckoSpec: ResolutionSpec = {
  source: 'geckoterminal',
  network: 'base',
  poolAddress: '0xaeropool',
  comparator: 'above',
  threshold: 0.49,
  template: 'price_at_close',
};

const dexSpec: ResolutionSpec = {
  ...geckoSpec,
  source: 'dexscreener',
  network: 'robinhood',
  poolAddress: '0xcashcatpair',
  threshold: 0.085,
};

describe('proofUrl', () => {
  it('targets the exact pool each source knows', () => {
    expect(proofUrl(geckoSpec)).toBe(
      'https://api.geckoterminal.com/api/v2/networks/base/pools/0xaeropool'
    );
    expect(proofUrl(dexSpec)).toBe(
      'https://api.dexscreener.com/latest/dex/pairs/robinhood/0xcashcatpair'
    );
  });
});

describe('fetchObservation', () => {
  it('reads a GeckoTerminal pool price', async () => {
    const obs = await fetchObservation(
      geckoSpec,
      async () => ({ data: { attributes: { base_token_price_usd: '0.5123' } } }),
      1787342521
    );
    expect(obs.price).toBe(0.5123);
    expect(obs.fetchedAt).toBe(1787342521);
    expect(obs.sourceUrl).toBe(proofUrl(geckoSpec));
  });
  it('reads a DexScreener pair price from either response shape', async () => {
    const fromPairs = await fetchObservation(
      dexSpec,
      async () => ({ pairs: [{ priceUsd: '0.091', liquidity: { usd: 1 }, volume: { h24: 2 } }] }),
      1
    );
    expect(fromPairs.price).toBe(0.091);
    const fromPair = await fetchObservation(
      dexSpec,
      async () => ({ pair: { priceUsd: '0.0902' } }),
      1
    );
    expect(fromPair.price).toBe(0.0902);
  });
  it('throws rather than returning a price it cannot read', async () => {
    await expect(
      fetchObservation(geckoSpec, async () => ({ data: {} }), 1)
    ).rejects.toThrow(/No usable price/);
  });
});

describe('evaluateOutcome', () => {
  it('is strictly above: equality resolves NO', () => {
    const obs = { price: 0.49, sourceUrl: '', fetchedAt: 1, raw: null };
    expect(evaluateOutcome(geckoSpec, obs)).toBe(false);
    expect(evaluateOutcome(geckoSpec, { ...obs, price: 0.4901 })).toBe(true);
    expect(evaluateOutcome(geckoSpec, { ...obs, price: 0.4899 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/marketRoutine/priceProof.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`lib/marketRoutine/priceProof.ts`:

```ts
/**
 * One observation from a market's declared source, and the comparison that
 * turns it into an outcome. The observation is kept whole because it becomes
 * the resolutionProof: anyone disputing a settlement replays sourceUrl and
 * sees what the resolver saw.
 */

import type { ResolutionSpec } from '@/lib/types/redis';
import type { JsonFetch } from './tokenSelection';

export interface PriceObservation {
  price: number;
  sourceUrl: string;
  fetchedAt: number;
  raw: unknown;
}

export function proofUrl(spec: ResolutionSpec): string {
  return spec.source === 'geckoterminal'
    ? `https://api.geckoterminal.com/api/v2/networks/${spec.network}/pools/${spec.poolAddress}`
    : `https://api.dexscreener.com/latest/dex/pairs/${spec.network}/${spec.poolAddress}`;
}

export async function fetchObservation(
  spec: ResolutionSpec,
  fetchJson: JsonFetch,
  nowUnix: number
): Promise<PriceObservation> {
  const sourceUrl = proofUrl(spec);
  const json = await fetchJson(sourceUrl);

  let price: number;
  let raw: unknown;

  if (spec.source === 'geckoterminal') {
    const attrs = (json as { data?: { attributes?: { base_token_price_usd?: string } } })
      .data?.attributes;
    price = Number(attrs?.base_token_price_usd);
    raw = { base_token_price_usd: attrs?.base_token_price_usd };
  } else {
    const body = json as { pairs?: unknown[]; pair?: unknown };
    const pair = ((body.pairs ?? (body.pair ? [body.pair] : []))[0] ?? null) as {
      priceUsd?: string;
      liquidity?: { usd?: number };
      volume?: { h24?: number };
    } | null;
    price = Number(pair?.priceUsd);
    raw = pair
      ? { priceUsd: pair.priceUsd, liquidityUsd: pair.liquidity?.usd, volumeH24: pair.volume?.h24 }
      : null;
  }

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`No usable price at ${sourceUrl}`);
  }
  return { price, sourceUrl, fetchedAt: nowUnix, raw };
}

/** Strictly above wins YES. Equality is not above, so it resolves NO. */
export function evaluateOutcome(
  spec: ResolutionSpec,
  observation: PriceObservation
): boolean {
  return observation.price > spec.threshold;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/marketRoutine/priceProof.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/marketRoutine/priceProof.ts lib/marketRoutine/priceProof.test.ts
git commit -m "feat(routine): price observation and strict-above outcome"
```

---

### Task 5: the chain writer

**Files:**
- Create: `lib/marketRoutine/chainWriter.ts`

**Interfaces:**
- Consumes: `getChainConfig`, `createChainPublicClient`, `getWritableMarket`, `isWritableMarket`, `ChainKey` from `@/lib/chains`; `USDG_DUALPOOL_ABI` from `@/lib/contract`.
- Produces: `OnChainPrediction { registered: boolean; creator: string; deadline: number; resolved: boolean; cancelled: boolean; outcome: boolean; refundable: boolean }`; `RoutineChainWriter { address: string; readPrediction(id: number): Promise<OnChainPrediction>; registerPrediction(id: number, creator: string, deadline: number): Promise<string>; resolvePrediction(id: number, outcome: boolean): Promise<string> }`; `makeChainWriter(chainKey: ChainKey): RoutineChainWriter`.

No unit test: this file is a thin viem wrapper whose behaviour is the chain's. It is exercised by the admin dry-run and gated by `npx tsc --noEmit`. Orchestrators never import it directly; they take a `RoutineChainWriter` as a dependency, which is what their tests fake.

- [ ] **Step 1: Implement**

`lib/marketRoutine/chainWriter.ts`:

```ts
/**
 * The only file in the routine that signs. Everything else takes this as an
 * injected dependency and is tested against a fake.
 *
 * The signer is REGISTRAR_PRIVATE_KEY, the dedicated operational key: it can
 * register and resolve and nothing else. The address it writes to always comes
 * from getWritableMarket and is re-checked with isWritableMarket, per the rule
 * in lib/chains: a write path must verify the address it is about to write to.
 */

import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  getChainConfig,
  createChainPublicClient,
  getWritableMarket,
  isWritableMarket,
  type ChainKey,
} from '@/lib/chains';
import { USDG_DUALPOOL_ABI } from '@/lib/contract';

export interface OnChainPrediction {
  registered: boolean;
  creator: string;
  deadline: number;
  resolved: boolean;
  cancelled: boolean;
  outcome: boolean;
  refundable: boolean;
}

export interface RoutineChainWriter {
  address: string;
  readPrediction(id: number): Promise<OnChainPrediction>;
  registerPrediction(id: number, creator: string, deadline: number): Promise<string>;
  resolvePrediction(id: number, outcome: boolean): Promise<string>;
}

export function makeChainWriter(chainKey: ChainKey): RoutineChainWriter {
  const key = process.env.REGISTRAR_PRIVATE_KEY;
  if (!key) throw new Error('REGISTRAR_PRIVATE_KEY is not set');

  const market = getWritableMarket(chainKey);
  if (!market || !isWritableMarket(chainKey, market)) {
    throw new Error(`No writable market on ${chainKey}`);
  }

  const config = getChainConfig(chainKey);
  const account = privateKeyToAccount(
    (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`
  );
  const publicClient = createChainPublicClient(chainKey);
  const walletClient = createWalletClient({
    account,
    chain: config.viemChain,
    transport: http(config.rpcUrl),
  });

  async function write(
    functionName: 'registerPrediction' | 'resolvePrediction',
    args: readonly unknown[]
  ): Promise<string> {
    const hash = await walletClient.writeContract({
      address: market as `0x${string}`,
      abi: USDG_DUALPOOL_ABI,
      functionName,
      args,
      chain: config.viemChain,
      account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error(`${functionName} reverted in ${hash}`);
    }
    return hash;
  }

  return {
    address: account.address.toLowerCase(),

    async readPrediction(id: number): Promise<OnChainPrediction> {
      const out = (await publicClient.readContract({
        address: market as `0x${string}`,
        abi: USDG_DUALPOOL_ABI,
        functionName: 'getPrediction',
        args: [BigInt(id)],
      })) as readonly [
        boolean, string, bigint, bigint, bigint, boolean, boolean, boolean, boolean, bigint
      ];
      return {
        registered: out[0],
        creator: (out[1] as string).toLowerCase(),
        deadline: Number(out[2]),
        resolved: out[5],
        cancelled: out[6],
        outcome: out[7],
        refundable: out[8],
      };
    },

    registerPrediction(id, creator, deadline) {
      return write('registerPrediction', [
        BigInt(id),
        creator as `0x${string}`,
        BigInt(deadline),
      ]);
    },

    resolvePrediction(id, outcome) {
      return write('resolvePrediction', [BigInt(id), outcome]);
    },
  };
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/marketRoutine/chainWriter.ts
git commit -m "feat(routine): viem chain writer on the registrar key"
```

---

### Task 6: the weekly create orchestrator

**Files:**
- Create: `lib/marketRoutine/createWeeklyMarkets.ts`
- Test: `lib/marketRoutine/createWeeklyMarkets.test.ts`

**Interfaces:**
- Consumes: `SelectedToken` from `./tokenSelection`; `pickThreshold`, `weekendDeadlines`, `buildQuestion` from `./planning`; `RoutineChainWriter` from `./chainWriter`; `RedisPrediction` from `@/lib/types/redis`; `canonicalMarketId`, `CURRENT_GENERATION` from `@/lib/marketId`; `ChainKey` from `@/lib/chains`.
- Produces:

```ts
export interface CreateDeps {
  selectTokens(chainKey: ChainKey): Promise<SelectedToken[]>;
  allocateId(chainKey: ChainKey): Promise<number>;
  writer(chainKey: ChainKey): RoutineChainWriter;
  savePrediction(record: RedisPrediction, chain: ChainKey): Promise<void>;
  addPending(chain: ChainKey, id: string): Promise<void>;
  countOpenMarkets(chain: ChainKey): Promise<number>;
  invalidateListing(chain: ChainKey): void;
  now(): number;
}
export interface PlannedMarket {
  symbol: string; question: string; threshold: number; deadline: number;
  chartUrl: string; poolAddress: string;
}
export interface CreateResult {
  chain: ChainKey; dryRun: boolean; planned: PlannedMarket[];
  created: string[]; trimmed: number;
}
export async function createWeeklyMarkets(
  deps: CreateDeps,
  opts: { chainKey: ChainKey; dryRun: boolean }
): Promise<CreateResult>
```

- [ ] **Step 1: Write the failing tests**

`lib/marketRoutine/createWeeklyMarkets.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createWeeklyMarkets, type CreateDeps } from './createWeeklyMarkets';
import type { SelectedToken } from './tokenSelection';
import type { RedisPrediction } from '@/lib/types/redis';

// Wednesday 2026-08-19 12:07 UTC, same fixture as planning.test.ts.
const NOW = Date.UTC(2026, 7, 19, 12, 7, 0) / 1000;

function token(symbol: string, priceUsd: number): SelectedToken {
  return {
    symbol,
    poolAddress: `0xpool${symbol}`,
    network: 'base',
    source: 'geckoterminal',
    priceUsd,
    change24hPct: 5,
    chartUrl: `https://chart/${symbol}`,
  };
}

function makeDeps(over: Partial<CreateDeps> = {}) {
  const saved: RedisPrediction[] = [];
  const pending: string[] = [];
  let nextId = 100;
  const deps: CreateDeps = {
    selectTokens: async () => [token('AAA', 10), token('BBB', 20), token('CCC', 30)],
    allocateId: async () => nextId++,
    writer: () => ({
      address: '0xregistrar',
      readPrediction: vi.fn(),
      registerPrediction: vi.fn(async () => '0xtxhash'),
      resolvePrediction: vi.fn(),
    }),
    savePrediction: async (r) => { saved.push(r); },
    addPending: async (_c, id) => { pending.push(id); },
    countOpenMarkets: async () => 0,
    invalidateListing: () => {},
    now: () => NOW,
    ...over,
  };
  return { deps, saved, pending };
}

describe('createWeeklyMarkets', () => {
  it('dry run plans but allocates nothing and writes nothing', async () => {
    const { deps, saved, pending } = makeDeps();
    const allocate = vi.fn();
    deps.allocateId = allocate as unknown as CreateDeps['allocateId'];
    const result = await createWeeklyMarkets(deps, { chainKey: 'base', dryRun: true });
    expect(result.planned).toHaveLength(3);
    expect(result.created).toEqual([]);
    expect(allocate).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
    expect(pending).toEqual([]);
  });

  it('pairs tokens with the weekend grid in order', async () => {
    const { deps } = makeDeps();
    const result = await createWeeklyMarkets(deps, { chainKey: 'base', dryRun: true });
    expect(result.planned.map((p) => p.deadline)).toEqual([
      1787342400, 1787428800, 1787443140,
    ]);
    // Index 0 threshold sits above the price, index 1 below.
    expect(result.planned[0].threshold).toBeGreaterThan(10);
    expect(result.planned[1].threshold).toBeLessThan(20);
  });

  it('creates records that carry their own resolution recipe', async () => {
    const { deps, saved, pending } = makeDeps();
    const result = await createWeeklyMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.created).toEqual(['pred_v4_100', 'pred_v4_101', 'pred_v4_102']);
    expect(pending).toEqual(result.created);
    const rec = saved[0];
    expect(rec).toMatchObject({
      id: 'pred_v4_100',
      category: 'Crypto',
      includeChart: true,
      selectedCrypto: 'AAA',
      imageUrl: 'https://chart/AAA',
      creator: '0xregistrar',
      needsApproval: false,
      contractVersion: 'V4',
      createdByRoutine: true,
    });
    expect(rec.resolutionSpec).toMatchObject({
      source: 'geckoterminal',
      network: 'base',
      poolAddress: '0xpoolAAA',
      comparator: 'above',
      template: 'price_at_close',
    });
    expect(rec.question).toContain('Will AAA be above $');
  });

  it('trims the batch to the 12-open cap', async () => {
    const { deps } = makeDeps({ countOpenMarkets: async () => 10 });
    const result = await createWeeklyMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.created).toHaveLength(2);
    expect(result.trimmed).toBe(1);
  });

  it('registers on chain before writing Redis', async () => {
    const order: string[] = [];
    const { deps } = makeDeps({
      writer: () => ({
        address: '0xregistrar',
        readPrediction: vi.fn(),
        registerPrediction: async () => { order.push('chain'); return '0xtx'; },
        resolvePrediction: vi.fn(),
      }),
      savePrediction: async () => { order.push('redis'); },
    });
    await createWeeklyMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(order.slice(0, 2)).toEqual(['chain', 'redis']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/marketRoutine/createWeeklyMarkets.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`lib/marketRoutine/createWeeklyMarkets.ts`:

```ts
/**
 * One weekly batch for one chain: pick tokens, give each a threshold and a
 * weekend deadline, register on chain, publish to Redis.
 *
 * Order per market is allocate, chain, Redis, the same reasoning as
 * scripts/create_market.js: a failed chain call burns a number and publishes
 * nothing, where the other order leaves a registered market the app cannot
 * see.
 */

import type { ChainKey } from '@/lib/chains';
import type { RedisPrediction } from '@/lib/types/redis';
import { canonicalMarketId, CURRENT_GENERATION } from '@/lib/marketId';
import { buildQuestion, pickThreshold, weekendDeadlines } from './planning';
import type { SelectedToken } from './tokenSelection';
import type { RoutineChainWriter } from './chainWriter';

/** rules-v3.md 5.2. Counted per chain, batch is trimmed to fit. */
const MAX_OPEN_MARKETS = 12;

export interface CreateDeps {
  selectTokens(chainKey: ChainKey): Promise<SelectedToken[]>;
  allocateId(chainKey: ChainKey): Promise<number>;
  writer(chainKey: ChainKey): RoutineChainWriter;
  savePrediction(record: RedisPrediction, chain: ChainKey): Promise<void>;
  addPending(chain: ChainKey, id: string): Promise<void>;
  countOpenMarkets(chain: ChainKey): Promise<number>;
  invalidateListing(chain: ChainKey): void;
  now(): number;
}

export interface PlannedMarket {
  symbol: string;
  question: string;
  threshold: number;
  deadline: number;
  chartUrl: string;
  poolAddress: string;
}

export interface CreateResult {
  chain: ChainKey;
  dryRun: boolean;
  planned: PlannedMarket[];
  created: string[];
  trimmed: number;
}

export async function createWeeklyMarkets(
  deps: CreateDeps,
  opts: { chainKey: ChainKey; dryRun: boolean }
): Promise<CreateResult> {
  const { chainKey, dryRun } = opts;
  const now = deps.now();

  const tokens = await deps.selectTokens(chainKey);
  const deadlines = weekendDeadlines(now);

  const open = await deps.countOpenMarkets(chainKey);
  const allowed = Math.max(0, MAX_OPEN_MARKETS - open);
  const batch = tokens.slice(0, Math.min(tokens.length, deadlines.length, allowed));
  const trimmed = Math.min(tokens.length, deadlines.length) - batch.length;

  const planned: PlannedMarket[] = batch.map((token, i) => {
    const threshold = pickThreshold(token.priceUsd, token.change24hPct, i);
    return {
      symbol: token.symbol,
      question: buildQuestion(token.symbol, threshold),
      threshold,
      deadline: deadlines[i],
      chartUrl: token.chartUrl,
      poolAddress: token.poolAddress,
    };
  });

  const result: CreateResult = { chain: chainKey, dryRun, planned, created: [], trimmed };
  if (dryRun) return result;

  const writer = deps.writer(chainKey);

  for (let i = 0; i < planned.length; i++) {
    const plan = planned[i];
    const token = batch[i];

    const numericId = await deps.allocateId(chainKey);
    const id = canonicalMarketId(CURRENT_GENERATION, numericId);

    await writer.registerPrediction(numericId, writer.address, plan.deadline);

    const endsAt = new Date(plan.deadline * 1000);
    const record: RedisPrediction = {
      id,
      question: plan.question,
      description: '',
      category: 'Crypto',
      imageUrl: plan.chartUrl,
      includeChart: true,
      selectedCrypto: plan.symbol,
      endDate: endsAt.toISOString().slice(0, 10),
      endTime: endsAt.toISOString().slice(11, 16),
      deadline: plan.deadline,
      yesTotalAmount: 0,
      noTotalAmount: 0,
      swipeYesTotalAmount: 0,
      swipeNoTotalAmount: 0,
      usdcPoolEnabled: true,
      usdcYesTotalAmount: 0,
      usdcNoTotalAmount: 0,
      resolved: false,
      cancelled: false,
      createdAt: deps.now(),
      creator: writer.address,
      verified: true,
      approved: true,
      needsApproval: false,
      participants: [],
      totalStakes: 0,
      contractVersion: 'V4',
      createdByRoutine: true,
      resolutionSpec: {
        source: token.source,
        network: token.network,
        poolAddress: token.poolAddress,
        comparator: 'above',
        threshold: plan.threshold,
        template: 'price_at_close',
      },
    };

    await deps.savePrediction(record, chainKey);
    await deps.addPending(chainKey, id);
    result.created.push(id);
  }

  if (result.created.length > 0) deps.invalidateListing(chainKey);
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/marketRoutine/createWeeklyMarkets.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/marketRoutine/createWeeklyMarkets.ts lib/marketRoutine/createWeeklyMarkets.test.ts
git commit -m "feat(routine): weekly create orchestrator, recipe written at birth"
```

---

### Task 7: the resolve orchestrator

**Files:**
- Create: `lib/marketRoutine/resolveExpiredMarkets.ts`
- Test: `lib/marketRoutine/resolveExpiredMarkets.test.ts`

**Interfaces:**
- Consumes: `RoutineChainWriter`, `OnChainPrediction` from `./chainWriter`; `PriceObservation`, `evaluateOutcome` from `./priceProof`; `marketNumber` from `@/lib/marketId`; `RedisPrediction`, `ResolutionSpec` from `@/lib/types/redis`.
- Produces:

```ts
export interface ResolveDeps {
  listPending(chain: ChainKey): Promise<string[]>;
  getRecord(id: string, chain: ChainKey): Promise<RedisPrediction | null>;
  saveRecord(record: RedisPrediction, chain: ChainKey): Promise<void>;
  removePending(chain: ChainKey, id: string): Promise<void>;
  writer(chainKey: ChainKey): RoutineChainWriter;
  fetchObservation(spec: ResolutionSpec, nowUnix: number): Promise<PriceObservation>;
  invalidateListing(chain: ChainKey): void;
  now(): number;
}
export interface ResolvedEntry {
  id: string; outcome: boolean; observedPrice: number; threshold: number; tx: string | null;
}
export interface ResolveResult {
  chain: ChainKey; dryRun: boolean; resolved: ResolvedEntry[];
  backfilled: string[]; fetchFailed: string[]; flagged: string[]; notDue: string[];
}
export const FLAG_AFTER_FAILURES = 24;
export async function resolveExpiredMarkets(
  deps: ResolveDeps,
  opts: { chainKey: ChainKey; dryRun: boolean }
): Promise<ResolveResult>
```

- [ ] **Step 1: Write the failing tests**

`lib/marketRoutine/resolveExpiredMarkets.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  resolveExpiredMarkets,
  FLAG_AFTER_FAILURES,
  type ResolveDeps,
} from './resolveExpiredMarkets';
import type { RedisPrediction } from '@/lib/types/redis';

const NOW = 1787346000; // an hour past the Friday 20:00 deadline

function routineRecord(over: Partial<RedisPrediction> = {}): RedisPrediction {
  return {
    id: 'pred_v4_100',
    question: 'Will AAA be above $11 when this market closes?',
    description: '',
    category: 'Crypto',
    imageUrl: 'https://chart/AAA',
    includeChart: true,
    selectedCrypto: 'AAA',
    endDate: '2026-08-21',
    endTime: '20:00',
    deadline: 1787342400,
    yesTotalAmount: 0,
    noTotalAmount: 0,
    swipeYesTotalAmount: 0,
    swipeNoTotalAmount: 0,
    resolved: false,
    cancelled: false,
    createdAt: NOW - 300000,
    creator: '0xregistrar',
    verified: true,
    approved: true,
    needsApproval: false,
    participants: [],
    totalStakes: 0,
    contractVersion: 'V4',
    createdByRoutine: true,
    resolutionSpec: {
      source: 'geckoterminal',
      network: 'base',
      poolAddress: '0xpoolAAA',
      comparator: 'above',
      threshold: 11,
      template: 'price_at_close',
    },
    ...over,
  };
}

function makeDeps(record: RedisPrediction, over: Partial<ResolveDeps> = {}) {
  const saves: RedisPrediction[] = [];
  const removed: string[] = [];
  const resolveTx = vi.fn(async () => '0xresolvetx');
  const deps: ResolveDeps = {
    listPending: async () => [record.id],
    getRecord: async () => record,
    saveRecord: async (r) => { saves.push(structuredClone(r)); },
    removePending: async (_c, id) => { removed.push(id); },
    writer: () => ({
      address: '0xregistrar',
      readPrediction: async () => ({
        registered: true, creator: '0xregistrar', deadline: record.deadline,
        resolved: false, cancelled: false, outcome: false, refundable: false,
      }),
      registerPrediction: vi.fn(),
      resolvePrediction: resolveTx,
    }),
    fetchObservation: async (spec) => ({
      price: 12.5, sourceUrl: `https://proof/${spec.poolAddress}`, fetchedAt: NOW, raw: {},
    }),
    invalidateListing: () => {},
    now: () => NOW,
    ...over,
  };
  return { deps, saves, removed, resolveTx };
}

describe('resolveExpiredMarkets', () => {
  it('resolves an expired market and stores the proof before the mirror flip', async () => {
    const record = routineRecord();
    const { deps, saves, removed, resolveTx } = makeDeps(record);
    const result = await resolveExpiredMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.resolved).toEqual([
      { id: 'pred_v4_100', outcome: true, observedPrice: 12.5, threshold: 11, tx: '0xresolvetx' },
    ]);
    expect(resolveTx).toHaveBeenCalledWith(100, true);
    const saved = saves[0];
    expect(saved.resolved).toBe(true);
    expect(saved.outcome).toBe(true);
    expect(saved.resolutionProof).toMatchObject({
      source: 'geckoterminal',
      observedPrice: 12.5,
      threshold: 11,
      outcome: true,
      resolvedTx: '0xresolvetx',
      deadline: 1787342400,
    });
    expect(removed).toEqual(['pred_v4_100']);
  });

  it('dry run reports outcomes without sending or saving', async () => {
    const record = routineRecord();
    const { deps, saves, resolveTx } = makeDeps(record);
    const result = await resolveExpiredMarkets(deps, { chainKey: 'base', dryRun: true });
    expect(result.resolved[0]).toMatchObject({ id: 'pred_v4_100', outcome: true, tx: null });
    expect(resolveTx).not.toHaveBeenCalled();
    expect(saves).toEqual([]);
  });

  it('backfills when the chain already resolved, never sends twice', async () => {
    const record = routineRecord();
    const { deps, saves, removed, resolveTx } = makeDeps(record, {
      writer: () => ({
        address: '0xregistrar',
        readPrediction: async () => ({
          registered: true, creator: '0xregistrar', deadline: record.deadline,
          resolved: true, cancelled: false, outcome: false, refundable: false,
        }),
        registerPrediction: vi.fn(),
        resolvePrediction: resolveTxNeverCalled,
      }),
    });
    function resolveTxNeverCalled(): never { throw new Error('must not send'); }
    const result = await resolveExpiredMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.backfilled).toEqual(['pred_v4_100']);
    expect(resolveTx).not.toHaveBeenCalled();
    expect(saves[0].resolved).toBe(true);
    expect(saves[0].outcome).toBe(false);
    expect(saves[0].resolutionProof?.source).toBe('chain');
    expect(removed).toEqual(['pred_v4_100']);
  });

  it('a failed fetch leaves the market pending and counts the failure', async () => {
    const record = routineRecord();
    const { deps, saves, removed } = makeDeps(record, {
      fetchObservation: async () => { throw new Error('api down'); },
    });
    const result = await resolveExpiredMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.fetchFailed).toEqual(['pred_v4_100']);
    expect(result.flagged).toEqual([]);
    expect(saves[0].resolveFailures).toBe(1);
    expect(saves[0].resolved).toBe(false);
    expect(removed).toEqual([]);
  });

  it('flags after 24 consecutive failures', async () => {
    const record = routineRecord({ resolveFailures: FLAG_AFTER_FAILURES - 1 });
    const { deps } = makeDeps(record, {
      fetchObservation: async () => { throw new Error('api down'); },
    });
    const result = await resolveExpiredMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.flagged).toEqual(['pred_v4_100']);
  });

  it('skips markets whose deadline has not passed', async () => {
    const record = routineRecord({ deadline: NOW + 3600 });
    const { deps, saves } = makeDeps(record);
    const result = await resolveExpiredMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.notDue).toEqual(['pred_v4_100']);
    expect(result.resolved).toEqual([]);
    expect(saves).toEqual([]);
  });

  it('drops already-settled records from the pending set', async () => {
    const record = routineRecord({ resolved: true, outcome: true });
    const { deps, removed } = makeDeps(record);
    const result = await resolveExpiredMarkets(deps, { chainKey: 'base', dryRun: false });
    expect(result.resolved).toEqual([]);
    expect(removed).toEqual(['pred_v4_100']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/marketRoutine/resolveExpiredMarkets.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`lib/marketRoutine/resolveExpiredMarkets.ts`:

```ts
/**
 * Settle every routine market whose deadline has passed, one observation per
 * market, proof written before the mirror flips.
 *
 * The chain is checked before anything is sent. A market that reads resolved
 * on chain but pending in Redis is a previous run that died between the
 * transaction and the Redis write, so the mirror is backfilled and nothing is
 * sent again. That ordering is the whole idempotency story: the chain is the
 * source of truth, Redis only ever catches up to it.
 */

import type { ChainKey } from '@/lib/chains';
import type { RedisPrediction, ResolutionSpec } from '@/lib/types/redis';
import { marketNumber } from '@/lib/marketId';
import { evaluateOutcome, type PriceObservation } from './priceProof';
import type { RoutineChainWriter } from './chainWriter';

/** Hourly runs, so 24 failures is a day of the source being unreadable. */
export const FLAG_AFTER_FAILURES = 24;

export interface ResolveDeps {
  listPending(chain: ChainKey): Promise<string[]>;
  getRecord(id: string, chain: ChainKey): Promise<RedisPrediction | null>;
  saveRecord(record: RedisPrediction, chain: ChainKey): Promise<void>;
  removePending(chain: ChainKey, id: string): Promise<void>;
  writer(chainKey: ChainKey): RoutineChainWriter;
  fetchObservation(spec: ResolutionSpec, nowUnix: number): Promise<PriceObservation>;
  invalidateListing(chain: ChainKey): void;
  now(): number;
}

export interface ResolvedEntry {
  id: string;
  outcome: boolean;
  observedPrice: number;
  threshold: number;
  tx: string | null;
}

export interface ResolveResult {
  chain: ChainKey;
  dryRun: boolean;
  resolved: ResolvedEntry[];
  backfilled: string[];
  fetchFailed: string[];
  flagged: string[];
  notDue: string[];
}

export async function resolveExpiredMarkets(
  deps: ResolveDeps,
  opts: { chainKey: ChainKey; dryRun: boolean }
): Promise<ResolveResult> {
  const { chainKey, dryRun } = opts;
  const now = deps.now();
  const result: ResolveResult = {
    chain: chainKey,
    dryRun,
    resolved: [],
    backfilled: [],
    fetchFailed: [],
    flagged: [],
    notDue: [],
  };

  const pending = await deps.listPending(chainKey);
  if (pending.length === 0) return result;

  const writer = deps.writer(chainKey);
  let changed = false;

  for (const id of pending) {
    const record = await deps.getRecord(id, chainKey);

    // A record that is gone or already settled has no business in the set.
    if (!record || record.resolved || record.cancelled) {
      if (!dryRun) await deps.removePending(chainKey, id);
      continue;
    }
    if (record.deadline > now) {
      result.notDue.push(id);
      continue;
    }
    const spec = record.resolutionSpec;
    const numericId = marketNumber(id);
    if (!spec || numericId === null) {
      // Not this routine's market to settle; flag it for a human.
      result.flagged.push(id);
      continue;
    }

    const onChain = await writer.readPrediction(numericId);

    if (onChain.resolved) {
      if (!dryRun) {
        record.resolved = true;
        record.outcome = onChain.outcome;
        record.resolutionProof = {
          source: 'chain',
          sourceUrl: null,
          observedPrice: null,
          threshold: spec.threshold,
          comparator: 'above',
          outcome: onChain.outcome,
          fetchedAt: now,
          deadline: record.deadline,
          resolvedTx: null,
          note:
            'Backfilled from on-chain state. The resolution transaction landed ' +
            'in an earlier run that failed before writing Redis.',
        };
        await deps.saveRecord(record, chainKey);
        await deps.removePending(chainKey, id);
        changed = true;
      }
      result.backfilled.push(id);
      continue;
    }
    if (onChain.cancelled) {
      if (!dryRun) {
        record.cancelled = true;
        await deps.saveRecord(record, chainKey);
        await deps.removePending(chainKey, id);
        changed = true;
      }
      continue;
    }

    let observation: PriceObservation;
    try {
      observation = await deps.fetchObservation(spec, now);
    } catch {
      const failures = (record.resolveFailures ?? 0) + 1;
      if (!dryRun) {
        record.resolveFailures = failures;
        await deps.saveRecord(record, chainKey);
      }
      result.fetchFailed.push(id);
      if (failures >= FLAG_AFTER_FAILURES) result.flagged.push(id);
      continue;
    }

    const outcome = evaluateOutcome(spec, observation);

    if (dryRun) {
      result.resolved.push({
        id,
        outcome,
        observedPrice: observation.price,
        threshold: spec.threshold,
        tx: null,
      });
      continue;
    }

    const tx = await writer.resolvePrediction(numericId, outcome);

    record.resolved = true;
    record.outcome = outcome;
    record.resolveFailures = 0;
    record.resolutionProof = {
      source: spec.source,
      sourceUrl: observation.sourceUrl,
      observedPrice: observation.price,
      threshold: spec.threshold,
      comparator: 'above',
      outcome,
      fetchedAt: observation.fetchedAt,
      deadline: record.deadline,
      resolvedTx: tx,
      raw: observation.raw,
    };
    await deps.saveRecord(record, chainKey);
    await deps.removePending(chainKey, id);
    changed = true;

    result.resolved.push({
      id,
      outcome,
      observedPrice: observation.price,
      threshold: spec.threshold,
      tx,
    });
  }

  if (changed) deps.invalidateListing(chainKey);
  return result;
}
```

Note for the implementer: the test `backfills when the chain already resolved` builds its own writer whose `resolvePrediction` throws; the shared `resolveTx` spy is asserted not called. Keep the test exactly as written; it compiles because the throwing function is declared in scope before use (function hoisting).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/marketRoutine/resolveExpiredMarkets.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/marketRoutine/resolveExpiredMarkets.ts lib/marketRoutine/resolveExpiredMarkets.test.ts
git commit -m "feat(routine): resolve orchestrator, chain-first idempotency"
```

---

### Task 8: route auth, real dependencies and the two cron routes

**Files:**
- Create: `lib/marketRoutine/routeAuth.ts`
- Create: `lib/marketRoutine/serverDeps.ts`
- Create: `app/api/cron/create-weekly-markets/route.ts`
- Create: `app/api/cron/resolve-expired-markets/route.ts`
- Test: `lib/marketRoutine/routeAuth.test.ts`

**Interfaces:**
- Consumes: everything produced by Tasks 3, 4, 6, 7; `redis`, `REDIS_KEYS`, `redisHelpers`, `invalidatePredictionsCache` from `@/lib/redis`; `allocateMarketId` from `@/lib/marketAllocator`; `requireAdmin` from `@/lib/auth/requireAdmin`.
- Produces: `isCronAuthorized(header: string | null, secret: string | undefined): boolean`; `realCreateDeps(): CreateDeps`; `realResolveDeps(): ResolveDeps`; GET and POST handlers on both routes.

- [ ] **Step 1: Write the failing test**

`lib/marketRoutine/routeAuth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isCronAuthorized } from './routeAuth';

describe('isCronAuthorized', () => {
  it('accepts exactly the configured bearer secret', () => {
    expect(isCronAuthorized('Bearer s3cret', 's3cret')).toBe(true);
  });
  it('rejects wrong or absent headers', () => {
    expect(isCronAuthorized('Bearer wrong', 's3cret')).toBe(false);
    expect(isCronAuthorized(null, 's3cret')).toBe(false);
    expect(isCronAuthorized('s3cret', 's3cret')).toBe(false);
  });
  it('fails closed when the secret is not configured', () => {
    expect(isCronAuthorized('Bearer anything', undefined)).toBe(false);
    expect(isCronAuthorized('Bearer ', '')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/marketRoutine/routeAuth.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement routeAuth**

`lib/marketRoutine/routeAuth.ts`:

```ts
/**
 * Vercel Cron authenticates with `Authorization: Bearer CRON_SECRET`. An
 * unset secret means misconfiguration, and treating that as open is how a
 * guard quietly stops guarding, so it fails closed, same policy as
 * requireAdmin's empty allowlist.
 */
export function isCronAuthorized(
  authorizationHeader: string | null,
  secret: string | undefined
): boolean {
  if (!secret) return false;
  return authorizationHeader === `Bearer ${secret}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/marketRoutine/routeAuth.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the real dependency wiring**

`lib/marketRoutine/serverDeps.ts`:

```ts
/**
 * The production wiring: orchestrators get real Redis, real selection, and
 * the registrar-key chain writer. Everything above this file is pure and
 * tested; this file is deliberately nothing but glue.
 */

import { redis, REDIS_KEYS, redisHelpers, invalidatePredictionsCache } from '@/lib/redis';
import { allocateMarketId } from '@/lib/marketAllocator';
import type { ChainKey } from '@/lib/chains';
import type { RedisPrediction, ResolutionSpec } from '@/lib/types/redis';
import { makeChainWriter } from './chainWriter';
import { selectBaseTokens, selectRobinhoodTokens, type JsonFetch } from './tokenSelection';
import { fetchObservation } from './priceProof';
import type { CreateDeps } from './createWeeklyMarkets';
import type { ResolveDeps } from './resolveExpiredMarkets';

const fetchJson: JsonFetch = async (url) => {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
};

const nowUnix = () => Math.floor(Date.now() / 1000);

export function realCreateDeps(): CreateDeps {
  return {
    selectTokens: (chainKey) =>
      chainKey === 'robinhood'
        ? selectRobinhoodTokens(fetchJson)
        : selectBaseTokens(fetchJson),
    allocateId: (chainKey) =>
      allocateMarketId(redis, (id) => REDIS_KEYS.PREDICTION(id, chainKey)),
    writer: makeChainWriter,
    savePrediction: (record: RedisPrediction, chain: ChainKey) =>
      redisHelpers.savePrediction(record, chain),
    addPending: async (chain, id) => {
      await redis.sadd(REDIS_KEYS.ROUTINE_PENDING(chain), id);
    },
    countOpenMarkets: async (chain) =>
      (await redisHelpers.getActivePredictions(chain)).length,
    invalidateListing: invalidatePredictionsCache,
    now: nowUnix,
  };
}

export function realResolveDeps(): ResolveDeps {
  return {
    listPending: async (chain) =>
      (await redis.smembers(REDIS_KEYS.ROUTINE_PENDING(chain))) as string[],
    getRecord: (id, chain) => redisHelpers.getPrediction(id, chain),
    saveRecord: (record, chain) => redisHelpers.savePrediction(record, chain),
    removePending: async (chain, id) => {
      await redis.srem(REDIS_KEYS.ROUTINE_PENDING(chain), id);
    },
    writer: makeChainWriter,
    fetchObservation: (spec: ResolutionSpec, now: number) =>
      fetchObservation(spec, fetchJson, now),
    invalidateListing: invalidatePredictionsCache,
    now: nowUnix,
  };
}
```

- [ ] **Step 6: Implement the two routes**

`app/api/cron/create-weekly-markets/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { isCronAuthorized } from '@/lib/marketRoutine/routeAuth';
import { createWeeklyMarkets } from '@/lib/marketRoutine/createWeeklyMarkets';
import { realCreateDeps } from '@/lib/marketRoutine/serverDeps';
import type { ChainKey } from '@/lib/chains';

export const dynamic = 'force-dynamic';

const ROUTINE_CHAINS: ChainKey[] = ['base', 'robinhood'];

/** Vercel Cron calls GET with the bearer secret and creates on both chains. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const results = [];
    for (const chainKey of ROUTINE_CHAINS) {
      results.push(await createWeeklyMarkets(realCreateDeps(), { chainKey, dryRun: false }));
    }
    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('❌ create-weekly-markets cron failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/** The admin card calls POST, one chain at a time, dry run unless told live. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, 'routine');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const chainKey: ChainKey = body.chain === 'robinhood' ? 'robinhood' : 'base';
    const dryRun = body.dryRun !== false;
    const result = await createWeeklyMarkets(realCreateDeps(), { chainKey, dryRun });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('❌ create-weekly-markets manual run failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

`app/api/cron/resolve-expired-markets/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { isCronAuthorized } from '@/lib/marketRoutine/routeAuth';
import { resolveExpiredMarkets } from '@/lib/marketRoutine/resolveExpiredMarkets';
import { realResolveDeps } from '@/lib/marketRoutine/serverDeps';
import type { ChainKey } from '@/lib/chains';

export const dynamic = 'force-dynamic';

const ROUTINE_CHAINS: ChainKey[] = ['base', 'robinhood'];

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const results = [];
    for (const chainKey of ROUTINE_CHAINS) {
      results.push(await resolveExpiredMarkets(realResolveDeps(), { chainKey, dryRun: false }));
    }
    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('❌ resolve-expired-markets cron failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, 'routine');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const chainKey: ChainKey = body.chain === 'robinhood' ? 'robinhood' : 'base';
    const dryRun = body.dryRun !== false;
    const result = await resolveExpiredMarkets(realResolveDeps(), { chainKey, dryRun });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('❌ resolve-expired-markets manual run failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 7: Verify types and full unit suite**

Run: `npx tsc --noEmit` then `npx vitest run`
Expected: no type errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/marketRoutine/routeAuth.ts lib/marketRoutine/routeAuth.test.ts lib/marketRoutine/serverDeps.ts app/api/cron
git commit -m "feat(routine): cron routes behind CRON_SECRET, admin runs behind signatures"
```

---

### Task 9: cron config and the resolver grant script

**Files:**
- Create: `vercel.json` (the repo has none)
- Create: `scripts/grant_resolver.js`

**Interfaces:**
- Consumes: hardhat, `PredictionMarket_V4` artifact, env `PRIVATE_KEY` (owner) and `REGISTRAR_ADDRESS`.
- Produces: two Vercel cron entries; a one-time script run per network.

- [ ] **Step 1: Write vercel.json**

```json
{
  "crons": [
    { "path": "/api/cron/create-weekly-markets", "schedule": "7 12 * * 3" },
    { "path": "/api/cron/resolve-expired-markets", "schedule": "11 * * * *" }
  ]
}
```

Note: Vercel Cron invokes these with GET and, when the `CRON_SECRET` env var is set on the project, sends it as the bearer token. The Hobby plan restricts crons to daily; if the project turns out to be on Hobby, change the resolve schedule to `11 3 * * *` and rely on the admin card between runs.

- [ ] **Step 2: Write the grant script**

`scripts/grant_resolver.js`:

```js
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
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` (vercel.json and the script are outside its scope; this confirms nothing broke) and `node --check scripts/grant_resolver.js`
Expected: both clean.

Do not run the grant script in this task; it is part of the rollout (Task 11).

- [ ] **Step 4: Commit**

```bash
git add vercel.json scripts/grant_resolver.js
git commit -m "feat(routine): vercel crons and the one-time resolver grant"
```

---

### Task 10: the admin routine card

**Files:**
- Create: `app/components/Admin/RoutineCard.tsx`
- Modify: `app/components/Admin/AdminDashboard.tsx` (one import, one element)

**Interfaces:**
- Consumes: `useAdminRequest` from `@/lib/auth/useAdminRequest`; `useActiveChain` from `@/lib/chains/activeChain` (returns `{ chainKey, chain, ... }`); the POST bodies of both cron routes: `{ chain: 'base' | 'robinhood', dryRun: boolean }`, responses `{ success, result }` where result is `CreateResult` or `ResolveResult` from Tasks 6 and 7.
- Produces: `<RoutineCard />`, mounted in the admin desk.

- [ ] **Step 1: Implement the card**

`app/components/Admin/RoutineCard.tsx`:

```tsx
"use client";

import React, { useState } from 'react';
import { useAdminRequest } from '@/lib/auth/useAdminRequest';
import { useActiveChain } from '@/lib/chains/activeChain';

/**
 * Manual controls for the weekly routine, running the same code the crons
 * run. Preview is a dry run: it selects, prices and plans but signs nothing.
 * The live buttons send real transactions with the registrar key on the
 * server, so they sit behind the same signed-header check as every admin
 * write.
 */

type RoutineAction = 'create' | 'resolve';

interface RunState {
  action: RoutineAction;
  dryRun: boolean;
  body: unknown;
  error?: string;
}

const PATHS: Record<RoutineAction, string> = {
  create: '/api/cron/create-weekly-markets',
  resolve: '/api/cron/resolve-expired-markets',
};

export function RoutineCard() {
  const { chainKey, chain } = useActiveChain();
  const signAdminRequest = useAdminRequest();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<RunState | null>(null);

  async function run(action: RoutineAction, dryRun: boolean) {
    setBusy(true);
    try {
      const headers = await signAdminRequest('routine');
      const response = await fetch(PATHS[action], {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ chain: chainKey, dryRun }),
      });
      const body = await response.json();
      setLast({
        action,
        dryRun,
        body,
        error: response.ok ? undefined : (body?.error ?? `HTTP ${response.status}`),
      });
    } catch (error) {
      setLast({
        action,
        dryRun,
        body: null,
        error: error instanceof Error ? error.message : 'Request failed',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="adm-section">
      <h2 className="adm-section-title">Weekly routine</h2>
      <p className="adm-toolbar-note">
        Runs against {chain.label}. Preview plans without signing anything, the
        live buttons register and resolve with the operational key on the
        server.
      </p>
      <div className="adm-toolbar">
        <button type="button" className="sheet-action" disabled={busy} onClick={() => run('create', true)}>
          Preview batch
        </button>
        <button type="button" className="sheet-action" disabled={busy} onClick={() => run('create', false)}>
          Create batch
        </button>
        <button type="button" className="sheet-action" disabled={busy} onClick={() => run('resolve', true)}>
          Preview resolutions
        </button>
        <button type="button" className="sheet-action" disabled={busy} onClick={() => run('resolve', false)}>
          Resolve now
        </button>
      </div>
      {last && (
        <div className={`adm-notice${last.error ? ' adm-notice--bad' : ''}`} role="status">
          <p>
            {last.action === 'create' ? 'Create' : 'Resolve'}
            {last.dryRun ? ' preview' : ' live run'}
            {last.error ? ` failed: ${last.error}` : ' finished.'}
          </p>
          {last.body != null && (
            <pre style={{ overflowX: 'auto', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(last.body, null, 2)}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Mount it**

In `app/components/Admin/AdminDashboard.tsx`, add the import next to the other component imports:

```ts
import { RoutineCard } from './RoutineCard';
```

In the returned JSX, insert `<RoutineCard />` immediately after the closing `</header>` tag of the `sheet-hero` header (the element that ends after the `marketWrite.wrongNetwork` notice block). One line, no other changes to the file.

If the class names `adm-section` or `adm-section-title` do not exist in `AdminDashboard.css`, use the closest existing section classes in that stylesheet instead of inventing styles; the card must not ship its own CSS file.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` then `npm run build`
Expected: both pass. Quote the build output line that confirms the two new `/api/cron/*` routes were built.

- [ ] **Step 4: Commit**

```bash
git add app/components/Admin/RoutineCard.tsx app/components/Admin/AdminDashboard.tsx
git commit -m "feat(routine): admin card with dry-run previews and live triggers"
```

---

### Task 11: full verification and rollout

**Files:**
- Modify: `docs/v3/HANDOFF.md` (short status section)
- Modify: `.env.local` (add `CRON_SECRET=`, value set by the owner)

- [ ] **Step 1: Run the full gate**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: all pass. `npx hardhat test` is not required (no `.sol` changed) but run it if anything under `contracts/` or `artifacts/` was touched. Quote the printed totals of each command in the task report.

- [ ] **Step 2: Grant the resolver role (owner action, both networks)**

```bash
npx hardhat run scripts/grant_resolver.js --network base
npx hardhat run scripts/grant_resolver.js --network robinhood
```

Expected: each prints either "is now a resolver" with a transaction hash or "already a resolver". Quote both outputs.

- [ ] **Step 3: Set CRON_SECRET**

Add `CRON_SECRET=` to `.env.local` with a generated value (`openssl rand -hex 32`), and tell the owner to add the same variable in the Vercel project settings; Vercel Cron sends it automatically once set. Do not print the value in any report.

- [ ] **Step 4: First supervised run**

With the dev server or a deployment up, use the admin card: Preview batch on Base, eyeball the five planned markets, then Preview resolutions. Nothing goes live in this step. Report what the previews returned.

- [ ] **Step 5: Update the handoff**

Append a short section to `docs/v3/HANDOFF.md` stating: the routine exists, where it lives (`lib/marketRoutine/`, `app/api/cron/*`, `vercel.json`), that resolution writes a proof into the Redis record, and that the resolver role was granted to the operational key (with the two grant transaction hashes). Follow the repo's copy rules: no em or en dashes, first-word capitals, no banned words.

- [ ] **Step 6: Commit**

```bash
git add docs/v3/HANDOFF.md
git commit -m "docs(handoff): the weekly routine is wired, roles granted"
```

---

## Plan self-review notes

Spec coverage: recipe at creation (Task 6), proof before mirror (Task 7), single provable template (Task 2), trending plus curated selection with floors (Task 3), same pool for chart and settlement (Tasks 3 and 6), 12-cap trim (Task 6), chain-first idempotency and the 24-failure flag (Task 7), CRON_SECRET fail-closed (Task 8), crons (Task 9), resolver grant (Tasks 9 and 11), admin dry-runs (Task 10). Out of scope per spec: OHLCV templates, non-crypto categories, dispute pauses.

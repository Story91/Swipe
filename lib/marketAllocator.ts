import { canonicalMarketId } from './marketId';

/**
 * Handing out the next V3 market number.
 *
 * V2 allocated ids on chain: `createPrediction` was public and the contract's
 * own `nextPredictionId++` guaranteed uniqueness. V3 has neither. Registration
 * is `onlyResolver` and takes the id as a parameter, so the number has to be
 * allocated off chain, and whatever does it is now the thing standing between
 * two markets and a shared id.
 *
 * Two markets on one number is the worst failure available here. Both records
 * exist in Redis, the resolver registers one, and every bet placed from either
 * card goes to the same on-chain market. Bets meant for the second settle
 * against the first's positions and pay the first's winners.
 *
 * So: INCR, which is atomic in Redis, and never a scan for the highest existing
 * id. A scan is read-then-write, and two proposals in the same second both read
 * the same maximum and both write the same number. There is already a function
 * shaped exactly like that in the codebase
 * (findHighestV2PredictionId in app/api/sync/v2/incremental/route.ts) and it
 * must not become the allocator.
 *
 * The collision check after INCR is belt and braces. The counter alone is
 * correct once it is ahead of every existing id; the check catches the case
 * where it is not, which is any environment where records were written before
 * this counter existed.
 */

/** Minimal surface this needs, so it can be tested without a live Redis. */
export interface AllocatorStore {
  incr(key: string): Promise<number>;
  get(key: string): Promise<unknown>;
  set(key: string, value: string | number): Promise<unknown>;
}

export const V3_ID_COUNTER = 'market:v3:next_id';

/** How many taken numbers to step over before giving up. */
const MAX_PROBES = 50;

export class MarketIdUnavailableError extends Error {
  constructor(attempts: number) {
    super(
      `Could not allocate a free V3 market id after ${attempts} attempts. ` +
        `The counter at ${V3_ID_COUNTER} is behind the records that exist.`
    );
    this.name = 'MarketIdUnavailableError';
  }
}

/**
 * The next unused V3 market number.
 *
 * Throws rather than returning a number it is unsure about. A caller that gets
 * an error writes nothing; a caller handed a colliding number writes a second
 * market onto someone else's id.
 */
export async function allocateV3MarketId(
  store: AllocatorStore,
  predictionKey: (id: string) => string
): Promise<number> {
  for (let attempt = 0; attempt < MAX_PROBES; attempt++) {
    const candidate = await store.incr(V3_ID_COUNTER);

    // INCR on an unset key yields 1, which is a fine first market number.
    if (!Number.isSafeInteger(candidate) || candidate < 1) {
      throw new MarketIdUnavailableError(attempt + 1);
    }

    const existing = await store.get(predictionKey(canonicalMarketId('v3', candidate)));
    if (existing === null || existing === undefined) {
      return candidate;
    }
    // Taken. The counter was behind; INCR again rather than picking a number.
  }

  throw new MarketIdUnavailableError(MAX_PROBES);
}

/**
 * Move the counter up so the next allocation lands above `highestExisting`.
 *
 * For adopting records that predate the counter. Only ever raises it: lowering
 * a counter is how you hand out a number twice.
 */
export async function seedV3Counter(
  store: AllocatorStore,
  highestExisting: number
): Promise<number> {
  const current = Number((await store.get(V3_ID_COUNTER)) ?? 0);
  const target = Math.max(Number.isFinite(current) ? current : 0, highestExisting);
  if (target > current) {
    await store.set(V3_ID_COUNTER, target);
  }
  return target;
}

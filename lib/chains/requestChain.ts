import { CHAINS, DEFAULT_CHAIN_KEY } from './index';
import type { ChainKey } from './types';

/**
 * Which chain an incoming request is talking about.
 *
 * This is the only place a string from outside the process is allowed to become
 * a ChainKey, and it exists because that string ends up as a Redis key prefix.
 * `?chain=robinhood` selects a keyspace; `?chain=predictions` would select a
 * different one, and an unvalidated value would let a caller write market
 * records wherever it liked, or read a keyspace by guessing its name.
 *
 * Absent is not the same as wrong. Absent means Base, because Base is the
 * identity namespace: every record written before namespacing existed lives at
 * an unprefixed key, so an old client that sends no chain keeps reading exactly
 * the data it read yesterday. Present but unknown is a 400, never a fallback to
 * Base, because a caller that named a chain we do not have has asked for
 * something we cannot answer and quietly giving it Base's markets would be a
 * wrong answer rather than a missing one.
 */

export const CHAIN_PARAM = 'chain';

export type ChainParamResult =
  | { ok: true; chain: ChainKey }
  | { ok: false; error: string };

/** True only for a key CHAINS actually holds. */
export function isChainKey(value: unknown): value is ChainKey {
  // hasOwnProperty, not `in`: `in` walks the prototype chain, so '__proto__',
  // 'toString' and 'constructor' would all pass and then be used as a prefix.
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CHAINS, value);
}

function unknownChain(): ChainParamResult {
  // The rejected value is deliberately not echoed. Nothing good comes of
  // reflecting caller-supplied text back out of an endpoint, and the list of
  // chains we do accept is more useful to whoever is debugging.
  return {
    ok: false,
    error: `Unknown chain. Expected one of: ${Object.keys(CHAINS).join(', ')}`,
  };
}

export function resolveChainParam(value: unknown): ChainParamResult {
  if (value === null || value === undefined || value === '') {
    return { ok: true, chain: DEFAULT_CHAIN_KEY };
  }
  if (isChainKey(value)) return { ok: true, chain: value };
  return unknownChain();
}

/** Reads `?chain=` off the URL. */
export function chainFromRequest(request: { url: string }): ChainParamResult {
  let value: string | null = null;
  try {
    value = new URL(request.url).searchParams.get(CHAIN_PARAM);
  } catch {
    // A URL this malformed will fail elsewhere too; treat it as no chain given.
    value = null;
  }
  return resolveChainParam(value);
}

/** Reads `chain` off an already-parsed JSON body. */
export function chainFromBody(body: unknown): ChainParamResult {
  if (body === null || body === undefined || typeof body !== 'object') {
    return { ok: true, chain: DEFAULT_CHAIN_KEY };
  }
  return resolveChainParam((body as Record<string, unknown>)[CHAIN_PARAM]);
}

/**
 * Query string first, then the body, for POST routes that may be called either
 * way. A caller that names a chain in either place and gets it wrong is
 * rejected; only naming it nowhere falls through to Base.
 */
export function chainFromRequestOrBody(request: { url?: string }, body: unknown): ChainParamResult {
  let raw: string | null = null;
  try {
    if (request.url) raw = new URL(request.url).searchParams.get(CHAIN_PARAM);
  } catch {
    raw = null;
  }
  if (raw !== null && raw !== '') return resolveChainParam(raw);
  return chainFromBody(body);
}

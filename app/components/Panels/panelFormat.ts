import type { StakeToken } from '@/lib/userStake';

/**
 * Turning panel data into the strings and offsets the strip renders.
 *
 * All of it is pure and none of it touches React, so the wrapping maths behind
 * the activity slider and the wording of a feed row can be tested without a
 * DOM. The component holds the animation frame loop and nothing else.
 */

/* ------------------------------------------------------------------ counts */

/** A whole count, shortened once it stops being readable at full length. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

/**
 * Money, in the readable units of a six decimal stablecoin.
 *
 * `<0.01` rather than `0.00` for a pool that holds something: a market with one
 * cent in it is not an empty market, and rounding it to zero says it is.
 */
export function formatMoney(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value < 0.01) return '<0.01';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  if (value >= 1_000) return Math.round(value).toLocaleString('en-US');
  if (value >= 100) return value.toFixed(0);
  return value.toFixed(2);
}

/* -------------------------------------------------------------- count up */

export function easeOutCubic(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - (1 - clamped) ** 3;
}

/**
 * Where a counter has got to, part way through its run.
 *
 * The last frame returns the target exactly rather than the eased value, so a
 * counter can never settle a cent under the figure it is supposed to be
 * reporting. Rounding is clamped for the same reason: half a step of rounding
 * up would print a number larger than the one that was read.
 */
export function countUpValue(target: number, t: number, decimals = 0): number {
  if (!Number.isFinite(target)) return 0;
  if (t >= 1) return target;
  const factor = 10 ** decimals;
  const stepped = Math.round(target * easeOutCubic(t) * factor) / factor;
  return target >= 0 ? Math.min(stepped, target) : Math.max(stepped, target);
}

/* ----------------------------------------------------------------- slider */

/**
 * Fold a running offset back into one copy of the track.
 *
 * The track holds the items exactly twice, so an offset of minus one copy width
 * shows copy two in the position copy one started in and the seam never
 * appears. Any other ratio does show it: three copies wrap at a third of the
 * width and the reader watches the list restart in the middle.
 *
 * The result is in (-span, 0], so the track is never dragged to the right of
 * its own left edge and never far enough left to run out of items.
 */
export function wrapOffset(x: number, span: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(span) || span <= 0) return 0;
  const m = x % span;
  const wrapped = m > 0 ? m - span : m;
  // -0 is a real value here and it renders as "-0px". Normalise it.
  return wrapped === 0 ? 0 : wrapped;
}

/** The longest frame the slider will act on. See advance. */
export const MAX_FRAME_SECONDS = 0.1;

/** How far the track has moved this frame, at a speed in pixels per second. */
export function advance(x: number, speedPxPerSecond: number, dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return x;
  // A backgrounded tab hands back one enormous frame on return. Capped at a
  // tenth of a second, so the slider carries on from roughly where it was
  // rather than teleporting. Ten frames a second is already slower than
  // anything a browser draws, so this never touches a normal frame.
  const dt = Math.min(dtSeconds, MAX_FRAME_SECONDS);
  return x - speedPxPerSecond * dt;
}

/* ------------------------------------------------------------------- time */

/** How long ago, in the shortest form that is still true. */
export function timeAgo(ms: number, now: number): string {
  const seconds = Math.floor((now - ms) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/* --------------------------------------------------------------- activity */

/**
 * The shape /api/activity actually returns.
 *
 * Written down rather than guessed at. The strip previously carried a label map
 * keyed on `stake_placed` and `reward_claimed`, and the route has never emitted
 * either: it emits `bet_placed` and `payout_claimed`. Two of the four rows the
 * panel could draw therefore fell through to the fallback and printed the raw
 * type with its underscores swapped for spaces.
 */
export type ActivityType =
  | 'prediction_created'
  | 'bet_placed'
  | 'prediction_resolved'
  | 'payout_claimed'
  | 'prediction_approved'
  | 'user_joined';

export interface ActivityDetails {
  amount?: number;
  token?: StakeToken;
  choice?: 'YES' | 'NO';
  outcome?: 'YES' | 'NO';
  payout?: number;
  stake?: number;
}

export interface ActivityItem {
  id: string;
  type: string;
  timestamp: number;
  user?: { address?: string; displayName?: string; avatar?: string };
  prediction?: { id?: string; question?: string; category?: string };
  details?: ActivityDetails;
}

/** One feed row, reduced to the parts the card draws. */
export interface ActivityLine {
  who: string;
  avatar: string;
  verb: string;
  /** YES or NO when the record carries a side, else null. */
  side: 'YES' | 'NO' | null;
  /** Already formatted, symbol included. Null when the route sent no figure. */
  amount: string | null;
  market: string | null;
}

const VERB: Record<string, string> = {
  prediction_created: 'opened',
  bet_placed: 'backed',
  prediction_resolved: 'settled',
  payout_claimed: 'claimed on',
  prediction_approved: 'approved',
  user_joined: 'joined',
};

/** `0x1234...abcd`, matching the displayName the route builds. */
export function shortAddress(address: string | undefined): string {
  if (!address || address.length < 11) return address || 'someone';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Read one activity record into a row.
 *
 * `symbolFor` comes from the caller because the collateral leg is stored under
 * the key 'USDC' on every chain, including Robinhood, where the token is Paxos
 * USDG. Printing the leg name would tell a Robinhood user they hold dollars of
 * the wrong brand. The chain answers that question, not this module, which is
 * why the symbol arrives as an argument.
 *
 * Nothing is invented. A field the route did not send comes back null and the
 * card leaves the line out.
 */
export function activityLine(
  item: ActivityItem,
  symbolFor: (token: StakeToken) => string
): ActivityLine {
  const details = item.details ?? {};
  const verb = VERB[item.type] ?? item.type.replace(/_/g, ' ');

  const figure =
    item.type === 'payout_claimed'
      ? details.payout
      : item.type === 'bet_placed'
        ? details.amount
        : undefined;

  const amount =
    typeof figure === 'number' && Number.isFinite(figure) && figure > 0 && details.token
      ? `${formatMoney(figure)} ${symbolFor(details.token)}`
      : null;

  const question = item.prediction?.question;

  return {
    who: item.user?.displayName || shortAddress(item.user?.address),
    avatar: item.user?.avatar || '',
    verb,
    side: details.choice ?? details.outcome ?? null,
    amount,
    market: question && question.trim().length > 0 ? question : null,
  };
}

import { tokenSymbol, COLLATERAL_LEG, type StakeToken } from '@/lib/userStake';
import type { ChainKey } from '@/lib/chains';

/**
 * The three things every portfolio screen has to get right about a token, in
 * one place.
 *
 * MyPortfolio had a `symbolFor` closure and the other two screens had the word
 * ETH typed into the markup, so a Robinhood user with a 25 USDG position read
 * "25.0000 ETH". Rather than copy the closure twice, the rule lives here and
 * all four screens call it.
 *
 * Nothing here ever adds two tokens together. Amounts arrive from
 * /api/portfolio already in each token's own readable units, and a readable
 * 0.5 ETH plus a readable 25 USDC is 25.5 of nothing at all.
 */

/** Live money first, then the two archived legs in a fixed order. */
const ORDER: readonly StakeToken[] = [COLLATERAL_LEG, 'ETH', 'SWIPE'];

/**
 * What to print next to an amount.
 *
 * A row without a token is treated as collateral, which is what the route
 * sends when it has one: the leg is stored under the key 'USDC' on every chain,
 * so the symbol has to come from the chain and not from the leg name.
 */
export function symbolFor(token: StakeToken | undefined, chain: ChainKey): string {
  return tokenSymbol(token ?? COLLATERAL_LEG, chain);
}

/**
 * True for a position that can never settle.
 *
 * ETH and $SWIPE positions only exist on the V1 and V2 contracts on Base. Those
 * are archived: their owner key is gone and PredictionMarketV2 has no
 * transferOwnership, so no market on them can be resolved and no stake on them
 * can be claimed or refunded. It is a property of the leg, not of the chain,
 * because no other chain ever had those legs.
 */
export function isArchivedLeg(token: StakeToken | undefined): boolean {
  return (token ?? COLLATERAL_LEG) !== COLLATERAL_LEG;
}

/**
 * An amount in the precision its token deserves.
 *
 * A stablecoin figure carried to four decimals reads as a crypto amount, and
 * $SWIPE runs to millions, where two decimals are noise. Same precision as
 * MarketPools uses under the swipe card, so the same position reads the same in
 * both places.
 */
export function formatAmount(value: number, token: StakeToken | undefined): string {
  const leg = token ?? COLLATERAL_LEG;
  if (leg === 'ETH') return value.toFixed(5);
  // en-US rather than the visitor's locale, on purpose. These figures sit in a
  // column next to percentages and counts written with toFixed, and a browser
  // set to Polish renders one of them 25,00 and the other 25.00, in the same
  // tabular column, in the same row.
  if (leg === 'SWIPE') return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Same, with the sign always shown, for a profit or a loss. */
export function formatSigned(value: number, token: StakeToken | undefined): string {
  return `${value >= 0 ? '+' : '−'}${formatAmount(Math.abs(value), token)}`;
}

/** One row of a screen's own arithmetic. Only the fields the sums need. */
export interface TokenRow {
  token?: StakeToken;
  stakeAmount: number;
  potentialPayout?: number;
  profit: number;
}

export interface TokenTotal {
  token: StakeToken;
  staked: number;
  payout: number;
  profit: number;
  count: number;
}

/**
 * Per-token totals for whatever rows a screen is currently showing.
 *
 * Returns one entry per token that actually appears, in ORDER. A screen that
 * wants a single headline number has to pick a token and say which, which is
 * the whole point: `rows.reduce((s, r) => s + r.stakeAmount, 0)` was on three
 * screens and each one printed the result with ETH next to it.
 */
export function totalsByToken(rows: readonly TokenRow[]): TokenTotal[] {
  const acc = new Map<StakeToken, TokenTotal>();

  for (const row of rows) {
    const token = row.token ?? COLLATERAL_LEG;
    const current = acc.get(token) ?? { token, staked: 0, payout: 0, profit: 0, count: 0 };
    current.staked += row.stakeAmount;
    current.payout += row.potentialPayout ?? 0;
    current.profit += row.profit;
    current.count += 1;
    acc.set(token, current);
  }

  return ORDER.filter((token) => acc.has(token)).map((token) => acc.get(token)!);
}

/**
 * Sort key that keeps a "biggest first" list honest across tokens.
 *
 * Ordering 25 USDC above 0.5 ETH says one is larger than the other, and the
 * two numbers are not comparable. So tokens are grouped, collateral first, and
 * the amount only ranks rows inside a group.
 */
export function tokenRank(token: StakeToken | undefined): number {
  const index = ORDER.indexOf(token ?? COLLATERAL_LEG);
  return index === -1 ? ORDER.length : index;
}

/**
 * A stable React key for a row.
 *
 * The prediction id is not unique here. A market backed in two tokens comes
 * back as two rows carrying the same id, so keying on it alone gives React two
 * children with one key and lets it reuse the wrong one.
 */
export function rowKey(id: string, token: StakeToken | undefined): string {
  return `${id}:${token ?? COLLATERAL_LEG}`;
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { isWritableMarket } from '@/lib/chains';
import { useActiveChain } from '@/lib/chains/activeChain';
import { useMarketWrite } from '@/lib/chains/useMarketWrite';
import { parseMarketId } from '@/lib/marketId';
import { saveUserTransaction, syncPoolsAndHistory } from './postTx';

/**
 * Betting on the market detail page, desktop only.
 *
 * The page used to route every "Place your bet" press into the swipe deck,
 * which is the right answer on a phone and a detour on a desktop: the market
 * is already on screen, with its chart and its pools, and the deck arrives
 * showing whatever card happens to be first. This panel stakes here instead.
 *
 * It is not a second staking implementation. The send is the same
 * marketWrite.write the swipe card uses, behind the same address guard, and
 * the approval goes through marketWrite.writeCollateral so the token can
 * never be a Base literal on another chain. What is new here is only the
 * form around that call.
 */

// Just the entry points the collateral needs. The token address and the
// spender both come from marketWrite.market, never from a literal.
const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const PRESETS = [1, 5, 10, 25];

export interface BetPanelProps {
  /** The Redis id from the route, e.g. pred_v4_2. Parsed, never stripped. */
  predictionId: string;
  question: string;
  creator?: string;
  /** Raw collateral units from the Redis record. */
  yesPool: number;
  noPool: number;
  /** Called after the bet confirms and the pools have synced. */
  onPlaced?: () => void;
}

type Phase = 'idle' | 'approving' | 'betting' | 'confirming';

export function BetPanel({
  predictionId,
  question,
  creator,
  yesPool,
  noPool,
  onPlaced,
}: BetPanelProps) {
  const { address } = useAccount();
  const { chainKey } = useActiveChain();
  const marketWrite = useMarketWrite();

  const [side, setSide] = useState<'yes' | 'no' | null>(null);
  const [amountText, setAmountText] = useState('5');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [betHash, setBetHash] = useState<`0x${string}` | undefined>();
  // What the receipt effect needs to book the bet once it confirms.
  const pendingBet = useRef<{
    redisId: string;
    numericId: number;
    side: 'yes' | 'no';
    amountUnits: bigint;
    symbol: string;
  } | null>(null);

  const decimals = marketWrite.market?.collateral.decimals ?? 6;
  const symbol = marketWrite.market?.collateral.symbol ?? '';

  // Live rates and the live minimum. The constructor defaults are not the
  // launch rates, so nothing here is written down.
  const { data: feeConfig } = useReadContract({
    address: marketWrite.market?.address,
    abi: marketWrite.market?.abi,
    functionName: 'getFeeConfig',
    chainId: marketWrite.market?.chainId,
    query: { enabled: !!marketWrite.market },
  });
  const minBetUnits = feeConfig ? (feeConfig as readonly bigint[])[3] : BigInt(100000);
  const platformFeeBps = feeConfig ? Number((feeConfig as readonly bigint[])[0]) : 0;
  const creatorFeeBps = feeConfig ? Number((feeConfig as readonly bigint[])[1]) : 0;

  const { data: balance } = useReadContract({
    address: marketWrite.market?.collateral.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: marketWrite.market?.chainId,
    query: { enabled: !!address && !!marketWrite.market },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: marketWrite.market?.collateral.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && marketWrite.market ? [address, marketWrite.market.address] : undefined,
    chainId: marketWrite.market?.chainId,
    query: { enabled: !!address && !!marketWrite.market },
  });

  const amount = parseFloat(amountText);
  const amountValid = Number.isFinite(amount) && amount > 0;

  // Unknown allowance means "ask", not "assume granted".
  const needsApproval = useMemo(() => {
    if (!marketWrite.market || !amountValid) return false;
    if (allowance === undefined || allowance === null) return true;
    const required = parseUnits(amount.toFixed(decimals), decimals);
    return BigInt(allowance.toString()) < required;
  }, [allowance, amount, amountValid, decimals, marketWrite.market]);

  // Poll the real allowance instead of sleeping and hoping. It is the state
  // placeBet reads when it calls transferFrom.
  const waitForAllowance = useCallback(
    async (needed: bigint): Promise<boolean> => {
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const { data } = await refetchAllowance();
        if (data !== undefined && data !== null && BigInt(data.toString()) >= needed) {
          return true;
        }
      }
      return false;
    },
    [refetchAllowance]
  );

  // A preview, and only that: the plain parimutuel split with the live fees
  // off the losing pool. The time weighting is not modelled, so a late bet
  // pays less than this and an early one more. Labelled EST for that reason.
  const estimate = useMemo(() => {
    if (!amountValid || !side || !marketWrite.market) return null;
    const unit = 10 ** decimals;
    const yes = yesPool / unit;
    const no = noPool / unit;
    const feeRate = (platformFeeBps + creatorFeeBps) / 10000;
    const winningPool = (side === 'yes' ? yes : no) + amount;
    const losingPool = side === 'yes' ? no : yes;
    const payout =
      amount + (winningPool > 0 ? (amount / winningPool) * losingPool * (1 - feeRate) : 0);
    return { payout, profit: payout - amount };
  }, [amount, amountValid, side, yesPool, noPool, platformFeeBps, creatorFeeBps, decimals, marketWrite.market]);

  const handleBet = useCallback(async () => {
    setError(null);

    // The address this panel is about to write to, named once, and refused
    // unless it is the selected chain's live market. The address half is the
    // protection: gating on the chain alone would let a bet leave for a Base
    // address while another chain is selected. useMarketWrite re-checks this
    // at send time as well; this copy keeps the refusal a sentence on the
    // panel instead of a throw out of the wallet.
    const market = marketWrite.market;
    const target = market?.address ?? null;
    if (!marketWrite.ready || !market || !isWritableMarket(chainKey, target)) {
      setError(
        marketWrite.wrongNetwork
          ? 'Your wallet is on a different network. Switch it to place this bet.'
          : 'This network has no Swipe market yet. Switch networks to place a bet.'
      );
      return;
    }

    // The market number comes from parsing the id, never from stripping a
    // prefix. Null refuses the bet.
    const ref = parseMarketId(predictionId);
    if (!ref) {
      setError('Cannot identify this market. Refresh and try again.');
      return;
    }

    if (!side) {
      setError('Pick a side first.');
      return;
    }
    if (!amountValid) {
      setError('Enter an amount to bet.');
      return;
    }
    if (address && creator && creator.toLowerCase() === address.toLowerCase()) {
      setError('You made this market, so you cannot bet on it.');
      return;
    }

    const amountInCollateral = parseUnits(amount.toFixed(market.collateral.decimals), market.collateral.decimals);
    if (amountInCollateral < minBetUnits) {
      setError(`Minimum bet is ${formatUnits(minBetUnits, market.collateral.decimals)} ${market.collateral.symbol}.`);
      return;
    }
    if (balance !== undefined && amountInCollateral > (balance as bigint)) {
      setError(
        `Not enough ${market.collateral.symbol}. You have ${formatUnits(balance as bigint, market.collateral.decimals)}.`
      );
      return;
    }

    try {
      if (needsApproval) {
        setPhase('approving');
        // Spender is the market that will pull the tokens, and the token is
        // this chain's collateral. Both come from the same resolution as the
        // bet below.
        await marketWrite.writeCollateral({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [market.address, amountInCollateral],
        });
        const cleared = await waitForAllowance(amountInCollateral);
        if (!cleared) {
          setError('The approval has not landed yet. Try the bet again in a moment.');
          setPhase('idle');
          return;
        }
      }

      setPhase('betting');
      const hash = await marketWrite.write({
        functionName: 'placeBet',
        args: [BigInt(ref.numericId), side === 'yes', amountInCollateral],
      });
      pendingBet.current = {
        redisId: ref.redisId,
        numericId: ref.numericId,
        side,
        amountUnits: amountInCollateral,
        symbol: market.collateral.symbol,
      };
      setBetHash(hash);
      setPhase('confirming');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The bet was not sent.');
      setPhase('idle');
    }
  }, [
    marketWrite,
    chainKey,
    predictionId,
    side,
    amount,
    amountValid,
    address,
    creator,
    minBetUnits,
    balance,
    needsApproval,
    waitForAllowance,
  ]);

  const { isSuccess: isBetConfirmed, isError: isBetFailed } = useWaitForTransactionReceipt({
    hash: betHash,
    chainId: marketWrite.market?.chainId,
  });

  useEffect(() => {
    if (!betHash) return;
    if (isBetFailed) {
      setError('The transaction failed on chain.');
      setBetHash(undefined);
      setPhase('idle');
      return;
    }
    if (!isBetConfirmed) return;

    const booked = pendingBet.current;
    pendingBet.current = null;
    setBetHash(undefined);

    const book = async () => {
      if (booked && address) {
        await saveUserTransaction(address, {
          type: 'stake',
          redisId: booked.redisId,
          question,
          txHash: betHash,
          chainKey,
          tokenSymbol: booked.symbol,
          amountUnits: booked.amountUnits,
        });
        await syncPoolsAndHistory({
          chainKey,
          redisId: booked.redisId,
          numericId: booked.numericId,
          betAmountUnits: booked.amountUnits,
          betSide: booked.side,
          eventType: 'stake',
        });
      }
      setPhase('idle');
      onPlaced?.();
    };
    book();
  }, [isBetConfirmed, isBetFailed, betHash, address, chainKey, question, onPlaced]);

  // No market on this chain: the page's archived notice already covers it.
  if (!marketWrite.market) return null;

  const busy = phase !== 'idle';
  const balanceDisplay =
    balance !== undefined
      ? parseFloat(formatUnits(balance as bigint, decimals)).toFixed(2)
      : null;

  return (
    <section className="mdet-panel mdet-bet">
      <h2 className="mdet-panel__title">Place a bet</h2>

      {!address ? (
        <p className="mdet-bet__note">Connect a wallet to bet on this market.</p>
      ) : (
        <>
          <div className="mdet-bet__sides" role="group" aria-label="Pick a side">
            <button
              type="button"
              className={`mdet-bet__side mdet-bet__side--yes${side === 'yes' ? ' is-picked' : ''}`}
              onClick={() => setSide('yes')}
              disabled={busy}
            >
              Yes
            </button>
            <button
              type="button"
              className={`mdet-bet__side mdet-bet__side--no${side === 'no' ? ' is-picked' : ''}`}
              onClick={() => setSide('no')}
              disabled={busy}
            >
              No
            </button>
          </div>

          <div className="mdet-bet__presets">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`mdet-bet__preset${amountText === String(preset) ? ' is-picked' : ''}`}
                onClick={() => setAmountText(String(preset))}
                disabled={busy}
              >
                {preset} {symbol}
              </button>
            ))}
          </div>

          <label className="mdet-bet__field">
            <span>Amount ({symbol})</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              disabled={busy}
            />
          </label>

          <dl className="mdet-bet__facts">
            {balanceDisplay !== null && (
              <div>
                <dt>Your balance</dt>
                <dd>
                  {balanceDisplay} {symbol}
                </dd>
              </div>
            )}
            <div>
              <dt>Minimum bet</dt>
              <dd>
                {formatUnits(minBetUnits, decimals)} {symbol}
              </dd>
            </div>
            {estimate && (
              <div>
                <dt>Payout est.</dt>
                <dd>
                  {estimate.payout.toFixed(2)} {symbol}
                </dd>
              </div>
            )}
          </dl>

          <button
            type="button"
            className="mdet-cta"
            onClick={handleBet}
            disabled={busy || !side || !amountValid}
          >
            {phase === 'approving'
              ? 'Approving'
              : phase === 'betting'
                ? 'Confirm in wallet'
                : phase === 'confirming'
                  ? 'Waiting for the chain'
                  : side
                    ? `Bet ${side === 'yes' ? 'yes' : 'no'}`
                    : 'Pick a side'}
          </button>

          {needsApproval && !busy && amountValid && (
            <p className="mdet-bet__note">
              First bet at this size asks for a token approval, then the bet itself.
            </p>
          )}

          {error && (
            <p className="mdet-bet__error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

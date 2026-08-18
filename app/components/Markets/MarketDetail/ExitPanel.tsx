'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { isWritableMarket } from '@/lib/chains';
import { useActiveChain } from '@/lib/chains/activeChain';
import { useMarketWrite } from '@/lib/chains/useMarketWrite';
import { decodePositionSides, exitQuote } from '@/lib/chains/market';
import { parseMarketId } from '@/lib/marketId';
import { saveUserTransaction, syncPoolsAndHistory } from './postTx';
import './ExitPanel.css';

/**
 * Your exits on one market: one row per side you hold, never a merged
 * position.
 *
 * The contract's exitEarly(predictionId, isYes, amount) is per side, and one
 * address can hold YES and NO on the same market at once. Both older readers
 * of positions() collapse to the larger side, which renders a two-sided
 * position as one and leaves half of it un-exitable from the screen. Here the
 * sides are two rows with two amounts and two buttons, and nothing compares
 * them.
 *
 * Everything the contract would refuse is refused here first, as a sentence
 * under a disabled button: the final-quarter rule against emptying a side,
 * the closed market, the amount over the holding, the exit that rounds to
 * nothing. The quote maths is lib/chains/market.ts exitQuote, the same
 * arithmetic the contract runs, fed with the live fee from getFeeConfig and
 * the pools and createdAt from predictions(id) on chain rather than Redis.
 *
 * The send is the existing marketWrite.write behind the same address guard
 * the swipe bet uses. This component adds reads and a form, not a write path.
 */

const SIDES = ['yes', 'no'] as const;
type Side = (typeof SIDES)[number];

export interface ExitPanelProps {
  /** The canonical Redis id, e.g. pred_v4_2. Parsed, never stripped. */
  predictionId: string;
  question?: string;
  /** Called after an exit confirms and the pools have synced. */
  onExited?: () => void;
}

export function ExitPanel({ predictionId, question, onExited }: ExitPanelProps) {
  const { address } = useAccount();
  const { chainKey } = useActiveChain();
  const marketWrite = useMarketWrite();

  const marketRef = useMemo(() => parseMarketId(predictionId), [predictionId]);
  const numericId = marketRef?.numericId ?? null;
  const enabled = Boolean(address) && numericId !== null && !!marketWrite.market;

  const [amounts, setAmounts] = useState<Record<Side, string>>({ yes: '', no: '' });
  const [exitingSide, setExitingSide] = useState<Side | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exitHash, setExitHash] = useState<`0x${string}` | undefined>();
  const pendingExit = useRef<{
    redisId: string;
    numericId: number;
    side: Side;
    amountUnits: bigint;
    feeUnits: bigint;
    netUnits: bigint;
    symbol: string;
  } | null>(null);

  // The final-quarter bracket moves with the clock, so the clock ticks.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Held per side, straight from the contract.
  const { data: positionData, refetch: refetchPosition } = useReadContract({
    address: marketWrite.market?.address,
    abi: marketWrite.market?.abi,
    functionName: 'positions',
    args: address && numericId !== null ? [BigInt(numericId), address] : undefined,
    chainId: marketWrite.market?.chainId,
    query: { enabled, refetchInterval: 15_000 },
  });
  const position = decodePositionSides(positionData as readonly unknown[] | undefined);

  // predictions(id), not getPrediction(id): createdAt only exists on the
  // former, and the final-quarter refusal is a lie without the real createdAt.
  // The Redis copy is defaulted to deadline minus a day and cannot be used.
  const { data: rowData, refetch: refetchRow } = useReadContract({
    address: marketWrite.market?.address,
    abi: marketWrite.market?.abi,
    functionName: 'predictions',
    args: numericId !== null ? [BigInt(numericId)] : undefined,
    chainId: marketWrite.market?.chainId,
    query: { enabled, refetchInterval: 15_000 },
  });
  const row = useMemo(() => {
    if (!rowData) return null;
    const r = rowData as readonly unknown[];
    if (r.length < 12) return null;
    return {
      deadline: r[2] as bigint,
      yesPool: r[3] as bigint,
      noPool: r[4] as bigint,
      resolved: r[7] as boolean,
      cancelled: r[8] as boolean,
      refundable: r[10] as boolean,
      createdAt: r[11] as bigint,
    };
  }, [rowData]);

  // The live exit fee. 5% is only the deploy-day rate; the owner can move it,
  // so the estimate waits for the read instead of assuming.
  const { data: feeConfig } = useReadContract({
    address: marketWrite.market?.address,
    abi: marketWrite.market?.abi,
    functionName: 'getFeeConfig',
    chainId: marketWrite.market?.chainId,
    query: { enabled: !!marketWrite.market },
  });
  const exitFeeBps = feeConfig ? (feeConfig as readonly bigint[])[2] : null;

  const decimals = marketWrite.market?.collateral.decimals ?? 6;
  const symbol = marketWrite.market?.collateral.symbol ?? '';

  const handleExit = useCallback(
    async (isYes: boolean, amountUnits: bigint) => {
      setError(null);

      // The address this row is about to write to, named once, and refused
      // unless it is the selected chain's live market. Same two-part guard as
      // the swipe bet: the chain half alone would let an exit leave for an
      // address with nothing behind it. useMarketWrite re-checks at send
      // time; this copy keeps the refusal on the panel instead of in the
      // wallet.
      const market = marketWrite.market;
      const target = market?.address ?? null;
      if (!marketWrite.ready || !market || !isWritableMarket(chainKey, target)) {
        setError(
          marketWrite.wrongNetwork
            ? 'Your wallet is on a different network. Switch it to exit.'
            : 'This network has no Swipe market yet.'
        );
        return;
      }

      const ref = parseMarketId(predictionId);
      if (!ref) {
        setError('Cannot identify this market. Refresh and try again.');
        return;
      }
      if (exitFeeBps === null || !row) {
        setError('Still reading this market from the contract. Try again in a moment.');
        return;
      }

      // Everything the contract would refuse, refused here first. The button
      // already disables on a refusal; this is the same check at the moment of
      // sending, because pools and the clock both move under an open page.
      const quote = exitQuote({
        amount: amountUnits,
        isYes,
        held: isYes ? (position?.yesAmount ?? BigInt(0)) : (position?.noAmount ?? BigInt(0)),
        yesPool: row.yesPool,
        noPool: row.noPool,
        createdAt: row.createdAt,
        deadline: row.deadline,
        now: BigInt(Math.floor(Date.now() / 1000)),
        earlyExitFeeBps: exitFeeBps,
        resolved: row.resolved,
        cancelled: row.cancelled,
        refundable: row.refundable,
      });
      if (quote.refusal !== null) {
        setError(quote.refusal);
        return;
      }

      const side: Side = isYes ? 'yes' : 'no';
      try {
        setExitingSide(side);
        const hash = await marketWrite.write({
          functionName: 'exitEarly',
          args: [BigInt(ref.numericId), isYes, amountUnits],
        });
        pendingExit.current = {
          redisId: ref.redisId,
          numericId: ref.numericId,
          side,
          amountUnits,
          feeUnits: quote.fee,
          netUnits: quote.net,
          symbol: market.collateral.symbol,
        };
        setExitHash(hash);
        setConfirming(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The exit was not sent.');
        setExitingSide(null);
      }
    },
    [marketWrite, chainKey, predictionId, exitFeeBps, row, position]
  );

  const { isSuccess: isExitConfirmed, isError: isExitFailed } = useWaitForTransactionReceipt({
    hash: exitHash,
    chainId: marketWrite.market?.chainId,
  });

  useEffect(() => {
    if (!exitHash) return;
    if (isExitFailed) {
      setError('The transaction failed on chain.');
      setExitHash(undefined);
      setExitingSide(null);
      setConfirming(false);
      return;
    }
    if (!isExitConfirmed) return;

    const booked = pendingExit.current;
    pendingExit.current = null;
    setExitHash(undefined);

    const book = async () => {
      if (booked && address) {
        await saveUserTransaction(address, {
          type: 'exit_early',
          redisId: booked.redisId,
          question: question || `Market ${booked.redisId}`,
          txHash: exitHash,
          chainKey,
          tokenSymbol: booked.symbol,
          amountUnits: booked.amountUnits,
          exitFeeUnits: booked.feeUnits,
          receivedUnits: booked.netUnits,
        });
        await syncPoolsAndHistory({
          chainKey,
          redisId: booked.redisId,
          numericId: booked.numericId,
          betAmountUnits: booked.amountUnits,
          betSide: booked.side,
          eventType: 'early_exit',
        });
      }
      if (booked) {
        setAmounts((prev) => ({ ...prev, [booked.side]: '' }));
      }
      setExitingSide(null);
      setConfirming(false);
      refetchPosition();
      refetchRow();
      onExited?.();
    };
    book();
  }, [
    isExitConfirmed,
    isExitFailed,
    exitHash,
    address,
    chainKey,
    question,
    refetchPosition,
    refetchRow,
    onExited,
  ]);

  // Nothing to exit, nothing to render. An empty panel would be noise under
  // every market the user never touched.
  if (!enabled || !position) return null;

  const heldBySide: Record<Side, bigint> = {
    yes: position.yesAmount,
    no: position.noAmount,
  };
  const rows = SIDES.filter((side) => heldBySide[side] > BigInt(0));
  if (rows.length === 0) return null;

  return (
    <section className="xpanel">
      <h2 className="xpanel__title">Exit early</h2>
      <p className="xpanel__lede">
        Sell part of a position back before the deadline. The contract keeps a{' '}
        {exitFeeBps !== null ? `${Number(exitFeeBps) / 100}%` : ''} fee read live from the
        chain, and what you get depends on the pools as they stand now.
      </p>

      {rows.map((side) => {
        const held = heldBySide[side];
        const heldDisplay = formatUnits(held, decimals);
        const amountText = amounts[side] !== '' ? amounts[side] : heldDisplay;
        const parsed = parseFloat(amountText);
        let amountUnits = BigInt(0);
        if (Number.isFinite(parsed) && parsed > 0) {
          try {
            amountUnits = parseUnits(parsed.toFixed(decimals), decimals);
          } catch {
            amountUnits = BigInt(0);
          }
        }

        // No row data or no fee yet: say so instead of quoting from nothing.
        const quote =
          row && exitFeeBps !== null
            ? exitQuote({
                amount: amountUnits,
                isYes: side === 'yes',
                held,
                yesPool: row.yesPool,
                noPool: row.noPool,
                createdAt: row.createdAt,
                deadline: row.deadline,
                now: BigInt(nowSec),
                earlyExitFeeBps: exitFeeBps,
                resolved: row.resolved,
                cancelled: row.cancelled,
                refundable: row.refundable,
              })
            : null;

        const rowBusy = exitingSide === side;
        const otherBusy = exitingSide !== null && exitingSide !== side;

        return (
          <div key={side} className={`xpanel__row xpanel__row--${side}`}>
            <div className="xpanel__rowhead">
              <span className={`xpanel__badge xpanel__badge--${side}`}>
                {side === 'yes' ? 'Yes' : 'No'}
              </span>
              <span className="xpanel__held">
                Holding {heldDisplay} {symbol}
              </span>
            </div>

            <div className="xpanel__controls">
              <label className="xpanel__field">
                <span>Exit amount</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={amountText}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [side]: e.target.value }))}
                  disabled={rowBusy || confirming}
                />
              </label>
              <button
                type="button"
                className="xpanel__exit"
                onClick={() => handleExit(side === 'yes', amountUnits)}
                disabled={
                  rowBusy ||
                  otherBusy ||
                  confirming ||
                  !quote ||
                  quote.refusal !== null ||
                  amountUnits === BigInt(0)
                }
              >
                {rowBusy ? (confirming ? 'Waiting for the chain' : 'Confirm in wallet') : 'Exit'}
              </button>
            </div>

            {quote === null ? (
              <p className="xpanel__hint">Reading the pools and the fee from the contract.</p>
            ) : quote.refusal !== null ? (
              <p className="xpanel__refusal">{quote.refusal}</p>
            ) : (
              <p className="xpanel__hint">
                You would receive about {formatUnits(quote.net, decimals)} {symbol}, after a fee of{' '}
                {formatUnits(quote.fee, decimals)} {symbol}. The figure moves as others bet.
              </p>
            )}
          </div>
        );
      })}

      {error && (
        <p className="xpanel__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useComposeCast, useOpenUrl } from "@coinbase/onchainkit/minikit";
import sdk from "@farcaster/miniapp-sdk";
import { useActiveChain } from "@/lib/chains/activeChain";
import { ShareGlyph } from "../Share/ShareGlyph";
import {
  composeShare,
  isChartMarket,
  NETWORK_ACTIONS,
  NETWORK_LABELS,
  shareCardUrl,
  SHARE_NETWORKS,
  type ShareComposition,
  type ShareNetwork,
} from "../Share/shareTargets";
import "./SharePreviewModal.css";

/**
 * The share sheet.
 *
 * What this used to be: two buttons. A Farcaster one that called the caller's
 * onShare, and a Twitter one that swapped the handle with a regex and opened an
 * intent. A market could only leave the app through Farcaster, or through X
 * carrying text written for Farcaster.
 *
 * What it is now: seven destinations, each with the payload that destination
 * actually reads, built in app/components/Share/shareTargets.ts and tested
 * there. Pick one and the preview under it changes to the exact words that will
 * be posted, with the card image that will be attached, so nothing goes out
 * unseen. The rules each network imposes are in that file and not in here; this
 * component owns the transport and the sheet.
 *
 * TRANSPORT. Inside a mini app window.open is frequently a no-op, so every
 * external link goes through MiniKit's openUrl first, then the Farcaster SDK,
 * and only then window.open. That is the order app/manifesto/page.tsx uses.
 * Farcaster does not open a link at all: it composes in place through MiniKit
 * with the Farcaster SDK behind it, the pair that
 * app/components/Actions/SharePredictionButton.tsx established, and falls back
 * to the Warpcast compose page only when both refuse. The caller's onShare is
 * still the first thing tried on that path, because it is what carries the
 * post-share notification, and it casts the same text this sheet previewed.
 *
 * THE CARD. A chart market's card has to be redrawn, because a price chart from
 * an hour ago is the wrong picture. That upload happens when the sheet opens
 * rather than on the click, which fixes two things at once: the preview shows
 * the real uploaded image, and no click has to await a network round trip
 * before opening a window, which is exactly what Safari's popup blocker kills.
 *
 * SHAPE. A bottom sheet on a phone, a centred card from 560px up. Radix owns
 * the focus trap, escape, and locking the page behind it, the same primitive
 * HowToPlayModal uses.
 *
 * MOTION, all six devices from app/components/Market/SwipeTokenCard.css, none
 * of them imported: the sections rise on a stagger, a beam sweeps the hero's
 * top edge, a marquee scrolls what each destination does with a share, the wire
 * between the destinations and the preview marches while the card is being
 * built and goes solid when it is done, the chosen tile pulses once, and the
 * empty card frame breathes while it waits. Every one is cancelled under
 * prefers-reduced-motion.
 */

interface SharePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  prediction: {
    id: string;
    question: string;
    category: string;
    totalPoolETH?: number;
    participantsCount?: number;
    imageUrl?: string;
    yesPercentage?: number;
    noPercentage?: number;
    includeChart?: boolean;
  };
  shareText: string;
  shareUrl: string;
  /**
   * The caller's own cast. Optional now: without one the sheet composes the
   * cast itself. Existing callers pass it and keep their notification.
   */
  onShare?: () => Promise<void> | void;
  stakeInfo?: {
    amount: number;
    // Collateral symbol, USDC on Base and USDG on Robinhood. Widened from
    // 'ETH' | 'SWIPE' when bets stopped being able to pick their token.
    token: string;
    isYes: boolean;
  };
  /** Where the sheet opens. Farcaster unless a caller says otherwise. */
  defaultNetwork?: ShareNetwork;
}

/** Decorative, and every line of it is said again in the preview note. */
const TICKER_ITEMS = [
  'farcaster takes the cast and the card',
  'x counts the link inside the 280',
  'facebook takes the link alone',
  'reddit wants a title',
  'telegram splits link and note',
  'whatsapp is one message',
  'or copy it and paste it anywhere',
];

/** Whether a fresh card is being drawn for this market, and how that went. */
type CardState = 'idle' | 'building' | 'ready' | 'failed';

/** Whether the preview image itself arrived. */
type ImageState = 'loading' | 'ok' | 'failed';

export function SharePreviewModal({
  isOpen,
  onClose,
  prediction,
  shareText,
  shareUrl,
  onShare,
  stakeInfo,
  defaultNetwork = 'farcaster',
}: SharePreviewModalProps) {
  const { chainKey } = useActiveChain();
  const { composeCast: minikitComposeCast } = useComposeCast();
  const minikitOpenUrl = useOpenUrl();

  const [network, setNetwork] = useState<ShareNetwork>(defaultNetwork);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadedCard, setUploadedCard] = useState<string | null>(null);
  const [cardState, setCardState] = useState<CardState>('idle');
  const [imgState, setImgState] = useState<ImageState>('loading');

  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const announce = useCallback((message: string) => {
    setStatus(message);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(''), 4000);
  }, []);

  useEffect(() => () => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
  }, []);

  const needsFreshCard = isChartMarket(prediction);

  // The card, redrawn and uploaded once per opening of the sheet. The endpoint
  // writes the URL back to Redis, which is where the page's own metadata reads
  // it, so what a crawler fetches later is the image previewed here.
  useEffect(() => {
    if (!isOpen) return;
    setNetwork(defaultNetwork);
    setStatus('');

    if (!needsFreshCard) {
      setCardState('idle');
      return;
    }

    let cancelled = false;
    setCardState('building');

    fetch(`/api/og/upload/${prediction.id}?chain=${encodeURIComponent(chainKey)}`, {
      method: 'POST',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { url?: string } | null) => {
        if (cancelled) return;
        if (data?.url) {
          setUploadedCard(data.url);
          setCardState('ready');
        } else {
          setCardState('failed');
        }
      })
      .catch(() => {
        if (!cancelled) setCardState('failed');
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, needsFreshCard, prediction.id, chainKey, defaultNetwork]);

  const cardSrc = useMemo(
    () => shareCardUrl(prediction, uploadedCard, chainKey),
    [prediction, uploadedCard, chainKey]
  );

  // A new source is a new wait. Without this the frame would claim the old
  // image the instant the upload swaps the URL underneath it.
  useEffect(() => {
    setImgState('loading');
  }, [cardSrc]);

  /** Nothing left to wait for: no redraw in flight and the image is in. */
  const settled = cardState !== 'building' && imgState === 'ok';

  const share: ShareComposition = useMemo(
    () =>
      composeShare(network, {
        text: shareText,
        url: shareUrl,
        question: prediction.question,
      }),
    [network, shareText, shareUrl, prediction.question]
  );

  /** MiniKit first, then the Farcaster SDK. Same pair as SharePredictionButton. */
  const composeCast = useCallback(
    async (params: { text: string; embeds?: string[] }) => {
      try {
        if (minikitComposeCast) {
          const embeds = params.embeds?.slice(0, 2) as
            | []
            | [string]
            | [string, string]
            | undefined;
          await minikitComposeCast({ text: params.text, embeds });
          return;
        }
      } catch (error) {
        console.log('MiniKit composeCast failed, trying the Farcaster SDK', error);
      }

      await sdk.actions.composeCast({
        text: params.text,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        embeds: params.embeds?.map((url) => ({ url })) as any,
      });
    },
    [minikitComposeCast]
  );

  /** MiniKit, then the Farcaster SDK, then the browser. */
  const openExternal = useCallback(
    async (url: string) => {
      try {
        if (minikitOpenUrl) {
          minikitOpenUrl(url);
          return true;
        }
      } catch {
        // Fall through to the Farcaster SDK.
      }
      try {
        await sdk.actions.openUrl(url);
        return true;
      } catch {
        // Fall through to the browser.
      }
      try {
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        return Boolean(opened);
      } catch {
        return false;
      }
    },
    [minikitOpenUrl]
  );

  const copyToClipboard = useCallback(async (value: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // A denied permission or an insecure context. Fall through.
    }
    // The fallback, for a webview with no clipboard API. Off screen rather than
    // display:none, because a hidden textarea cannot be selected, and inside
    // the dialog rather than on the body, because the focus trap pulls focus
    // back out of anything parked outside it and the selection dies with it.
    try {
      const host = sheetRef.current ?? document.body;
      const field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.position = 'absolute';
      field.style.left = '-9999px';
      field.style.opacity = '0';
      host.appendChild(field);
      field.select();
      field.setSelectionRange(0, value.length);
      const copied = document.execCommand('copy');
      host.removeChild(field);
      return copied;
    } catch {
      return false;
    }
  }, []);

  const send = useCallback(async () => {
    if (busy) return;
    const label = NETWORK_LABELS[share.network];

    if (share.network === 'copy') {
      const copied = await copyToClipboard(share.clipboard ?? share.url);
      announce(
        copied
          ? 'Copied. The message and the link are on your clipboard.'
          : 'Could not reach the clipboard. Select the text above and copy it by hand.'
      );
      return;
    }

    if (share.network === 'farcaster') {
      setBusy(true);
      try {
        if (onShare) {
          await onShare();
        } else {
          await composeCast({ text: share.body, embeds: [share.url] });
        }
        onClose();
      } catch (error) {
        console.log('composeCast failed, opening the compose page instead', error);
        const opened = share.href ? await openExternal(share.href) : false;
        if (opened) {
          onClose();
        } else {
          announce('Farcaster did not open. Copy the message instead.');
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!share.href) return;
    setBusy(true);
    try {
      const opened = await openExternal(share.href);
      announce(
        opened
          ? `${label} is open in another window. Finish the post there.`
          : `${label} did not open. Copy the message instead.`
      );
    } finally {
      setBusy(false);
    }
  }, [busy, share, onShare, composeCast, openExternal, copyToClipboard, announce, onClose]);

  const stakeAmount = stakeInfo
    ? stakeInfo.token === 'SWIPE'
      ? formatSwipe(stakeInfo.amount)
      : stakeInfo.amount
    : null;

  const showOdds =
    typeof prediction.yesPercentage === 'number' &&
    prediction.yesPercentage >= 0 &&
    prediction.yesPercentage <= 100;
  const yesShare = Math.round(prediction.yesPercentage ?? 0);

  const overBudget = share.limit !== null && share.cost > share.limit;

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="shr-scrim" />
        <DialogPrimitive.Content className="shr" ref={sheetRef}>
          <span className="shr__grip" aria-hidden="true" />

          <header className="shr__hero">
            <span className="shr__beam" aria-hidden="true" />
            <span className="shr__eyebrow">Share this market</span>
            <DialogPrimitive.Title className="shr__headline">
              {prediction.question}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="shr__standfirst">
              Pick where it goes. Each one takes a different shape of the same message,
              and you read it before it leaves.
            </DialogPrimitive.Description>

            {(stakeInfo || showOdds) && (
              <div className="shr__facts">
                {stakeInfo && (
                  <span
                    className={`shr__chip ${stakeInfo.isYes ? 'shr__chip--yes' : 'shr__chip--no'}`}
                  >
                    your bet {stakeAmount} {stakeInfo.token}, {stakeInfo.isYes ? 'yes' : 'no'}
                  </span>
                )}
                {showOdds && (
                  <span className="shr__chip">
                    {yesShare}% yes, {100 - yesShare}% no
                  </span>
                )}
                {typeof prediction.participantsCount === 'number' &&
                  prediction.participantsCount > 0 && (
                    <span className="shr__chip">
                      {prediction.participantsCount} swipers
                    </span>
                  )}
              </div>
            )}
          </header>

          <div className="shr__ticker" aria-hidden="true">
            {/* Duplicated once, because the loop moves the track by exactly half
                its width and any other ratio shows a seam. */}
            <div className="shr__ticker-track">
              {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, index) => (
                <span className="shr__ticker-item" key={`${item}-${index}`}>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="shr__scroll">
            <section className="shr__panel">
              <h3 className="shr__panel-title">Where it goes</h3>
              <div className="shr__targets">
                {SHARE_NETWORKS.map((candidate) => {
                  const selected = candidate === network;
                  return (
                    <button
                      key={candidate}
                      type="button"
                      className={`shr__tile${selected ? ' shr__tile--on' : ''}`}
                      aria-pressed={selected}
                      aria-label={
                        candidate === 'copy'
                          ? 'Copy link and message'
                          : `Share on ${NETWORK_LABELS[candidate]}`
                      }
                      onClick={() => {
                        setNetwork(candidate);
                        setStatus('');
                      }}
                    >
                      <ShareGlyph network={candidate} />
                      <span className="shr__tile-name">{NETWORK_LABELS[candidate]}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <div
              className={`shr__wire${cardState === 'building' ? ' shr__wire--busy' : ''}`}
              aria-hidden="true"
            />

            <section className="shr__panel shr__panel--accent">
              <div className="shr__panel-head">
                <h3 className="shr__panel-title">What gets posted</h3>
                {share.limit !== null && (
                  <span
                    className={`shr__count${overBudget ? ' shr__count--over' : ''}`}
                  >
                    {share.cost}/{share.limit}
                  </span>
                )}
              </div>

              <figure className="shr__card">
                <div
                  className={`shr__card-frame${settled ? ' shr__card-frame--on' : ''}${imgState === 'failed' ? ' shr__card-frame--blank' : ''}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cardSrc}
                    alt={`Link card for the market, ${prediction.question}`}
                    className="shr__card-img"
                    onLoad={() => setImgState('ok')}
                    onError={() => setImgState('failed')}
                  />
                </div>
                <figcaption className="shr__card-note">
                  <span
                    className={`shr__dot${settled ? ' shr__dot--live' : ' shr__dot--wait'}`}
                    aria-hidden="true"
                  />
                  {cardState === 'building'
                    ? 'Redrawing the card with the current chart'
                    : imgState === 'failed'
                      ? 'This preview would not load, so check the card on the market page'
                      : cardState === 'failed'
                        ? 'The redraw did not answer, so the market page card goes instead'
                        : 'This card rides along with the link'}
                </figcaption>
              </figure>

              {share.body ? (
                <p className="shr__body">{share.body}</p>
              ) : (
                <p className="shr__body shr__body--empty">
                  No message. This one is the link and the card.
                </p>
              )}

              {share.linkPlacement !== 'body' && (
                <p className="shr__link">{share.url}</p>
              )}

              <p className="shr__note">{share.note}</p>
            </section>
          </div>

          <footer className="shr__footer">
            <p className="shr__status" role="status" aria-live="polite">
              {status}
            </p>
            <button
              type="button"
              className="shr__send"
              onClick={send}
              disabled={busy}
            >
              {busy ? 'Working' : NETWORK_ACTIONS[share.network]}
            </button>
          </footer>

          <DialogPrimitive.Close className="shr__close" aria-label="Close the share sheet">
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Kept from the old sheet: a SWIPE balance is unreadable written out in full. */
function formatSwipe(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toFixed(0);
}

export default SharePreviewModal;

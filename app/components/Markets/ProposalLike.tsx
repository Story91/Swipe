"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import type { ChainKey } from "@/lib/chains/types";
import type { LikeState } from "@/lib/predictionLikes";

/**
 * The like control on a proposed market's card.
 *
 * A proposal sits in the queue with nothing to distinguish it but its arrival
 * time, and an admin registering markets has no way to tell which ones anyone
 * wants. This is the cheapest signal that costs a person nothing.
 *
 * It is not a bet. It moves no money and it is not signed, for the reasons set
 * out in lib/predictionLikes.ts. What it must not do is look like a bet, so it
 * says "want this" rather than "yes", and it never appears on a live market.
 *
 * The count is optimistic on tap and rolls back if the write fails, because the
 * alternative is a heart that does nothing for a round trip. A failure puts the
 * previous state back rather than leaving a lie on screen.
 */

interface ProposalLikeProps {
  predictionId: string;
  chainKey: ChainKey;
}

export function ProposalLike({ predictionId, chainKey }: ProposalLikeProps) {
  const { address } = useAccount();
  const [state, setState] = useState<LikeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Guards a setState after the card scrolls out and unmounts, and guards the
  // response of a request whose market or chain changed under it.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ chain: chainKey });
    if (address) params.set("address", address);

    fetch(`/api/predictions/${predictionId}/likes?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (live.current && json?.success) setState(json.data as LikeState);
      })
      .catch(() => {
        // A count that will not load is not worth an error on a card. The
        // control stays quiet rather than shouting about itself.
      });
  }, [predictionId, chainKey, address]);

  const toggle = useCallback(
    async (event: React.MouseEvent) => {
      // The whole card is a link. Without this, liking opens the market.
      event.stopPropagation();
      event.preventDefault();

      if (!address || busy || !state) return;

      const optimistic: LikeState = {
        liked: !state.liked,
        count: state.count + (state.liked ? -1 : 1),
      };
      const previous = state;
      setState(optimistic);
      setBusy(true);
      setFailed(false);

      try {
        const response = await fetch(`/api/predictions/${predictionId}/likes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, chain: chainKey }),
        });
        const json = await response.json();
        if (!live.current) return;
        if (json?.success) {
          setState(json.data as LikeState);
        } else {
          setState(previous);
          setFailed(true);
        }
      } catch {
        if (live.current) {
          setState(previous);
          setFailed(true);
        }
      } finally {
        if (live.current) setBusy(false);
      }
    },
    [address, busy, state, predictionId, chainKey]
  );

  // Nothing to draw until the first read lands. A zero that turns into seven a
  // moment later reads as a bug.
  if (!state) return null;

  const label = address
    ? state.liked
      ? `You want this market, ${state.count} in total. Tap to take it back.`
      : `Say you want this market. ${state.count} so far.`
    : `${state.count} people want this market. Connect a wallet to add yours.`;

  return (
    <button
      type="button"
      className={`mgcard__like${state.liked ? " mgcard__like--on" : ""}${
        failed ? " mgcard__like--failed" : ""
      }`}
      onClick={toggle}
      disabled={!address || busy}
      aria-pressed={state.liked}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M12 20.5 4.2 13a4.7 4.7 0 0 1 0-6.7 4.7 4.7 0 0 1 6.7 0l1.1 1.1 1.1-1.1a4.7 4.7 0 0 1 6.7 0 4.7 4.7 0 0 1 0 6.7z"
          fill={state.liked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      <span className="mgcard__like-count">{state.count}</span>
    </button>
  );
}

export default ProposalLike;

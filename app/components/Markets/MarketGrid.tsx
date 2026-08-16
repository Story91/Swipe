"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useHybridPredictions } from "@/lib/hooks/useHybridPredictions";
import type { HybridPrediction } from "@/lib/hooks/useHybridPredictions";
import "./MarketGrid.css";

/**
 * Desktop browse view: every open market at once.
 *
 * Presentational by design — a card links through to /prediction/[id], where the
 * existing staking flow lives. Keeping betting out of the grid means there is
 * exactly one implementation of it. If inline betting is wanted later, the card
 * gains a control that calls the same flow; nothing here needs rewriting.
 */

function formatPool(amountWei: number): string {
  const eth = amountWei / 1e18;
  if (eth === 0) return "0";
  if (eth < 0.001) return "<0.001";
  if (eth < 1) return eth.toFixed(3);
  return eth.toFixed(2);
}

function formatTimeLeft(deadline: number): { label: string; urgent: boolean } {
  const secondsLeft = deadline - Math.floor(Date.now() / 1000);
  if (secondsLeft <= 0) return { label: "Ended", urgent: true };

  const days = Math.floor(secondsLeft / 86400);
  if (days >= 1) return { label: `${days}d left`, urgent: false };

  const hours = Math.floor(secondsLeft / 3600);
  if (hours >= 1) return { label: `${hours}h left`, urgent: hours < 6 };

  const minutes = Math.max(1, Math.floor(secondsLeft / 60));
  return { label: `${minutes}m left`, urgent: true };
}

function MarketCard({
  prediction,
  onOpen,
}: {
  prediction: HybridPrediction;
  onOpen: (id: string) => void;
}) {
  const yes = Math.round(prediction.yesPercentage ?? 0);
  const no = Math.max(0, 100 - yes);
  const time = formatTimeLeft(prediction.deadline);
  const pool = formatPool(prediction.totalPool ?? 0);

  return (
    <article
      className="market-card"
      role="link"
      tabIndex={0}
      onClick={() => onOpen(prediction.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(prediction.id);
        }
      }}
      aria-label={prediction.question}
    >
      <div className="market-card__media">
        {prediction.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={prediction.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="market-card__media-fallback" aria-hidden="true" />
        )}
        <span className="market-card__category">{prediction.category}</span>
        <span
          className={`market-card__time${time.urgent ? " market-card__time--urgent" : ""}`}
        >
          {time.label}
        </span>
      </div>

      <div className="market-card__body">
        <h3 className="market-card__question">{prediction.question}</h3>

        <div className="market-card__odds" aria-hidden="true">
          <div className="market-card__bar">
            <span className="market-card__bar-yes" style={{ width: `${yes}%` }} />
          </div>
          <div className="market-card__odds-labels">
            <span className="market-card__yes">YES {yes}%</span>
            <span className="market-card__no">NO {no}%</span>
          </div>
        </div>

        <dl className="market-card__stats">
          <div>
            <dt>Pool</dt>
            <dd>{pool} ETH</dd>
          </div>
          <div>
            <dt>Players</dt>
            <dd>{prediction.participants?.length ?? 0}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

export function MarketGrid() {
  const router = useRouter();
  const { predictions, loading, error } = useHybridPredictions();

  const openMarkets = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return (predictions ?? [])
      .filter((p) => !p.resolved && !p.cancelled && p.deadline > now)
      .sort((a, b) => a.deadline - b.deadline);
  }, [predictions]);

  const openMarket = (id: string) => router.push(`/prediction/${id}`);

  if (loading) {
    return (
      <div className="market-grid" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="market-card market-card--skeleton" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="market-grid__notice" role="alert">
        <h2>Could not load markets</h2>
        <p>{String(error)}</p>
      </div>
    );
  }

  if (openMarkets.length === 0) {
    return (
      <div className="market-grid__notice">
        <h2>No open markets right now</h2>
        <p>
          Every market has passed its deadline. New ones appear here as soon as
          they are created.
        </p>
      </div>
    );
  }

  return (
    <div className="market-grid">
      {openMarkets.map((prediction) => (
        <MarketCard
          key={prediction.id}
          prediction={prediction}
          onOpen={openMarket}
        />
      ))}
    </div>
  );
}

export default MarketGrid;

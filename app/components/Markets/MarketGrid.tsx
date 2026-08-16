"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

type StatusFilter = "open" | "resolved" | "all";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

function isOpen(p: HybridPrediction, now: number): boolean {
  return !p.resolved && !p.cancelled && p.deadline > now;
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
  const settled = prediction.resolved || prediction.cancelled;

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
        {prediction.cancelled ? (
          <span className="market-card__time">Cancelled</span>
        ) : prediction.resolved ? (
          <span
            className={`market-card__outcome market-card__outcome--${prediction.outcome ? "yes" : "no"}`}
          >
            {prediction.outcome ? "YES won" : "NO won"}
          </span>
        ) : (
          <span
            className={`market-card__time${time.urgent ? " market-card__time--urgent" : ""}`}
          >
            {time.label}
          </span>
        )}
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
  const { predictions, loading, error, allPredictionsLoaded, fetchAllPredictions } =
    useHybridPredictions();
  const [filter, setFilter] = useState<StatusFilter>("open");

  // The hook loads only open markets by default, so the settled filters would
  // show nothing until the full set is requested.
  useEffect(() => {
    if (filter !== "open" && !allPredictionsLoaded) {
      fetchAllPredictions();
    }
  }, [filter, allPredictionsLoaded, fetchAllPredictions]);

  // Open markets are the right default, but when there are none the page would
  // greet everyone with an empty screen. Fall back to the full history once,
  // after loading settles. A manual choice afterwards is never overridden.
  const autoFellBack = useRef(false);
  useEffect(() => {
    if (loading || autoFellBack.current || filter !== "open") return;
    const now = Math.floor(Date.now() / 1000);
    const hasOpen = (predictions ?? []).some((p) => isOpen(p, now));
    if (!hasOpen) {
      autoFellBack.current = true;
      setFilter("all");
    }
  }, [loading, predictions, filter]);

  const { visible, openCount } = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const all = predictions ?? [];
    const open = all.filter((p) => isOpen(p, now));

    const list =
      filter === "open"
        ? open
        : filter === "resolved"
          ? all.filter((p) => p.resolved || p.cancelled)
          : all;

    // Open markets read best soonest-first; settled ones most-recent-first.
    const sorted = [...list].sort((a, b) =>
      filter === "open" ? a.deadline - b.deadline : b.deadline - a.deadline
    );

    return { visible: sorted, openCount: open.length };
  }, [predictions, filter]);

  const openMarket = (id: string) => router.push(`/prediction/${id}`);

  const filterBar = (
    <div className="market-filter-bar">
      <div className="market-filter" role="group" aria-label="Filter markets">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`market-filter__chip${filter === key ? " market-filter__chip--active" : ""}`}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
            {key === "open" && openCount > 0 && (
              <span className="market-filter__count">{openCount}</span>
            )}
          </button>
        ))}
      </div>
      {openCount === 0 && !loading && (
        <p className="market-filter__hint">
          No markets are open right now — showing past ones.
        </p>
      )}
    </div>
  );

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

  return (
    <>
      {filterBar}

      {visible.length === 0 ? (
        <div className="market-grid__notice">
          <h2>
            {filter === "open"
              ? "No open markets right now"
              : "Nothing here yet"}
          </h2>
          <p>
            {filter === "open"
              ? "Every market has passed its deadline. New ones appear here as soon as they are created."
              : "No markets match this filter."}
          </p>
          {filter === "open" && (
            <button
              type="button"
              className="market-grid__notice-action"
              onClick={() => setFilter("resolved")}
            >
              Browse settled markets
            </button>
          )}
        </div>
      ) : (
        <div className="market-grid">
          {visible.map((prediction) => (
            <MarketCard
              key={prediction.id}
              prediction={prediction}
              onOpen={openMarket}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default MarketGrid;

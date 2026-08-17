"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHybridPredictions } from "@/lib/hooks/useHybridPredictions";
import type { HybridPrediction } from "@/lib/hooks/useHybridPredictions";
import { pageWindow } from "./pageWindow";
import { thumbKindFor, hueFromSeed, initialsFor } from "./marketThumb";
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

/** Divisible by 2, 3 and 4 so the last row is full at every column count. */
const PAGE_SIZE = 24;

function isOpen(p: HybridPrediction, now: number): boolean {
  return !p.resolved && !p.cancelled && p.deadline > now;
}

/**
 * Card thumbnail. Crypto markets store a GeckoTerminal embed URL rather than an
 * image, so those get a chart-styled tile; anything that fails to load falls
 * back to a colour derived from the market id, keeping the grid gap-free.
 */
function MarketThumb({ prediction }: { prediction: HybridPrediction }) {
  const [failed, setFailed] = useState(false);
  const kind = thumbKindFor(prediction.imageUrl);

  if (kind === "image" && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="mgcard__thumb"
        src={prediction.imageUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  if (kind === "chart") {
    return (
      <div className="mgcard__thumb mgcard__thumb--chart" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="20" height="20" role="presentation">
          <polyline
            points="2,24 9,16 15,20 22,8 30,12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  const hue = hueFromSeed(prediction.id);
  return (
    <div
      className="mgcard__thumb mgcard__thumb--generated"
      style={{ background: `hsl(${hue} 55% 28%)`, color: `hsl(${hue} 85% 78%)` }}
      aria-hidden="true"
    >
      {initialsFor(prediction.question || prediction.category || "?")}
    </div>
  );
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
      className="mgcard"
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
      <div className="mgcard__head">
        <MarketThumb prediction={prediction} />
        <h3 className="mgcard__question">{prediction.question}</h3>
      </div>

      <div className="mgcard__odds">
        <div className="mgcard__odds-labels">
          <span className="mgcard__yes">YES {yes}%</span>
          <span className="mgcard__no">NO {no}%</span>
        </div>
        <div className="mgcard__bar" aria-hidden="true">
          <span className="mgcard__bar-yes" style={{ width: `${yes}%` }} />
        </div>
      </div>

      {/* A settled market's numbers are the only thing anyone reads it for, and
          they were being thrown away: the card showed the same "0 ETH · 0
          players" line as a live one, plus a badge. Now the two states carry
          different information, because they answer different questions. */}
      {settled && !prediction.cancelled ? (
        <dl className="mgcard__result">
          <div className="mgcard__result-row">
            <dt>Settled</dt>
            <dd className={prediction.outcome ? "is-yes" : "is-no"}>
              {prediction.outcome ? "YES" : "NO"}
            </dd>
          </div>
          <div className="mgcard__result-row">
            <dt>Winning side</dt>
            <dd>{prediction.outcome ? yes : no}% of the pool</dd>
          </div>
          <div className="mgcard__result-row">
            <dt>Pool</dt>
            <dd>
              {pool} ETH · {prediction.participants?.length ?? 0} player
              {(prediction.participants?.length ?? 0) === 1 ? "" : "s"}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="mgcard__foot">
        {settled && !prediction.cancelled ? null : (
          <>
            <span className="mgcard__stat">{pool} ETH</span>
            <span className="mgcard__dot" aria-hidden="true">·</span>
            <span className="mgcard__stat">
              {prediction.participants?.length ?? 0} players
            </span>
          </>
        )}
        <span className="mgcard__spacer" />
        {prediction.cancelled ? (
          <span className="mgcard__badge">Cancelled</span>
        ) : settled ? (
          <span
            className={`mgcard__badge mgcard__badge--${prediction.outcome ? "yes" : "no"}`}
          >
            {prediction.outcome ? "YES won" : "NO won"}
          </span>
        ) : (
          <span
            className={`mgcard__badge${time.urgent ? " mgcard__badge--urgent" : ""}`}
          >
            {time.label}
          </span>
        )}
      </div>
    </article>
  );
}

export function MarketGrid() {
  const router = useRouter();
  const { predictions, loading, error, allPredictionsLoaded, fetchAllPredictions } =
    useHybridPredictions();
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [page, setPage] = useState(1);

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

    // A settled market nobody bet on has nothing to show: no pool, no players,
    // no result worth reading. Those were filling the grid with empty tiles, so
    // they are dropped from the settled and combined views. Open markets are
    // never dropped for having no players yet - having none is what an open
    // market with room in it looks like.
    const worthShowing = (p: HybridPrediction) =>
      !(p.resolved || p.cancelled) || (p.participants?.length ?? 0) > 0;

    const list =
      filter === "open"
        ? open
        : filter === "resolved"
          ? all.filter((p) => (p.resolved || p.cancelled) && worthShowing(p))
          : all.filter(worthShowing);

    // Open markets read best soonest-first; settled ones most-recent-first.
    const sorted = [...list].sort((a, b) =>
      filter === "open" ? a.deadline - b.deadline : b.deadline - a.deadline
    );

    return { visible: sorted, openCount: open.length };
  }, [predictions, filter]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  // Clamp rather than reset: if the list shrinks under us (a background refresh,
  // a filter change) the current page can fall past the end.
  const currentPage = Math.min(page, pageCount);
  const pageItems = visible.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const goToPage = (next: number) => {
    setPage(next);
    // A new page of cards replaces the viewport contents; without this you land
    // mid-list looking at row four.
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

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
            onClick={() => {
              setFilter(key);
              setPage(1);
            }}
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
          <div key={i} className="mgcard mgcard--skeleton" />
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
        <>
          <div className="market-grid">
            {pageItems.map((prediction) => (
              <MarketCard
                key={prediction.id}
                prediction={prediction}
                onOpen={openMarket}
              />
            ))}
          </div>

          {pageCount > 1 && (
            <nav className="market-pagination" aria-label="Market pages">
              <button
                type="button"
                className="market-pagination__step"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                ‹
              </button>

              {pageWindow(currentPage, pageCount).map((p, i) =>
                p === null ? (
                  <span key={`gap-${i}`} className="market-pagination__gap">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={`market-pagination__page${p === currentPage ? " market-pagination__page--active" : ""}`}
                    aria-current={p === currentPage ? "page" : undefined}
                    onClick={() => goToPage(p)}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                type="button"
                className="market-pagination__step"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === pageCount}
                aria-label="Next page"
              >
                ›
              </button>

              <span className="market-pagination__summary">
                {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, visible.length)} of{" "}
                {visible.length}
              </span>
            </nav>
          )}
        </>
      )}
    </>
  );
}

export default MarketGrid;

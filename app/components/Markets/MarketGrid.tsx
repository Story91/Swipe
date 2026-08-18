"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHybridPredictions } from "@/lib/hooks/useHybridPredictions";
import type { HybridPrediction } from "@/lib/hooks/useHybridPredictions";
import { useActiveChain } from "@/lib/chains/activeChain";
import { CHAINS } from "@/lib/chains";
import type { ChainKey } from "@/lib/chains/types";
import { chainMark } from "../Wallet/ChainSwitcher";
import type { RedisPrediction } from "@/lib/types/redis";
import {
  COLLATERAL_LEG,
  tokenMarket,
  tokenSymbol,
  toDisplayUnits,
  type StakeToken,
} from "@/lib/userStake";
import { pageWindow } from "./pageWindow";
import { thumbKindFor, hueFromSeed, initialsFor } from "./marketThumb";
import type { ThumbKind } from "./marketThumb";
import { Sparkline } from "./Sparkline";
import type { SparkPoint } from "./sparklinePath";
import { usePriceHistories } from "./usePriceHistories";
import "./MarketGrid.css";

/**
 * Desktop browse view: every open market at once.
 *
 * Presentational by design. A card links through to /prediction/[id], where the
 * existing staking flow lives. Keeping betting out of the grid means there is
 * exactly one implementation of it. If inline betting is wanted later, the card
 * gains a control that calls the same flow; nothing here needs rewriting.
 */

/**
 * A pool in the units a person reads, with no symbol attached.
 *
 * Two decimals, not three. This used to divide by 1e18 and print three places,
 * which is the right shape for ETH and the wrong one for a dollar: the live
 * pools are collateral, and 0.001 of a dollar is not a figure anyone acts on.
 */
function formatPool(units: number): string {
  if (units <= 0) return "0";
  if (units < 0.01) return "<0.01";
  if (units >= 1000) return `${(units / 1000).toFixed(1)}k`;
  return units.toFixed(2);
}

/**
 * How many people are actually in this market.
 *
 * `participants` is the V2 array, written by the ETH and SWIPE sync. A market
 * on the live contract gets `usdcParticipants` instead, so counting the old
 * array reports zero players on every market anyone is currently betting in,
 * and drops settled collateral markets out of the filters below for looking
 * empty. Same precedent as adminMarkets.ts and /prediction/[id].
 */
function playerCount(p: HybridPrediction): number {
  return (
    p.usdcParticipants?.length ??
    p.usdcParticipantCount ??
    p.participants?.length ??
    0
  );
}

/**
 * Which pool a card is about, and how the two sides split it.
 *
 * The card read `yesTotalAmount` and `noTotalAmount`, which are the ETH pools
 * on the archived contracts. They are zero on every market opened since, so a
 * live card computed 0 percent YES, took 100 minus that, and told the reader
 * the whole crowd was on NO. Nobody was on either side.
 *
 * tokenMarket in lib/userStake is the one place that knows which pair of
 * fields belongs to which token, so the pair comes from there. Collateral is
 * the default because it is the only leg taking bets. ETH is the fallback
 * rather than gone, because an archived market really did have an ETH pool and
 * blanking it would erase the only numbers a settled card is read for.
 *
 * An empty pool returns no split at all. Zero staked is not fifty fifty, and it
 * is not a landslide either.
 */
function cardPool(prediction: HybridPrediction, chainKey: ChainKey) {
  // HybridPrediction is the UI's own shape rather than the stored one, and
  // tokenMarket is typed against the stored one. It carries every field read
  // for the collateral leg; the ones it does not carry (usdcResolved and its
  // pair) are optional there and fall back to the shared flags, which is what
  // this card was already showing.
  const stored = prediction as unknown as RedisPrediction;

  const collateral = tokenMarket(stored, COLLATERAL_LEG);
  const collateralRaw = collateral.yesPool + collateral.noPool;
  const eth = tokenMarket(stored, "ETH");
  const ethRaw = eth.yesPool + eth.noPool;

  const token: StakeToken = collateralRaw > 0 || ethRaw === 0 ? COLLATERAL_LEG : "ETH";
  const market = token === COLLATERAL_LEG ? collateral : eth;

  const yesUnits = toDisplayUnits(market.yesPool, token);
  const noUnits = toDisplayUnits(market.noPool, token);
  const total = yesUnits + noUnits;

  return {
    symbol: tokenSymbol(token, chainKey),
    total,
    hasPool: total > 0,
    yes: total > 0 ? Math.round((yesUnits / total) * 100) : 0,
    no: total > 0 ? 100 - Math.round((yesUnits / total) * 100) : 0,
  };
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

/**
 * Display heuristic, nothing more. Nothing on HybridPrediction says a market is
 * busy, and player count is the closest honest reading of it. Eight is where a
 * market stops looking like its creator and three friends.
 */
const HOT_PLAYER_THRESHOLD = 8;

function isOpen(p: HybridPrediction, now: number): boolean {
  return !p.resolved && !p.cancelled && p.deadline > now;
}

/**
 * The card's ground.
 *
 * The market's picture used to be a tile on the category row, 42px once and
 * 22px after that, which is too small to tell one upload from another, the one
 * thing a picture is on the card for. It is the card's own background now: full
 * bleed, blurred, and under a scrim heavy enough that the text on top does not
 * care what was uploaded.
 *
 * Crypto markets store a GeckoTerminal embed URL rather than an image, and
 * plenty of markets have no picture at all. Both get a drawn ground rather than
 * a hole, so a card without a photo still looks like something someone chose.
 *
 * A card without a photo gets its own odds line in place of that mark, once the
 * page's histories arrive. A card with a photo keeps the photo, and gets no
 * line. Under the scrim, which runs to 0.84 over an upload, a line is a sixth
 * of itself and reads as a scratch on the picture. Above the scrim it is a
 * bright stroke crossing the foot row, and the note over .mgcard__bg::after is
 * explicit that every bright thing tried on top of a photo took the card's
 * quiet text under contrast. Neither is worth a chart nobody can read.
 */
function MarketGround({
  prediction,
  kind,
  history,
  onImageError,
}: {
  prediction: HybridPrediction;
  kind: ThumbKind;
  history: SparkPoint[] | undefined;
  onImageError: () => void;
}) {
  if (kind === "image") {
    return (
      <div className="mgcard__bg" aria-hidden="true">
        {/* A real <img>, not a CSS background-image. onError is the only
            detector there is for a 404 or a hotlink block on a user-supplied
            URL, and background-image has no equivalent. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="mgcard__bg-img"
          src={prediction.imageUrl}
          alt=""
          loading="lazy"
          onError={onImageError}
        />
      </div>
    );
  }

  // A line only when there is a line to draw: two readings or more. The first
  // version rendered the degenerate shapes too - "no odds recorded yet" as a
  // dashed rule, one reading as a dot - each with an explanatory caption. The
  // adversarial review measured that caption at 1.53-2.86:1 under the scrim,
  // unreadable at every hue, and against live Redis seven of the first eight
  // markets had no history at all: nearly every card traded its art for an
  // apology nobody could read. A card without enough data keeps its art, which
  // was already honest about having nothing to chart.
  if (history && history.length >= 2) {
    return (
      <div className="mgcard__bg" aria-hidden="true">
        <Sparkline history={history} />
      </div>
    );
  }

  if (kind === "chart") {
    return (
      <div className="mgcard__bg" aria-hidden="true">
        <svg className="mgcard__bg-mark" viewBox="0 0 32 32" role="presentation">
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

  return (
    <div className="mgcard__bg" aria-hidden="true">
      <span className="mgcard__bg-initials">
        {initialsFor(prediction.question || prediction.category || "?")}
      </span>
    </div>
  );
}

function MarketCard({
  prediction,
  chainKey,
  history,
  onOpen,
}: {
  prediction: HybridPrediction;
  chainKey: ChainKey;
  history: SparkPoint[] | undefined;
  onOpen: (id: string) => void;
}) {
  const { symbol, total, hasPool, yes, no } = cardPool(prediction, chainKey);
  // The grid is per-chain, so every card on this screen settles on the same
  // network. The mark and the border tint are still per card: a screenshot of
  // one tile has to say which network and collateral it settles in without the
  // nav in frame. chainMark is the networks' own artwork, same source as the
  // switcher, because a wrong mark beside a market reads as official.
  const mark = chainMark(chainKey);
  const chainLabel = CHAINS[chainKey].label;
  const time = formatTimeLeft(prediction.deadline);
  const pool = formatPool(total);
  const settled = prediction.resolved || prediction.cancelled;
  const players = playerCount(prediction);
  const hot = !settled && players >= HOT_PLAYER_THRESHOLD;

  // A dead image URL falls back to the drawn ground rather than leaving the
  // card blank, same as the tile used to.
  const [imageFailed, setImageFailed] = useState(false);
  const declared = thumbKindFor(prediction.imageUrl);
  const kind: ThumbKind =
    declared === "image" && imageFailed ? "generated" : declared;

  // Fed to the stylesheet rather than set as a background here, so the scrim,
  // the mark colour and the ground stay in one file. hueFromSeed is stable per
  // market, so a given card is the same colour on every reload.
  const hue = hueFromSeed(prediction.id);
  const ground = {
    chart: {
      "--mgcard-ground":
        "radial-gradient(120% 90% at 12% 0%, #16240a 0%, #0b0b0b 72%)",
    },
    generated: {
      "--mgcard-ground": `linear-gradient(135deg, hsl(${hue} 45% 16%), hsl(${hue} 50% 8%))`,
      "--mgcard-mark": `hsl(${hue} 62% 64%)`,
    },
    image: undefined,
  }[kind] as React.CSSProperties | undefined;

  return (
    <article
      // Only a photo gets the heavy scrim. The two drawn grounds are already
      // dark and controlled, and burying them under 0.9 of black would make
      // every one of them the same card.
      className={`mgcard mgcard--chain-${chainKey}${kind === "image" ? " mgcard--photo" : ""}${
        kind !== "image" && (history?.length ?? 0) >= 2 ? " mgcard--spark" : ""
      }`}
      style={ground}
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
      <MarketGround
        prediction={prediction}
        kind={kind}
        history={history}
        onImageError={() => setImageFailed(true)}
      />

      <div className="mgcard__cat">
        <span className="mgcard__cat-name">{prediction.category || "Market"}</span>
        {hot && <span className="mgcard__flag">Hot</span>}
        <span className="mgcard__chain" title={`Settles on ${chainLabel}`}>
          {mark.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="mgcard__chain-mark" src={mark.src} alt="" />
          ) : (
            <span
              className="mgcard__chain-mark mgcard__chain-mark--letter"
              aria-hidden="true"
            >
              {mark.letter}
            </span>
          )}
          {chainLabel}
        </span>
      </div>

      {/* The title attribute is the clamped tail: the question is cut at two
          lines now, so hovering has to be able to finish the sentence. */}
      <h3 className="mgcard__question" title={prediction.question}>
        {prediction.question}
      </h3>

      {/* No pool, no split. Printing "Yes 0% / No 100%" over an empty market
          claims a crowd that has not turned up, and a 50/50 fallback claims a
          disagreement nobody is having. */}
      {hasPool ? (
        <div className="mgcard__odds">
          <div className="mgcard__side">
            <span className="mgcard__side-pill mgcard__side-pill--yes">Yes</span>
            <span className="mgcard__side-pct">{yes}%</span>
          </div>
          <div className="mgcard__side">
            <span className="mgcard__side-pill mgcard__side-pill--no">No</span>
            <span className="mgcard__side-pct">{no}%</span>
          </div>
          <div className="mgcard__bar" aria-hidden="true">
            <span className="mgcard__bar-yes" style={{ width: `${yes}%` }} />
          </div>
        </div>
      ) : (
        <p className="mgcard__odds mgcard__odds--empty">
          {settled ? "Nobody bet on this one" : "No bets yet, be first"}
        </p>
      )}

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
          {hasPool && (
            <div className="mgcard__result-row">
              <dt>Winning side</dt>
              <dd>{prediction.outcome ? yes : no}% of the pool</dd>
            </div>
          )}
          <div className="mgcard__result-row">
            <dt>Pool</dt>
            <dd>
              {hasPool ? `${pool} ${symbol}` : "nothing staked"} · {players}{" "}
              player{players === 1 ? "" : "s"}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="mgcard__foot">
        {settled && !prediction.cancelled ? null : (
          <>
            <span className="mgcard__stat">
              {hasPool ? `${pool} ${symbol}` : "no pool yet"}
            </span>
            <span className="mgcard__dot" aria-hidden="true">·</span>
            <span className="mgcard__stat">{players} players</span>
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
  const { chainKey } = useActiveChain();
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
      !(p.resolved || p.cancelled) || playerCount(p) > 0;

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

  // One request for the whole page, refetched when the page or the chain
  // changes. The lines land in .mgcard__bg, which is out of flow and sized off
  // the card, so a card that gets its history a second after paint does not
  // move a pixel of anything around it.
  //
  // The lookup below is by the id the grid holds. The route answers with the
  // canonical id, which is the same string for every market Redis has written
  // since ids were canonicalised. Anything that ever fell out of step misses
  // the map and keeps its mark, which is the right way round to be wrong.
  const histories = usePriceHistories(
    pageItems.map((p) => p.id),
    chainKey
  );

  const goToPage = (next: number) => {
    setPage(next);
    // A new page of cards replaces the viewport contents; without this you land
    // mid-list looking at row four.
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  /**
   * The chain travels with the link.
   *
   * Both deployments number their markets from 1, so /prediction/5 on its own
   * is two different questions. The market page reads ?chain= and switches the
   * app to it, which also means the back button lands somewhere consistent.
   */
  const openMarket = (id: string) => router.push(`/prediction/${id}?chain=${chainKey}`);

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
          No markets are open right now, showing past ones.
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
                chainKey={chainKey}
                history={histories.get(prediction.id)}
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
                {(currentPage - 1) * PAGE_SIZE + 1} to{" "}
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

"use client";

import { useEffect, useState } from "react";
import { MAX_BATCH_IDS } from "@/lib/priceHistoryBatch";
import type { SparkPoint } from "./sparklinePath";

/**
 * The odds history for one page of cards, in one request.
 *
 * One fetch per page of ids, never one per card. The list is joined into a
 * string and that string is the effect's dependency, so a background refresh
 * that hands back an equal set of markets does not refetch, and paging or
 * switching chain does.
 *
 * A market is in the returned map only when the server actually answered for
 * it. That is the difference between "no history" and "no answer yet", and the
 * card needs it: an id that is absent keeps its glyph, an id present with an
 * empty array draws the empty state. A failed request leaves the map empty, so
 * the whole page keeps its glyphs rather than claiming 24 quiet markets.
 */

const EMPTY: ReadonlyMap<string, SparkPoint[]> = new Map();

export function usePriceHistories(
  ids: readonly string[],
  chainKey: string
): ReadonlyMap<string, SparkPoint[]> {
  // The grid pages at 24 and the route caps at 50, so this slice never bites.
  // It is here so that a future denser page fails by drawing fewer lines rather
  // than by having the whole request rejected.
  const idKey = ids.slice(0, MAX_BATCH_IDS).join(",");
  const [state, setState] = useState<{
    key: string;
    map: ReadonlyMap<string, SparkPoint[]>;
  }>({ key: "", map: EMPTY });

  useEffect(() => {
    if (!idKey) return;

    const controller = new AbortController();
    const key = `${chainKey}:${idKey}`;

    fetch(
      `/api/predictions/price-history/batch?ids=${encodeURIComponent(idKey)}&chain=${encodeURIComponent(chainKey)}`,
      { signal: controller.signal }
    )
      .then((res) => res.json())
      .then((payload) => {
        if (controller.signal.aborted) return;
        const rows = payload?.success ? payload?.data?.histories : null;
        if (!Array.isArray(rows)) return;

        const map = new Map<string, SparkPoint[]>();
        for (const row of rows) {
          if (!row || typeof row.predictionId !== "string") continue;
          map.set(row.predictionId, Array.isArray(row.history) ? row.history : []);
        }
        setState({ key, map });
      })
      .catch(() => {
        // Includes the abort on unmount. Nothing to report on the card: no
        // answer means the glyph stays, which is what it looks like now.
      });

    return () => controller.abort();
  }, [idKey, chainKey]);

  // Lines from the previous page must never sit under this page's cards, and
  // the ids are unique per market, so a stale map is dropped rather than read.
  return state.key === `${chainKey}:${idKey}` ? state.map : EMPTY;
}

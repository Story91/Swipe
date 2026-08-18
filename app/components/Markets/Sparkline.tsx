"use client";

import React, { useMemo } from "react";
import {
  sparklineGeometry,
  sparklineNote,
  SPARK_WIDTH,
  SPARK_HEIGHT,
} from "./sparklinePath";
import type { SparkPoint } from "./sparklinePath";

/**
 * The card's own odds line.
 *
 * Inline SVG, no charting library. recharts is already in the bundle for the
 * detail page, but it mounts a ResponsiveContainer and a resize observer per
 * chart, and this renders 24 at a time behind other content. A path string is
 * the whole job.
 *
 * It draws inside .mgcard__bg, under the scrim, where the big initials or the
 * chart glyph used to sit. That layer is aria-hidden and this stays that way:
 * every number on this line is already on the card as text, in .mgcard__odds,
 * so a screen reader loses a picture and no information. The caption is the one
 * thing not repeated elsewhere, and it is a caption about a picture.
 */
export function Sparkline({ history }: { history: readonly SparkPoint[] }) {
  const geometry = useMemo(() => sparklineGeometry(history), [history]);
  const note = sparklineNote(geometry);

  return (
    <div className={`mgcard__spark mgcard__spark--${geometry.kind}`}>
      {/* No caption. The one this rendered measured 1.53-2.86:1 under the
          scrim, unreadable at every hue, and the shapes that needed explaining
          (empty, single) no longer reach the card at all - MarketGround only
          mounts this with two readings or more. A real line explains itself;
          the numbers it summarises are printed on the card in full. */}

      <svg
        className="mgcard__spark-svg"
        viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
        // The box is far wider than it is tall on the card, and the line should
        // fill it rather than sit in a letterboxed square. Every stroke below
        // carries vector-effect so the stretch does not thin or fatten it.
        preserveAspectRatio="none"
        role="presentation"
        focusable="false"
      >
        {geometry.kind === "empty" && (
          <path
            className="mgcard__spark-rule"
            d={`M ${geometry.left} ${geometry.baselineY} L ${geometry.right} ${geometry.baselineY}`}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {geometry.area && (
          <path className="mgcard__spark-area" d={geometry.area} />
        )}

        {geometry.d && (
          <path
            className="mgcard__spark-line"
            d={geometry.d}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* The newest reading. A zero length subpath with a round cap, not a
            circle: a circle in a stretched viewBox comes out an ellipse. */}
        {geometry.kind !== "empty" && (
          <path
            className="mgcard__spark-dot"
            d={`M ${geometry.lastX} ${geometry.lastY} L ${geometry.lastX} ${geometry.lastY}`}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}

export default Sparkline;

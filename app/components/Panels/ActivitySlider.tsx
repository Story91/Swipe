'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { StakeToken } from '@/lib/userStake';
import {
  activityLine,
  advance,
  MAX_FRAME_SECONDS,
  timeAgo,
  wrapOffset,
  type ActivityItem,
} from './panelFormat';
import { usePrefersReducedMotion } from './useCountUp';

/**
 * The recent activity feed, as a slider.
 *
 * It carries itself along at a walking pace, stops when a pointer is over it or
 * a keyboard lands in it, and can be thrown either way by finger or mouse.
 *
 * THE TWO THINGS THAT MAKE IT SAFE
 *
 * The viewport clips. The track is wider than the page by design, and if it
 * were ever allowed to size its parent the whole document would gain a
 * horizontal scrollbar, which on a phone means every screen in the app can be
 * dragged sideways off its own layout. `overflow: hidden` plus `min-width: 0`
 * on every ancestor box is what stops that, and the track is measured with
 * offsetWidth rather than given a width.
 *
 * The items appear exactly twice. The loop wraps at the width of one copy, so
 * the moment copy one leaves the left edge copy two is standing in the position
 * it started from and there is nothing to see. Wrapping at any other fraction
 * of the track is the seam bug: the reader watches the list jump back to the
 * start mid stride.
 *
 * A track that is not wider than its viewport does not loop at all. Three cards
 * on a desktop have nowhere to scroll to, so they sit still rather than sliding
 * a gap into view.
 */

/** Pixels per second. Slow enough to read a card without chasing it. */
const AUTO_SPEED = 26;

/** A throw decays to nothing over about a second. */
const FLICK_TAU = 0.35;
const FLICK_MAX = 1600;

export function ActivitySlider({
  items,
  symbolFor,
  label,
}: {
  items: readonly ActivityItem[];
  symbolFor: (token: StakeToken) => string;
  label: string;
}) {
  const reduced = usePrefersReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);

  const [metrics, setMetrics] = useState({ span: 0, viewport: 0 });
  const [dragging, setDragging] = useState(false);

  // Loop state lives in refs. It is written on every animation frame, and a
  // state update per frame would re-render the whole feed sixty times a second
  // to move one transform.
  const offset = useRef(0);
  const flick = useRef(0);
  const lastFrame = useRef(0);
  const span = useRef(0);
  const isDragging = useRef(false);
  const isPaused = useRef(false);
  const dragFrom = useRef(0);
  const dragOffset = useRef(0);
  const pointerAt = useRef(0);
  const pointerX = useRef(0);

  const loops = !reduced && metrics.span > 0 && metrics.span > metrics.viewport;

  // Measure one copy and the window it runs behind. Both are needed: the width
  // of a copy is where the loop wraps, and the width of the viewport is what
  // decides whether there is anything to loop.
  useEffect(() => {
    const copy = copyRef.current;
    const viewport = viewportRef.current;
    if (!copy || !viewport) return;

    const measure = () => {
      const next = { span: copy.offsetWidth, viewport: viewport.clientWidth };
      setMetrics((current) =>
        current.span === next.span && current.viewport === next.viewport ? current : next
      );
      span.current = next.span;
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(copy);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [items]);

  const paint = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    if (span.current > 0) offset.current = wrapOffset(offset.current, span.current);
    track.style.transform = `translate3d(${offset.current}px, 0, 0)`;
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!loops) {
      // Back to the start, and no inline transform left behind. A parked track
      // with a stale offset would hide its own first card.
      offset.current = 0;
      flick.current = 0;
      if (track) track.style.transform = '';
      return;
    }

    let raf = 0;
    const frame = (at: number) => {
      const dt = lastFrame.current ? (at - lastFrame.current) / 1000 : 0;
      lastFrame.current = at;

      if (!isPaused.current && !isDragging.current && dt > 0) {
        // A throw is a temporary change to the speed, not a separate motion, so
        // the slider never stops and restarts around it.
        offset.current = advance(offset.current, AUTO_SPEED - flick.current, dt);
        flick.current *= Math.exp(-Math.min(dt, MAX_FRAME_SECONDS) / FLICK_TAU);
        if (Math.abs(flick.current) < 1) flick.current = 0;
        paint();
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      lastFrame.current = 0;
    };
  }, [loops, paint]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!loops) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    isDragging.current = true;
    setDragging(true);
    dragFrom.current = event.clientX;
    dragOffset.current = offset.current;
    pointerX.current = event.clientX;
    pointerAt.current = performance.now();
    flick.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const at = performance.now();
    const dt = (at - pointerAt.current) / 1000;
    if (dt > 0) {
      const velocity = (event.clientX - pointerX.current) / dt;
      // Smoothed, so one jittery sample at the end of a drag does not become
      // the whole throw.
      flick.current = flick.current * 0.6 + velocity * 0.4;
    }
    pointerX.current = event.clientX;
    pointerAt.current = at;
    offset.current = dragOffset.current + (event.clientX - dragFrom.current);
    paint();
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setDragging(false);
    flick.current = Math.max(-FLICK_MAX, Math.min(FLICK_MAX, flick.current));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // Ages the timestamps without re-reading anything. A card that says "just
  // now" ten minutes later is a small lie the panel can avoid telling.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const cards = (copy: number) =>
    items.map((item) => (
      <ActivityCard key={`${copy}-${item.id}`} item={item} symbolFor={symbolFor} now={now} />
    ));

  return (
    <div
      ref={viewportRef}
      className={[
        'pp-slider',
        loops ? 'pp-slider--loops' : 'pp-slider--parked',
        dragging ? 'pp-slider--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="group"
      aria-label={label}
      tabIndex={0}
      onPointerEnter={() => {
        isPaused.current = true;
      }}
      onPointerLeave={() => {
        isPaused.current = false;
      }}
      onFocusCapture={() => {
        isPaused.current = true;
      }}
      onBlurCapture={() => {
        isPaused.current = false;
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div ref={trackRef} className="pp-slider__track">
        <div ref={copyRef} className="pp-slider__copy">
          {cards(1)}
        </div>
        {/* Exactly one duplicate, and only while the loop is running. Read by
            nobody: the same rows twice in a screen reader is noise. */}
        {loops && (
          <div className="pp-slider__copy" aria-hidden="true">
            {cards(2)}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityCard({
  item,
  symbolFor,
  now,
}: {
  item: ActivityItem;
  symbolFor: (token: StakeToken) => string;
  now: number;
}) {
  const line = activityLine(item, symbolFor);

  return (
    <article className="pp-act">
      <header className="pp-act__head">
        <span className="pp-act__avatar" aria-hidden="true">
          {line.avatar || '·'}
        </span>
        <span className="pp-act__who">{line.who}</span>
        <time className="pp-act__when" dateTime={new Date(item.timestamp).toISOString()}>
          {timeAgo(item.timestamp, now)}
        </time>
      </header>

      <p className="pp-act__deed">
        <span className="pp-act__verb">{line.verb}</span>
        {line.side && (
          <span className={`pp-act__side pp-act__side--${line.side.toLowerCase()}`}>
            {line.side}
          </span>
        )}
        {/* Only when the route sent a figure. A row that invents an amount is
            worse than a row without one. */}
        {line.amount && <span className="pp-act__amount">{line.amount}</span>}
      </p>

      {line.market && <p className="pp-act__market">{line.market}</p>}
    </article>
  );
}

export default ActivitySlider;

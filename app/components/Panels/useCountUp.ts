'use client';

import { useEffect, useRef, useState } from 'react';
import { countUpValue } from './panelFormat';

/**
 * Whether the reader has asked for less motion.
 *
 * A hook rather than a media query, because the two things the strip animates
 * in JavaScript, the counters and the activity slider, run on animation frames
 * and cannot be switched off from a stylesheet. The CSS half is handled in the
 * reduce block at the bottom of ProductPanels.css.
 *
 * Starts false and corrects after mount. The server has no matchMedia, and a
 * hook that guessed would hand back a different first render than the client
 * produced.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

const DURATION_MS = 900;

/**
 * A number that runs up to its value once, when the value first becomes real.
 *
 * `ready` is the gate rather than mount, because every figure on this strip
 * arrives from a fetch. Counting up from zero while the request is still in
 * flight would animate a number nobody has read yet, and land on zero when the
 * request fails.
 *
 * It runs again if the value changes, which is the switcher moving to another
 * chain. That is the same event, one chain later, and a figure that silently
 * swapped itself would be the quieter bug.
 */
export function useCountUp(target: number, ready: boolean, decimals = 0): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!ready) {
      setValue(0);
      return;
    }
    if (reduced || !Number.isFinite(target) || target === 0) {
      setValue(Number.isFinite(target) ? target : 0);
      return;
    }

    const started = performance.now();
    const step = (at: number) => {
      const t = (at - started) / DURATION_MS;
      setValue(countUpValue(target, t, decimals));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [target, ready, decimals, reduced]);

  return value;
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useMotionValue,
  useMotionTemplate,
  useAnimationFrame,
  useReducedMotion,
  type MotionValue,
} from 'framer-motion';
import {
  RETURN,
  DOCK,
  COMMIT,
  THRESHOLD,
  MAX_DT,
  deadzone,
  geometry,
  rotationFor,
  tintFor,
  velocityFromHistory,
  stepAxis,
  isSettled,
  decideNeutralRelease,
  decideArmedRelease,
  applyArmedWall,
  type Axis,
  type Sample,
  type SpringPreset,
  type Geometry,
  type Direction,
} from '../gesture/swipePhysics';

/**
 * The swipe gesture, as a hook.
 *
 * Replaces react-tinder-card, which reports only a final direction and so has
 * no position or velocity for a two-stage gesture to be built on.
 *
 * The physics lives in lib/gesture/swipePhysics.ts and is unit-tested there.
 * This file is the part that cannot be: pointer plumbing, the frame loop, and
 * the small amount of React state that the UI genuinely needs to re-render on.
 *
 * Design rules that are load-bearing:
 *
 * 1. Position never enters React state. x and rotation are motion values
 *    written straight to the compositor; the only setState calls are the
 *    edge-triggered stage and threshold changes, at most a couple per gesture.
 * 2. The transform goes on the WRAPPER, never on `.card`. `.card` carries
 *    `transition: all`, a `:hover` translate, an `:active` scale and an
 *    entrance animation, every one of which would fight a per-frame transform.
 * 3. Sizes come from offsetWidth/offsetHeight, never getBoundingClientRect,
 *    because the card is rotated while dragging and a rotated rect is wider
 *    than the card.
 * 4. The loop sleeps. Once every axis has settled the frame callback returns
 *    immediately instead of integrating a spring that has already arrived.
 * 5. Nothing touches window, navigator or performance at module scope, so this
 *    survives server rendering.
 *
 * What this hook deliberately does NOT do: decide anything about money. It
 * reports that a direction was committed. Amounts, minimums, self-bet checks
 * and the address guard all stay where they are, on the other side of the
 * callback.
 */

export type Stage = 'neutral' | 'armed' | 'committed';
export type SwipeDir = 'left' | 'right';

const dirToSide = (dir: Direction): SwipeDir => (dir > 0 ? 'right' : 'left');

type Mode = 'resting' | 'dragging' | 'return' | 'dock' | 'commit';

const PRESET: Record<Exclude<Mode, 'resting' | 'dragging'>, SpringPreset> = {
  return: RETURN,
  dock: DOCK,
  commit: COMMIT,
};

/** Haptics, where they exist. iOS Safari has no vibrate; that is not an error. */
function vibrate(pattern: number | number[]) {
  if (typeof navigator === 'undefined') return;
  if (!('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* a refused vibration is not worth a console entry */
  }
}

export interface UseSwipeGestureOptions {
  /** When false the card is completely inert: no pointer handling, no motion. */
  enabled?: boolean;
  /** Both stages, or a single past-threshold release straight to commit. */
  twoStage?: boolean;
  /** Fires when the card docks into the armed position. */
  onArm?: (dir: SwipeDir) => void;
  /** Fires when the user disarms without committing. */
  onCancel?: () => void;
  /** Fires at release, before the card has finished leaving. */
  onCommit?: (dir: SwipeDir) => void;
  /** Fires once the card is past the point of being visible. */
  onExit?: (dir: SwipeDir) => void;
  /** Edge-triggered as the card crosses the arm threshold during a drag. */
  onThresholdCross?: (dir: SwipeDir | null) => void;
}

export interface SwipeGesture {
  /**
   * Put this on the element that carries the transform.
   *
   * MutableRefObject rather than RefObject: React 18's RefObject is readonly,
   * so the readonly form is not assignable to a `ref` prop.
   */
  wrapperRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Put this on the measured card element inside the wrapper. */
  cardRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Spread onto the wrapper. */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  /** Single composed transform string for the wrapper. */
  transform: MotionValue<string>;
  x: MotionValue<number>;
  rotate: MotionValue<number>;
  /** 0..1 side wash opacities. */
  tintYes: MotionValue<number>;
  tintNo: MotionValue<number>;
  stage: Stage;
  armedDir: SwipeDir | null;
  /** Zero-velocity entry points, for buttons and keyboard. */
  arm: (dir: SwipeDir) => void;
  commit: () => void;
  cancel: () => void;
  /** Return the card to centre and neutral. Safe after unmount. */
  restore: () => Promise<void>;
}

export function useSwipeGesture(
  options: UseSwipeGestureOptions = {}
): SwipeGesture {
  const {
    enabled = true,
    twoStage = false,
    onArm,
    onCancel,
    onCommit,
    onExit,
    onThresholdCross,
  } = options;

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const x = useMotionValue(0);
  const rotate = useMotionValue(0);
  const tintYes = useMotionValue(0);
  const tintNo = useMotionValue(0);
  const transform = useMotionTemplate`translate3d(${x}px, 0px, 0px) rotate(${rotate}deg)`;

  const [stage, setStage] = useState<Stage>('neutral');
  const [armedDir, setArmedDir] = useState<SwipeDir | null>(null);

  const prefersReducedMotion = useReducedMotion();

  // Everything the frame loop touches lives in refs: writing any of it to state
  // would re-render the card sixty times a second.
  const axis = useRef<Axis>({ pos: 0, vel: 0, target: 0 });
  const mode = useRef<Mode>('resting');
  const stageRef = useRef<Stage>('neutral');
  const dirRef = useRef<Direction | null>(null);
  const pointerId = useRef<number | null>(null);
  const history = useRef<Sample[]>([]);
  const grabPointerX = useRef(0);
  const grabPos = useRef(0);
  const armedAt = useRef(0);
  const rawOutward = useRef(0);
  const crossed = useRef<SwipeDir | null>(null);
  const geo = useRef<Geometry>(geometry(280, 380));
  const cardWidth = useRef(280);
  const mounted = useRef(true);
  const restoreResolvers = useRef<Array<() => void>>([]);

  // Callbacks are read through a ref so the frame loop and pointer handlers
  // never need to be rebuilt when a parent re-renders with new closures.
  const cb = useRef({ onArm, onCancel, onCommit, onExit, onThresholdCross });
  cb.current = { onArm, onCancel, onCommit, onExit, onThresholdCross };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Anything waiting on restore() must not hang once we are gone.
      restoreResolvers.current.splice(0).forEach(resolve => resolve());
    };
  }, []);

  /* ------------------------------------------------------------ measuring */

  const measure = useCallback(() => {
    const card = cardRef.current;
    const stageEl = wrapperRef.current?.parentElement;
    if (!card) return;

    // offsetWidth, not getBoundingClientRect: the card is rotated mid-drag and
    // a rotated rect reports the bounding box, which is wider than the card.
    const cw = card.offsetWidth || 280;
    const sw = stageEl?.clientWidth || cw + 100;

    cardWidth.current = cw;
    geo.current = geometry(cw, sw);
  }, []);

  useEffect(() => {
    measure();

    const target = wrapperRef.current?.parentElement ?? wrapperRef.current;
    if (!target || typeof ResizeObserver === 'undefined') return;

    // A ResizeObserver rather than a window resize listener: the card also
    // changes size when the desktop side rails mount, when grid mode toggles,
    // and on the landscape rule that turns the container into a row.
    const ro = new ResizeObserver(() => measure());
    ro.observe(target);
    return () => ro.disconnect();
  }, [measure]);

  /* --------------------------------------------------------------- render */

  const paint = useCallback(() => {
    const pos = axis.current.pos;
    x.set(pos);
    rotate.set(rotationFor(pos));

    const t = tintFor(pos, geo.current.tintRange);
    // Explicitly zero the other side. The prototype leaks a stale tint here
    // because it only ever writes the active one.
    tintYes.set(pos > 0 ? t : 0);
    tintNo.set(pos < 0 ? t : 0);
  }, [x, rotate, tintYes, tintNo]);

  const setMotion = useCallback(
    (next: Mode, target: number, velocity: number) => {
      axis.current.target = target;
      axis.current.vel = velocity;
      mode.current = next;
    },
    []
  );

  const settleNow = useCallback(() => {
    axis.current.pos = axis.current.target;
    axis.current.vel = 0;
    mode.current = 'resting';
    paint();
    restoreResolvers.current.splice(0).forEach(resolve => resolve());
  }, [paint]);

  /* ------------------------------------------------------ state machine */

  const goNeutral = useCallback(() => {
    stageRef.current = 'neutral';
    dirRef.current = null;
    if (mounted.current) {
      setStage('neutral');
      setArmedDir(null);
    }
  }, []);

  const armInternal = useCallback(
    (dir: Direction, velocity: number) => {
      stageRef.current = 'armed';
      dirRef.current = dir;
      armedAt.current = typeof performance !== 'undefined' ? performance.now() : 0;
      rawOutward.current = 0;

      if (mounted.current) {
        setStage('armed');
        setArmedDir(dirToSide(dir));
      }

      vibrate(12);
      setMotion('dock', dir * geo.current.dock, velocity);
      cb.current.onArm?.(dirToSide(dir));
    },
    [setMotion]
  );

  const commitInternal = useCallback(
    (dir: Direction, velocity: number) => {
      stageRef.current = 'committed';
      dirRef.current = dir;

      if (mounted.current) setStage('committed');

      vibrate([14, 30, 18]);
      setMotion('commit', dir * geo.current.flyDistance, velocity);
      // Fires at release rather than at the end of the flight: the app needs to
      // open its dialog now, not a spring later.
      cb.current.onCommit?.(dirToSide(dir));
    },
    [setMotion]
  );

  const returnInternal = useCallback(
    (velocity: number, wasArmed: boolean) => {
      goNeutral();
      setMotion('return', 0, velocity);
      if (wasArmed) cb.current.onCancel?.();
    },
    [goNeutral, setMotion]
  );

  /* ----------------------------------------------------------- the loop */

  useAnimationFrame((_t, delta) => {
    const m = mode.current;
    if (m === 'resting' || m === 'dragging') return;

    const dt = Math.min(delta / 1000, MAX_DT);
    stepAxis(axis.current, PRESET[m], dt);
    paint();

    if (m === 'commit') {
      const dir = dirRef.current ?? 1;
      if (Math.abs(axis.current.pos) > geo.current.finalizeDistance) {
        mode.current = 'resting';
        cb.current.onExit?.(dirToSide(dir));
      }
      return;
    }

    if (isSettled(axis.current)) settleNow();
  });

  /* -------------------------------------------------------------- input */

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      // A second finger must not silently steal the gesture.
      if (pointerId.current !== null) return;
      // A card already on its way out is not grabbable once it is gone.
      if (stageRef.current === 'committed') return;

      pointerId.current = e.pointerId;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* capture is an optimisation, not a requirement */
      }

      mode.current = 'dragging';
      grabPointerX.current = e.clientX;
      // Grab from the CURRENT animated position, so catching a moving card
      // does not make it jump.
      grabPos.current = axis.current.pos;
      history.current = [
        { x: e.clientX, y: e.clientY, t: e.timeStamp },
      ];
    },
    [enabled]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      if (pointerId.current !== e.pointerId) return;
      if (mode.current !== 'dragging') return;

      const h = history.current;
      h.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (h.length > 12) h.shift();

      const effDX = deadzone(e.clientX - grabPointerX.current);
      let candidate = grabPos.current + effDX;

      const dir = dirRef.current;
      if (stageRef.current === 'armed' && dir) {
        // Raw finger travel outward from the dock, measured before the wall
        // compresses it. The commit floor is about the finger, not the pixels.
        rawOutward.current = Math.max(
          rawOutward.current,
          (grabPos.current + effDX - dir * geo.current.dock) * dir
        );
        candidate = applyArmedWall(
          candidate,
          dir,
          geo.current.edgeBoundary,
          cardWidth.current
        );
      }

      axis.current.pos = candidate;
      paint();

      // Edge-triggered only: a callback per frame would re-render the card at
      // 60Hz for a value that changes twice per gesture.
      if (stageRef.current === 'neutral' && cb.current.onThresholdCross) {
        const side: SwipeDir | null =
          Math.abs(candidate) >= THRESHOLD ? (candidate > 0 ? 'right' : 'left') : null;
        if (side !== crossed.current) {
          crossed.current = side;
          cb.current.onThresholdCross(side);
        }
      }
    },
    [enabled, paint]
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      pointerId.current = null;

      if (mode.current !== 'dragging') return;

      const { vx } = velocityFromHistory(history.current);
      const pos = axis.current.pos;

      if (crossed.current !== null) {
        crossed.current = null;
        cb.current.onThresholdCross?.(null);
      }

      if (stageRef.current === 'armed' && dirRef.current) {
        const dir = dirRef.current;
        const verdict = decideArmedRelease(pos, vx, dir, geo.current.dock, {
          msSinceArm:
            (typeof performance !== 'undefined' ? performance.now() : 0) -
            armedAt.current,
          rawOutward: rawOutward.current,
        });

        if (verdict.kind === 'commit') commitInternal(dir, vx);
        else if (verdict.kind === 'cancel') returnInternal(vx, true);
        else setMotion('dock', dir * geo.current.dock, vx);
        return;
      }

      const verdict = decideNeutralRelease(pos, vx);
      if (verdict.kind === 'return') {
        returnInternal(vx, false);
        return;
      }

      // One-stage mode maps a past-threshold release straight to a commit,
      // which is exactly what react-tinder-card did.
      if (twoStage) armInternal(verdict.dir, vx);
      else commitInternal(verdict.dir, vx);
    },
    [twoStage, armInternal, commitInternal, returnInternal, setMotion]
  );

  /* ----------------------------------------------------- imperative API */

  const arm = useCallback(
    (side: SwipeDir) => {
      if (!enabled) return;
      armInternal(side === 'right' ? 1 : -1, 0);
    },
    [enabled, armInternal]
  );

  const commit = useCallback(() => {
    if (!enabled) return;
    // Callable from a cold start: the AI modal fires a swipe with no gesture
    // in progress, so a missing direction must not be fatal.
    commitInternal(dirRef.current ?? 1, 0);
  }, [enabled, commitInternal]);

  const cancel = useCallback(() => {
    returnInternal(0, stageRef.current === 'armed');
  }, [returnInternal]);

  const restore = useCallback(() => {
    goNeutral();
    crossed.current = null;
    rawOutward.current = 0;

    if (!mounted.current) return Promise.resolve();

    // Already home and idle: resolve rather than wait for a frame that will
    // never do anything.
    if (mode.current === 'resting' && Math.abs(axis.current.pos) < 0.5) {
      axis.current.pos = 0;
      axis.current.target = 0;
      axis.current.vel = 0;
      paint();
      return Promise.resolve();
    }

    setMotion('return', 0, 0);
    return new Promise<void>(resolve => {
      restoreResolvers.current.push(resolve);
    });
  }, [goNeutral, paint, setMotion]);

  /* --------------------------------------------------- reduced motion */

  useEffect(() => {
    if (!prefersReducedMotion) return;
    // Springs are the thing being reduced, not the gesture. Snapping to the
    // target keeps every state reachable, including a caught mid-flight card.
    if (mode.current !== 'resting' && mode.current !== 'dragging') {
      settleNow();
    }
  }, [prefersReducedMotion, stage, settleNow]);

  /* -------------------------------------------------- inert when disabled */

  useEffect(() => {
    if (enabled) return;
    pointerId.current = null;
    mode.current = 'resting';
    axis.current = { pos: 0, vel: 0, target: 0 };
    goNeutral();
    paint();
  }, [enabled, goNeutral, paint]);

  return {
    wrapperRef,
    cardRef,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    transform,
    x,
    rotate,
    tintYes,
    tintNo,
    stage,
    armedDir,
    arm,
    commit,
    cancel,
    restore,
  };
}

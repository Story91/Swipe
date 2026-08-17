/**
 * Swipe gesture physics, ported from docs/v3/prototypes/swipe-gesture.html.
 *
 * Pure functions only. No React, no window, no document, no performance, no
 * Date. Everything here is deterministic given its arguments, which is the
 * whole point: the feel of the gesture is the single hardest thing in this app
 * to verify by looking at it, so it lives where a test can pin it instead.
 *
 * The prototype is the source of truth for every constant below. Where a value
 * was a live slider in the prototype, the slider's default is taken as the
 * value and the slider is not ported.
 *
 * A note on why the spring is hand-rolled rather than taken from an animation
 * library: the two-stage arm/commit machine needs to interrupt a spring
 * mid-flight, read its exact position and velocity, and hand that velocity to a
 * different spring with a different target. Declarative drag/animate APIs do
 * not expose that seam, and re-deriving the approved feel through one is how
 * the feel gets lost.
 */

export type Axis = { pos: number; vel: number; target: number };
export type SpringPreset = { damping: number; response: number };
export type Sample = { x: number; y: number; t: number };
export type Direction = 1 | -1;

/* ------------------------------------------------------------------ presets */

/** Springing home after a release that did not reach the threshold. */
export const RETURN: SpringPreset = { damping: 1.0, response: 0.3 };
/** Settling onto the armed dock. Slightly underdamped, so it lands with life. */
export const DOCK: SpringPreset = { damping: 0.8, response: 0.35 };
/** Carrying the card off screen once committed. */
export const COMMIT: SpringPreset = { damping: 1.0, response: 0.4 };

/* ---------------------------------------------------------------- constants */

/** Finger travel absorbed before the card moves at all, in px. */
export const HYSTERESIS = 10;
/** Apple's rubber-band constant. */
export const RUBBER_CONST = 0.55;
/** Momentum projection constant. 0.998 lands `project(1000) === 499`. */
export const PROJECTION_D = 0.998;
/** Projected landing distance that arms the card, in px. */
export const THRESHOLD = 110;
/**
 * Fraction of THRESHOLD that must be travelled out of (or back into) the dock
 * to commit or cancel. 0.55 => 60.5px.
 */
export const COMMIT_RATIO = 0.55;

/**
 * Floors that apply to COMMIT only, and exist because commit opens a
 * real-money dialog.
 *
 * Momentum projection contributes `0.499 * velocity`, so without these a ~30px
 * twitch at ~200px/s arms and a second ~30px twitch commits: about 60px of
 * total finger travel to stake, against 120px before this engine. The
 * prototype never had to care, because nothing there touched money.
 *
 * Cancel deliberately has no equivalent floor. Cancelling must stay the easier
 * of the two.
 */
export const COMMIT_DWELL_MS = 150;
export const COMMIT_MIN_RAW_PX = 24;
/** Degrees of tilt per px of horizontal travel is 1/this. */
export const ROTATE_DIVISOR = 22;
export const MAX_ROTATE_DEG = 10;
/** Integration substep. Keeps stiff presets stable regardless of frame rate. */
export const MAX_SUBSTEP = 1 / 240;
/** A frame longer than this is treated as a tab-switch, not a slow frame. */
export const MAX_DT = 1 / 30;
/** Px kept clear of the stage edge when rubber-banding. */
export const EDGE_MARGIN = 18;
/** Dock position as a fraction of card width. */
export const DOCK_RATIO = 0.46;
/** Velocity estimate window, in ms. */
export const VELOCITY_WINDOW_MS = 100;

/** Below this on both position error and velocity, a spring is done. */
export const SETTLE_POS_EPSILON = 0.05;
export const SETTLE_VEL_EPSILON = 0.05;

export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------- inputs */

/**
 * Absorb the first HYSTERESIS px of travel by SUBTRACTING it rather than
 * gating on it. Gating makes the card jump by the full deadzone the moment it
 * engages; subtracting means motion starts from zero.
 */
export function deadzone(v: number, hysteresis = HYSTERESIS): number {
  const sign = v < 0 ? -1 : 1;
  const a = Math.abs(v);
  return a > hysteresis ? sign * (a - hysteresis) : 0;
}

/**
 * Where a throw at this velocity would come to rest if it decelerated
 * naturally. Used so a fast flick over a short distance still counts, and a
 * slow drag over a long one does not get counted twice.
 */
export function project(velocity: number, d = PROJECTION_D): number {
  return ((velocity / 1000) * d) / (1 - d);
}

/**
 * Progressive resistance past a boundary instead of a hard stop. Asymptotes:
 * the result never reaches `dimension` however hard the user pulls.
 */
export function rubberband(
  overshoot: number,
  dimension: number,
  k = RUBBER_CONST
): number {
  const sign = overshoot < 0 ? -1 : 1;
  const o = Math.abs(overshoot);
  return (sign * (o * dimension * k)) / (dimension + k * o);
}

/**
 * Velocity in px/s from pointer history, measured against the oldest sample
 * still inside the window. A single-sample instantaneous delta is far too
 * noisy to decide a bet on.
 */
export function velocityFromHistory(
  history: Sample[],
  windowMs = VELOCITY_WINDOW_MS
): { vx: number; vy: number } {
  if (history.length < 2) return { vx: 0, vy: 0 };

  const now = history[history.length - 1];
  const cutoff = now.t - windowMs;

  let ref = history[0];
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].t >= cutoff) {
      ref = history[i];
    } else {
      break;
    }
  }

  const dt = (now.t - ref.t) / 1000;
  if (dt <= 0.001) return { vx: 0, vy: 0 };

  return { vx: (now.x - ref.x) / dt, vy: (now.y - ref.y) / dt };
}

/* ------------------------------------------------------------------ springs */

/**
 * One step of a damped harmonic oscillator driven by (damping ratio, response)
 * rather than (stiffness, damping), so the presets read as time constants.
 *
 *   w0 = 2*PI/response ; k = w0^2 ; c = 2*damping*w0   (mass = 1)
 *
 * Mutates and returns the axis, because this runs every frame per axis and
 * allocating here shows up in a profile.
 */
export function springStepOnce(
  axis: Axis,
  dt: number,
  damping: number,
  response: number
): Axis {
  const r = Math.max(response, 0.02);
  const w0 = (2 * Math.PI) / r;
  const k = w0 * w0;
  const c = 2 * damping * w0;
  const accel = -k * (axis.pos - axis.target) - c * axis.vel;
  axis.vel += accel * dt;
  axis.pos += axis.vel * dt;
  return axis;
}

/**
 * Integrate one frame, substepping so the result does not depend on frame
 * rate. Without this a 120Hz device and a stuttering 30Hz one settle at
 * visibly different speeds, and a long frame can make a stiff spring explode.
 */
export function stepAxis(
  axis: Axis,
  preset: SpringPreset,
  dt: number,
  maxSubstep = MAX_SUBSTEP
): Axis {
  let remaining = Math.min(dt, MAX_DT);
  while (remaining > 0) {
    const h = Math.min(maxSubstep, remaining);
    springStepOnce(axis, h, preset.damping, preset.response);
    remaining -= h;
  }
  return axis;
}

/** True once a spring is close enough to its target to stop integrating. */
export function isSettled(axis: Axis): boolean {
  return (
    Math.abs(axis.pos - axis.target) < SETTLE_POS_EPSILON &&
    Math.abs(axis.vel) < SETTLE_VEL_EPSILON
  );
}

/* ----------------------------------------------------------------- geometry */

export type Geometry = {
  /** Where an armed card rests, in px from centre. */
  dock: number;
  /** Where the rubber-band wall starts, in px from centre. */
  edgeBoundary: number;
  /** How far a committed card is thrown. */
  flyDistance: number;
  /** Past this, the card is gone and is recycled. */
  finalizeDistance: number;
  /** Displacement at which the side tint reaches full opacity. */
  tintRange: number;
};

/**
 * All the distances that depend on how big the card and its stage actually
 * are. Derived rather than hardcoded because the card is 330px on a wide
 * desktop and 260px on a small phone, and a fixed dock would sit off-card at
 * one end of that range.
 *
 * THE DOCK IS CAPPED, and this is the one number in here that was not simply
 * ported. The prototype docks at 0.46*cardWidth inside a stage at least 560px
 * wide, where the armed card stays visible. The real clip box is
 * `.tinder-container`, which has `overflow: hidden` and is 335px of content on
 * a 375px phone. An uncapped 128.8px dock there puts the card's outer edge
 * 268.8px from centre against a 167.5px half-container: about 101px of the
 * armed card, including part of its own armed pill, is simply cut off.
 *
 * So the dock is allowed to hang the card off the edge by at most
 * ALLOWED_CLIP_RATIO of its width. On desktop the cap is not reached and the
 * feel is the approved one exactly; on a phone the dock shortens rather than
 * the card disappearing.
 *
 * The alternative was keeping the card fully on screen, which collapses the
 * dock to ~20px on a phone and is a materially different gesture from the one
 * that was approved. This needs confirming on a real handset; it is the one
 * question the prototype cannot answer, because it was only ever run wide.
 */
export const ALLOWED_CLIP_RATIO = 0.15;

export function geometry(
  cardWidth: number,
  stageWidth: number,
  threshold = THRESHOLD
): Geometry {
  const preferredDock = cardWidth * DOCK_RATIO;
  const maxDock =
    stageWidth / 2 - cardWidth / 2 + cardWidth * ALLOWED_CLIP_RATIO;

  // Never negative: a stage narrower than its own card would otherwise dock
  // the card on the wrong side of centre.
  const dock = Math.max(0, Math.min(preferredDock, maxDock));

  return {
    dock,
    edgeBoundary: Math.max(dock + 20, stageWidth / 2 - cardWidth / 2 - EDGE_MARGIN),
    flyDistance: stageWidth * 1.3 + cardWidth,
    finalizeDistance: stageWidth / 2 + cardWidth / 2 + 30,
    tintRange: threshold,
  };
}

/** Card tilt for a given horizontal displacement. */
export function rotationFor(x: number): number {
  return clamp(x / ROTATE_DIVISOR, -MAX_ROTATE_DEG, MAX_ROTATE_DEG);
}

/** Side tint opacity, 0..1, for a given horizontal displacement. */
export function tintFor(x: number, tintRange = THRESHOLD): number {
  return clamp(Math.abs(x) / tintRange, 0, 1);
}

/* ---------------------------------------------------------------- decisions */

export type NeutralRelease =
  | { kind: 'arm'; dir: Direction }
  | { kind: 'return' };

/**
 * What a release from the neutral stage means.
 *
 * The decision is made on the PROJECTED landing point, not the release point,
 * so a fast flick that has only travelled 40px still arms. With zero velocity
 * this needs exactly `threshold + HYSTERESIS` px of raw finger travel.
 */
export function decideNeutralRelease(
  x: number,
  vx: number,
  threshold = THRESHOLD,
  d = PROJECTION_D
): NeutralRelease {
  const landing = x + project(vx, d);
  if (Math.abs(landing) <= threshold) return { kind: 'return' };
  return { kind: 'arm', dir: landing > 0 ? 1 : -1 };
}

export type ArmedRelease = { kind: 'commit' | 'cancel' | 'settle' };

/**
 * What a release from the armed dock means.
 *
 * Displacement is measured relative to the dock, not to centre, and signed so
 * that positive is "further out" regardless of which side is armed. Pushing
 * out past the extra distance commits; pulling back in past it cancels;
 * anything between is indecision and settles back onto the dock.
 *
 * Commit is deliberately harder to reach than cancel: the caller applies a
 * rubber-band wall just outside the dock, so a slow outward drag has to cover
 * far more finger distance than an inward one. An accidental commit costs
 * money; an accidental cancel costs a second.
 */
export function decideArmedRelease(
  x: number,
  vx: number,
  dir: Direction,
  dock: number,
  opts: {
    threshold?: number;
    d?: number;
    /** ms between arming and this release. Guards the two-flick shortcut. */
    msSinceArm?: number;
    /**
     * Post-deadzone finger travel outward from the dock, BEFORE the rubber-band
     * wall compresses it. Displayed position understates real travel past the
     * wall, so the floor has to be measured on the finger, not the card.
     */
    rawOutward?: number;
  } = {}
): ArmedRelease {
  const {
    threshold = THRESHOLD,
    d = PROJECTION_D,
    msSinceArm = Number.POSITIVE_INFINITY,
    rawOutward = Number.POSITIVE_INFINITY,
  } = opts;

  const extra = threshold * COMMIT_RATIO;
  // Positive = further out from centre, on whichever side is armed.
  const outward = (x - dir * dock) * dir + project(vx, d) * dir;

  // Cancel first, and with no floors: a user pulling back has already decided,
  // and making that harder than committing would be exactly backwards.
  if (outward < -extra) return { kind: 'cancel' };

  if (outward > extra) {
    if (msSinceArm < COMMIT_DWELL_MS) return { kind: 'settle' };
    if (rawOutward < COMMIT_MIN_RAW_PX) return { kind: 'settle' };
    return { kind: 'commit' };
  }

  return { kind: 'settle' };
}

/**
 * Apply the one-sided rubber-band wall an armed card runs into.
 *
 * One-sided on purpose: resistance applies only when moving further out, so
 * pulling back toward centre to cancel stays 1:1 and honest.
 */
export function applyArmedWall(
  candidateX: number,
  dir: Direction,
  edgeBoundary: number,
  cardWidth: number
): number {
  if (dir > 0 && candidateX > edgeBoundary) {
    return edgeBoundary + rubberband(candidateX - edgeBoundary, cardWidth);
  }
  if (dir < 0 && candidateX < -edgeBoundary) {
    return -edgeBoundary + rubberband(candidateX + edgeBoundary, cardWidth);
  }
  return candidateX;
}

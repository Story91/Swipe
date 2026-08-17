import { describe, it, expect } from 'vitest';
import {
  deadzone,
  project,
  rubberband,
  velocityFromHistory,
  springStepOnce,
  stepAxis,
  isSettled,
  geometry,
  rotationFor,
  tintFor,
  decideNeutralRelease,
  decideArmedRelease,
  applyArmedWall,
  RETURN,
  DOCK,
  COMMIT,
  HYSTERESIS,
  THRESHOLD,
  MAX_ROTATE_DEG,
  type Axis,
} from './swipePhysics';

const axis = (pos: number, vel: number, target: number): Axis => ({ pos, vel, target });

/** Run a spring for `ms` at a fixed frame interval, returning every position. */
function simulate(a: Axis, preset: typeof RETURN, ms: number, frameMs = 1000 / 60) {
  const positions: number[] = [];
  for (let t = 0; t < ms; t += frameMs) {
    stepAxis(a, preset, frameMs / 1000);
    positions.push(a.pos);
  }
  return positions;
}

describe('deadzone', () => {
  it('subtracts the hysteresis rather than gating on it', () => {
    // Gating would return the full 10.5 the moment it engages, jumping the
    // card. Subtracting means motion starts at zero.
    expect(deadzone(10)).toBe(0);
    expect(deadzone(10.5)).toBeCloseTo(0.5, 10);
    expect(deadzone(30)).toBeCloseTo(20, 10);
  });

  it('preserves sign', () => {
    expect(deadzone(-30)).toBeCloseTo(-20, 10);
    expect(deadzone(-10)).toBe(0);
  });

  it('is continuous at the boundary', () => {
    expect(Math.abs(deadzone(10.001))).toBeLessThan(0.01);
  });
});

describe('project', () => {
  it('pins the projection constant', () => {
    // d = 0.998 => v/1000 * 499. If this number moves, every threshold in the
    // gesture moves with it.
    expect(project(1000)).toBeCloseTo(499, 6);
    expect(project(0)).toBe(0);
  });

  it('is linear and sign-preserving', () => {
    expect(project(-1000)).toBeCloseTo(-499, 6);
    expect(project(2000)).toBeCloseTo(998, 6);
  });
});

describe('rubberband', () => {
  it('resists progressively', () => {
    // Pulling twice as hard yields less than twice the movement.
    const a = rubberband(50, 280);
    const b = rubberband(100, 280);
    expect(b).toBeLessThan(a * 2);
  });

  it('asymptotes below the dimension however hard it is pulled', () => {
    for (const overshoot of [100, 1_000, 100_000]) {
      expect(Math.abs(rubberband(overshoot, 280))).toBeLessThan(280);
    }
  });

  it('preserves sign and passes through zero', () => {
    expect(rubberband(0, 280)).toBe(0);
    expect(rubberband(-86.1, 280)).toBeCloseTo(-rubberband(86.1, 280), 10);
  });
});

describe('velocityFromHistory', () => {
  it('returns zero for fewer than two samples', () => {
    expect(velocityFromHistory([])).toEqual({ vx: 0, vy: 0 });
    expect(velocityFromHistory([{ x: 0, y: 0, t: 0 }])).toEqual({ vx: 0, vy: 0 });
  });

  it('measures px per second across the window', () => {
    const { vx } = velocityFromHistory([
      { x: 0, y: 0, t: 0 },
      { x: 100, y: 0, t: 100 },
    ]);
    expect(vx).toBeCloseTo(1000, 6);
  });

  it('ignores samples older than the window, so a pause before release reads as slow', () => {
    // Finger moved fast long ago, then rested at 200 for the last 100ms.
    // Velocity must reflect the rest, not the earlier dash.
    const { vx } = velocityFromHistory([
      { x: 0, y: 0, t: 0 },
      { x: 200, y: 0, t: 500 },
      { x: 200, y: 0, t: 560 },
      { x: 200, y: 0, t: 600 },
    ]);
    expect(Math.abs(vx)).toBeLessThan(1);
  });

  it('does not divide by a zero time delta', () => {
    expect(
      velocityFromHistory([
        { x: 0, y: 0, t: 5 },
        { x: 50, y: 0, t: 5 },
      ])
    ).toEqual({ vx: 0, vy: 0 });
  });
});

describe('spring integration', () => {
  it('RETURN is critically damped: it never overshoots the target', () => {
    const a = axis(200, 0, 0);
    const positions = simulate(a, RETURN, 2000);
    // Approaching zero from +200, nothing should cross below zero.
    expect(Math.min(...positions)).toBeGreaterThanOrEqual(-0.05);
  });

  it('DOCK is underdamped: it overshoots, but barely', () => {
    const a = axis(0, 0, 128.8);
    const positions = simulate(a, DOCK, 2000);
    const peak = Math.max(...positions);
    expect(peak).toBeGreaterThan(128.8);
    expect(peak).toBeLessThan(128.8 * 1.05);
  });

  it('settles at the target and stays there', () => {
    const a = axis(200, 0, 0);
    simulate(a, RETURN, 3000);
    expect(a.pos).toBeCloseTo(0, 1);
    expect(isSettled(a)).toBe(true);
  });

  it('is frame-rate independent: one 30ms frame lands where two 15ms frames do', () => {
    // This is what substepping buys. Without it a stuttering device settles
    // visibly differently from a smooth one.
    //
    // Both deltas are kept under MAX_DT on purpose. Comparing a 100ms frame
    // against six 16.7ms ones would compare different amounts of simulated
    // time, because the long one is clamped — see the next test.
    const slow = axis(200, 0, 0);
    stepAxis(slow, RETURN, 0.03);

    const fast = axis(200, 0, 0);
    for (let i = 0; i < 2; i++) stepAxis(fast, RETURN, 0.015);

    expect(Math.abs(slow.pos - fast.pos)).toBeLessThan(Math.abs(fast.pos) * 0.01 + 0.5);
  });

  it('clamps a frame longer than MAX_DT instead of simulating all of it', () => {
    // A backgrounded tab hands back a huge delta. Simulating it in full would
    // teleport the card; the clamp means it resumes from roughly where it was.
    const clamped = axis(200, 0, 0);
    stepAxis(clamped, RETURN, 1.0);

    const oneMaxFrame = axis(200, 0, 0);
    stepAxis(oneMaxFrame, RETURN, 1 / 30);

    expect(clamped.pos).toBeCloseTo(oneMaxFrame.pos, 6);
  });

  it('clamps an absurd frame delta instead of exploding', () => {
    // A backgrounded tab can hand back a multi-second delta.
    const a = axis(200, 0, 0);
    stepAxis(a, COMMIT, 5);
    expect(Number.isFinite(a.pos)).toBe(true);
    expect(Math.abs(a.pos)).toBeLessThan(1000);
  });

  it('carries release velocity into the spring', () => {
    // A fast flick that fails the threshold should still whip past centre.
    const flicked = axis(50, -3000, 0);
    const still = axis(50, 0, 0);
    stepAxis(flicked, RETURN, 1 / 60);
    stepAxis(still, RETURN, 1 / 60);
    expect(flicked.pos).toBeLessThan(still.pos);
  });

  it('springStepOnce guards against a zero response', () => {
    const a = axis(10, 0, 0);
    springStepOnce(a, 1 / 60, 1, 0);
    expect(Number.isFinite(a.pos)).toBe(true);
  });
});

describe('geometry', () => {
  it('derives the dock from card width when the stage is wide enough', () => {
    // Desktop: 330px card on a 700px stage. 0.46 * 330 = 151.8, uncapped.
    expect(geometry(330, 700).dock).toBeCloseTo(151.8, 6);
  });

  it('caps the dock so an armed card is not swallowed by the clip box', () => {
    // A 375px phone: .tinder-container gives 335px of content, card is 280.
    // Uncapped this would dock at 128.8 and cut ~101px off the card.
    const phone = geometry(280, 335);
    expect(phone.dock).toBeLessThan(280 * 0.46);

    const cardOuterEdge = phone.dock + 280 / 2;
    const clipped = cardOuterEdge - 335 / 2;
    expect(clipped).toBeLessThanOrEqual(280 * 0.15 + 0.001);
  });

  it('never docks a card on the wrong side of centre on a tiny stage', () => {
    expect(geometry(280, 120).dock).toBeGreaterThanOrEqual(0);
  });

  it('keeps the rubber-band wall at least 20px outside the dock', () => {
    // On a narrow stage the edge-derived boundary would fall inside the dock,
    // which would put a wall where the card is meant to rest.
    const g = geometry(280, 300);
    expect(g.edgeBoundary).toBeGreaterThanOrEqual(g.dock + 20);
  });

  it('throws the card clear of the stage and finalizes past its far edge', () => {
    const g = geometry(280, 400);
    expect(g.flyDistance).toBeGreaterThan(g.finalizeDistance);
    expect(g.finalizeDistance).toBeGreaterThan(400 / 2);
  });
});

describe('rotation and tint', () => {
  it('tilts by x/22 and clamps at 10 degrees', () => {
    expect(rotationFor(22)).toBeCloseTo(1, 10);
    expect(rotationFor(10_000)).toBe(MAX_ROTATE_DEG);
    expect(rotationFor(-10_000)).toBe(-MAX_ROTATE_DEG);
    expect(rotationFor(0)).toBe(0);
  });

  it('ramps tint to full at the threshold and no further', () => {
    expect(tintFor(0)).toBe(0);
    expect(tintFor(55)).toBeCloseTo(0.5, 6);
    expect(tintFor(110)).toBe(1);
    expect(tintFor(400)).toBe(1);
    expect(tintFor(-110)).toBe(1);
  });
});

describe('decideNeutralRelease', () => {
  it('arms at exactly 120px of raw finger travel when the drag is slow', () => {
    // 110 threshold + 10 deadzone. This equals the old react-tinder-card
    // swipeThreshold of 120 exactly, so committing did not get easier.
    const justUnder = deadzone(119.9);
    const justOver = deadzone(120.1);
    expect(decideNeutralRelease(justUnder, 0).kind).toBe('return');
    expect(decideNeutralRelease(justOver, 0).kind).toBe('arm');
  });

  it('arms on a fast flick that has barely moved', () => {
    // 40px of travel, thrown hard: projection carries it over.
    const result = decideNeutralRelease(40, 1000);
    expect(result.kind).toBe('arm');
    if (result.kind === 'arm') expect(result.dir).toBe(1);
  });

  it('arms the opposite side when a long drag is flung hard the other way', () => {
    // Dragged 150px right, then thrown left at 2000px/s: the projected landing
    // is -848, so the throw wins and the card arms LEFT. The release point does
    // not get a vote beyond feeding into the projection. Worth pinning, because
    // "I dragged it right so it must be a right swipe" is the intuition that
    // makes someone reintroduce a position-only check here.
    const result = decideNeutralRelease(150, -2000);
    expect(result.kind).toBe('arm');
    if (result.kind === 'arm') expect(result.dir).toBe(-1);
  });

  it('returns to centre when a modest drag is eased back', () => {
    // Same shape, but the throw is gentle enough that the landing point stays
    // inside the threshold.
    expect(decideNeutralRelease(80, -300).kind).toBe('return');
  });

  it('picks the side from the projected landing, not the release point', () => {
    const result = decideNeutralRelease(-20, 1000);
    expect(result.kind).toBe('arm');
    if (result.kind === 'arm') expect(result.dir).toBe(1);
  });

  it('is symmetric', () => {
    expect(decideNeutralRelease(-130, 0)).toEqual({ kind: 'arm', dir: -1 });
    expect(decideNeutralRelease(130, 0)).toEqual({ kind: 'arm', dir: 1 });
  });
});

describe('decideArmedRelease', () => {
  const dock = 128.8;
  // A deliberate, unhurried gesture: past both money floors.
  const deliberate = { msSinceArm: 400, rawOutward: 100 };

  it('settles back onto the dock when the card has not moved', () => {
    expect(decideArmedRelease(dock, 0, 1, dock, deliberate).kind).toBe('settle');
  });

  it('commits when pushed far enough further out', () => {
    // extra = 110 * 0.55 = 60.5
    expect(decideArmedRelease(dock + 61, 0, 1, dock, deliberate).kind).toBe('commit');
    expect(decideArmedRelease(dock + 60, 0, 1, dock, deliberate).kind).toBe('settle');
  });

  it('cancels when pulled far enough back toward centre', () => {
    expect(decideArmedRelease(dock - 61, 0, 1, dock, deliberate).kind).toBe('cancel');
    expect(decideArmedRelease(dock - 60, 0, 1, dock, deliberate).kind).toBe('settle');
  });

  it('measures outward relative to the armed side, so the left dock mirrors', () => {
    expect(decideArmedRelease(-dock - 61, 0, -1, dock, deliberate).kind).toBe('commit');
    expect(decideArmedRelease(-dock + 61, 0, -1, dock, deliberate).kind).toBe('cancel');
  });

  it('lets a deliberate flick commit without covering the full distance', () => {
    expect(
      decideArmedRelease(dock + 5, 500, 1, dock, deliberate).kind
    ).toBe('commit');
  });

  it('does not commit a card being flicked back inward', () => {
    expect(
      decideArmedRelease(dock + 61, -1000, 1, dock, deliberate).kind
    ).toBe('cancel');
  });

  describe('money floors', () => {
    it('refuses to commit on a flick that arrives too soon after arming', () => {
      // The two-flick shortcut: arm with a twitch, commit with another, and a
      // real-money dialog opens on ~60px of total travel.
      expect(
        decideArmedRelease(dock + 5, 500, 1, dock, { msSinceArm: 90, rawOutward: 100 }).kind
      ).toBe('settle');
    });

    it('refuses to commit on almost no real finger travel, however fast', () => {
      // Past the wall, displayed movement understates finger movement, so the
      // floor is measured on the finger.
      expect(
        decideArmedRelease(dock + 5, 900, 1, dock, { msSinceArm: 400, rawOutward: 8 }).kind
      ).toBe('settle');
    });

    it('commits once both floors are cleared', () => {
      expect(
        decideArmedRelease(dock + 5, 500, 1, dock, { msSinceArm: 160, rawOutward: 26 }).kind
      ).toBe('commit');
    });

    it('keeps cancel free of both floors, so backing out is never harder', () => {
      expect(
        decideArmedRelease(dock - 61, 0, 1, dock, { msSinceArm: 0, rawOutward: 0 }).kind
      ).toBe('cancel');
      expect(
        decideArmedRelease(dock, -1000, 1, dock, { msSinceArm: 0, rawOutward: 0 }).kind
      ).toBe('cancel');
    });

    it('defaults to no floors when the caller omits them', () => {
      // Button and keyboard entry points have no dwell or finger travel to
      // report, and must not be blocked by floors meant for a drag.
      expect(decideArmedRelease(dock + 61, 0, 1, dock).kind).toBe('commit');
    });
  });
});

describe('applyArmedWall', () => {
  const cardWidth = 280;
  const { edgeBoundary } = geometry(cardWidth, 400);

  it('passes positions inside the boundary through untouched', () => {
    expect(applyArmedWall(edgeBoundary - 10, 1, edgeBoundary, cardWidth)).toBe(
      edgeBoundary - 10
    );
  });

  it('resists past the boundary, and never lets it run away', () => {
    const pushed = applyArmedWall(edgeBoundary + 500, 1, edgeBoundary, cardWidth);
    expect(pushed).toBeGreaterThan(edgeBoundary);
    expect(pushed).toBeLessThan(edgeBoundary + cardWidth);
  });

  it('is one-sided: pulling back toward centre stays honest at 1:1', () => {
    // The wall must not make cancelling feel sticky. An armed-right card
    // dragged left of its dock is untouched.
    expect(applyArmedWall(-500, 1, edgeBoundary, cardWidth)).toBe(-500);
    expect(applyArmedWall(500, -1, edgeBoundary, cardWidth)).toBe(500);
  });

  it('mirrors for a left-armed card', () => {
    const pushed = applyArmedWall(-edgeBoundary - 500, -1, edgeBoundary, cardWidth);
    expect(pushed).toBeLessThan(-edgeBoundary);
    expect(pushed).toBeGreaterThan(-edgeBoundary - cardWidth);
  });

  it('makes an outward commit cost more finger travel than an inward cancel', () => {
    // The asymmetry is the point: an accidental commit costs money, an
    // accidental cancel costs a second.
    const { dock } = geometry(cardWidth, 400);
    const extra = THRESHOLD * 0.55;

    // Finger distance needed to reach the commit decision, walking outward.
    let outwardFinger = 0;
    for (let f = 0; f < 2000; f += 0.5) {
      const displayed = applyArmedWall(dock + f, 1, edgeBoundary, cardWidth);
      if (decideArmedRelease(displayed, 0, 1, dock).kind === 'commit') {
        outwardFinger = f;
        break;
      }
    }

    expect(outwardFinger).toBeGreaterThan(extra);
  });
});

describe('constants', () => {
  it('pins the values the feel was approved at', () => {
    expect(HYSTERESIS).toBe(10);
    expect(THRESHOLD).toBe(110);
    expect(RETURN).toEqual({ damping: 1.0, response: 0.3 });
    expect(DOCK).toEqual({ damping: 0.8, response: 0.35 });
    expect(COMMIT).toEqual({ damping: 1.0, response: 0.4 });
  });
});

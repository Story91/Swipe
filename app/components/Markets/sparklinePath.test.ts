import { describe, it, expect } from 'vitest';
import {
  sparklineGeometry,
  sparklineNote,
  SPARK_WIDTH,
  SPARK_HEIGHT,
  SPARK_PAD,
  SPARK_MAX_POINTS,
} from './sparklinePath';
import type { SparkPoint } from './sparklinePath';

/**
 * The card sparkline.
 *
 * Two things are being pinned. That the path is the readings and only the
 * readings, and that the three shapes which are not a chart do not draw one:
 * no points, one point, and points that never moved. Each of those is a
 * different sentence about the market, and a line drawn through any of them
 * would be the grid inventing a trend, which this repo has already shipped once
 * and had to tear out.
 */

const LEFT = SPARK_PAD;
const RIGHT = SPARK_WIDTH - SPARK_PAD;
const TOP = SPARK_PAD;
const BOTTOM = SPARK_HEIGHT - SPARK_PAD;

const point = (timestamp: number, yesPrice: number): SparkPoint => ({ timestamp, yesPrice });

/** Every number the component puts in an attribute, so NaN cannot hide. */
const numbers = (g: ReturnType<typeof sparklineGeometry>) => [
  g.lastX,
  g.lastY,
  g.baselineY,
  g.left,
  g.right,
  ...`${g.d} ${g.area}`.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [],
];

describe('sparklineGeometry, the three degenerate cases', () => {
  it('draws no line at all when there are no readings', () => {
    const geometry = sparklineGeometry([]);

    expect(geometry.kind).toBe('empty');
    expect(geometry.d).toBe('');
    expect(geometry.area).toBe('');
    expect(geometry.points).toBe(0);
    // The component draws its dashed rule off this, and it is the 50c line
    // because that is the only price a market with no history has ever had.
    expect(geometry.baselineY).toBe((TOP + BOTTOM) / 2);
    expect(geometry.lastValue).toBeNull();
    expect(numbers(geometry).every(Number.isFinite)).toBe(true);
  });

  it('treats null and a junk history as no readings, rather than throwing', () => {
    for (const history of [null, undefined, [] as SparkPoint[]]) {
      expect(sparklineGeometry(history).kind).toBe('empty');
    }
    // A record with unusable numbers in it is not a reading.
    const junk = [
      { timestamp: Number.NaN, yesPrice: 50 },
      { timestamp: 1, yesPrice: Number.POSITIVE_INFINITY },
      null,
    ] as unknown as SparkPoint[];
    expect(sparklineGeometry(junk).kind).toBe('empty');
  });

  it('draws one reading as a dot, never as a line across the card', () => {
    const geometry = sparklineGeometry([point(1000, 73)]);

    expect(geometry.kind).toBe('single');
    expect(geometry.d).toBe('');
    expect(geometry.area).toBe('');
    expect(geometry.points).toBe(1);
    // At the right hand edge: it is the newest reading and there is no older
    // one, so there is nothing to its left to draw.
    expect(geometry.lastX).toBe(RIGHT);
    expect(geometry.lastValue).toBe(73);
    expect(numbers(geometry).every(Number.isFinite)).toBe(true);
  });

  it('survives two readings on the same timestamp, which is a zero span', () => {
    // Two bets inside one second. Dividing by the span would make every x NaN
    // and the browser would silently drop the path.
    const geometry = sparklineGeometry([point(1000, 40), point(1000, 60)]);

    expect(geometry.kind).toBe('line');
    expect(numbers(geometry).every(Number.isFinite)).toBe(true);
    expect(geometry.d).toBe(`M ${LEFT} ${sparklineGeometry([point(0, 40)]).lastY} L ${RIGHT} ${sparklineGeometry([point(0, 60)]).lastY}`);
  });

  it('draws two identical readings level, and says the market has not moved', () => {
    const geometry = sparklineGeometry([point(1000, 50), point(2000, 50)]);

    expect(geometry.kind).toBe('flat');
    expect(geometry.area).toBe('');
    // Edge to edge at one height, so it cannot be mistaken for the dashed rule
    // the empty state draws.
    expect(geometry.d).toBe(`M ${LEFT} ${geometry.baselineY} L ${RIGHT} ${geometry.baselineY}`);
    expect(geometry.lastValue).toBe(50);
    expect(numbers(geometry).every(Number.isFinite)).toBe(true);
  });

  it('draws two identical readings on the same timestamp level too', () => {
    const geometry = sparklineGeometry([point(1000, 62), point(1000, 62)]);
    expect(geometry.kind).toBe('flat');
    expect(numbers(geometry).every(Number.isFinite)).toBe(true);
  });
});

describe('sparklineGeometry, a line that goes somewhere', () => {
  it('puts the first reading on the left edge and the newest on the right', () => {
    const geometry = sparklineGeometry([point(0, 50), point(50, 20), point(100, 80)]);

    expect(geometry.kind).toBe('line');
    expect(geometry.points).toBe(3);
    expect(geometry.d.startsWith(`M ${LEFT} `)).toBe(true);
    expect(geometry.lastX).toBe(RIGHT);
  });

  it('spaces x by time, not by index, so a quiet week is a long flat run', () => {
    // Three readings, the middle one right next to the first.
    const geometry = sparklineGeometry([point(0, 10), point(10, 90), point(100, 50)]);
    const xs = geometry.d.match(/[ML] (-?\d+(?:\.\d+)?)/g)?.map((m) => Number(m.slice(2)));

    expect(xs).toHaveLength(3);
    const [first, middle, last] = xs as number[];
    expect(first).toBe(LEFT);
    expect(last).toBe(RIGHT);
    // A tenth of the span, not half of it.
    expect(middle).toBeCloseTo(LEFT + (RIGHT - LEFT) * 0.1, 5);
  });

  it('puts 100c at the top and 0c at the bottom', () => {
    const high = sparklineGeometry([point(0, 100)]);
    const low = sparklineGeometry([point(0, 0)]);

    expect(high.lastY).toBe(TOP);
    expect(low.lastY).toBe(BOTTOM);
    // Higher price, smaller y. Getting this backwards draws every market
    // upside down, which is the one bug a sparkline can have and still look
    // plausible.
    expect(high.lastY).toBeLessThan(low.lastY);
  });

  it('uses a fixed 0 to 100 scale, so two cards are the same chart', () => {
    // A market that never left the 40s must not be stretched to fill the box.
    const narrow = sparklineGeometry([point(0, 44), point(1, 46)]);
    expect(narrow.lastY).toBeGreaterThan(TOP + (BOTTOM - TOP) * 0.4);
    expect(narrow.lastY).toBeLessThan(TOP + (BOTTOM - TOP) * 0.6);
  });

  it('closes the area onto the floor, under the line and nowhere else', () => {
    const geometry = sparklineGeometry([point(0, 30), point(1, 70)]);

    expect(geometry.area.startsWith(geometry.d)).toBe(true);
    expect(geometry.area.endsWith(`L ${RIGHT} ${BOTTOM} L ${LEFT} ${BOTTOM} Z`)).toBe(true);
  });

  it('sorts readings by time, so an out of order record is not a zigzag', () => {
    const geometry = sparklineGeometry([point(100, 80), point(0, 20), point(50, 50)]);
    const ys = geometry.d.match(/[ML] -?\d+(?:\.\d+)? (-?\d+(?:\.\d+)?)/g)?.map((m) =>
      Number(m.split(' ')[2])
    );

    // 20, then 50, then 80: y falling all the way.
    expect(ys).toHaveLength(3);
    expect((ys as number[])[0]).toBeGreaterThan((ys as number[])[1]);
    expect((ys as number[])[1]).toBeGreaterThan((ys as number[])[2]);
  });

  it('clamps a reading outside 0 to 100 instead of drawing outside the box', () => {
    const geometry = sparklineGeometry([point(0, -20), point(1, 140)]);
    expect(geometry.lastY).toBe(TOP);
    expect(geometry.lastValue).toBe(100);
    expect(numbers(geometry).every(Number.isFinite)).toBe(true);
  });

  it('draws the most recent window when a market has more readings than fit', () => {
    const history = Array.from({ length: SPARK_MAX_POINTS + 40 }, (_, i) => point(i, i % 100));
    const geometry = sparklineGeometry(history);

    expect(geometry.points).toBe(SPARK_MAX_POINTS);
    expect(geometry.truncated).toBe(true);
    // The tail, so the newest reading is still the one on the right edge.
    expect(geometry.lastValue).toBe(history[history.length - 1].yesPrice);
  });

  it('leaves truncated false when the whole record fits', () => {
    const geometry = sparklineGeometry([point(0, 10), point(1, 20)]);
    expect(geometry.truncated).toBe(false);
  });
});

describe('sparklineNote', () => {
  it('says which of the three shapes the reader is looking at', () => {
    expect(sparklineNote(sparklineGeometry([]))).toBe('no odds recorded yet');
    expect(sparklineNote(sparklineGeometry([point(1, 64)]))).toBe('one reading, 64¢');
    expect(sparklineNote(sparklineGeometry([point(1, 50), point(2, 50)]))).toBe('unmoved at 50¢');
  });

  it('says nothing under a line that speaks for itself', () => {
    expect(sparklineNote(sparklineGeometry([point(0, 30), point(1, 70)]))).toBeNull();
  });
});

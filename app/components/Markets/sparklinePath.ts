/**
 * The maths behind the card sparkline.
 *
 * No React and no CSS import, same reason as marketThumb.ts: the path building
 * is the part worth testing, and it should be testable without a render.
 *
 * The one rule this file exists to keep: it draws the readings it was given and
 * nothing else. No smoothing, no interpolation, no synthetic opening point at
 * 50/50. The detail chart prepends a Start point and that is a defensible
 * choice on a screen with an axis and a legend, but a 90 pixel line with no
 * scale cannot say which end is real. A market with one reading gets a dot, a
 * market with no readings gets a dashed rule and a caption saying so, and
 * neither of them gets a slope nobody measured.
 */

/** One stored reading. The Redis record carries more; this is what gets drawn. */
export interface SparkPoint {
  timestamp: number;
  yesPrice: number;
}

/**
 * Which of the four pictures this history is.
 *
 * `empty`  nothing recorded, a dashed rule
 * `single` one reading, a dot at the right edge
 * `flat`   several readings that never moved, a level line
 * `line`   a line that actually goes somewhere
 */
export type SparkKind = 'empty' | 'single' | 'flat' | 'line';

export interface SparkGeometry {
  kind: SparkKind;
  /** The YES line. Empty string when there is no line to draw. */
  d: string;
  /** The fill under the line. Only a moving line gets one. */
  area: string;
  /** Where the newest reading sits, for the end dot. */
  lastX: number;
  lastY: number;
  /** The newest reading in cents, or null when there is nothing recorded. */
  lastValue: number | null;
  /** The 50 cent rule, which is what the empty state draws. */
  baselineY: number;
  /** The drawable box, so the component does not repeat the padding maths. */
  left: number;
  right: number;
  /** How many readings are in the path. */
  points: number;
  /** True when older readings were left out of the window. */
  truncated: boolean;
}

export interface SparkOptions {
  width?: number;
  height?: number;
  pad?: number;
  maxPoints?: number;
}

/** User units. The component stretches these to the card with CSS. */
export const SPARK_WIDTH = 100;
export const SPARK_HEIGHT = 32;
/**
 * Keeps a 0c or 100c line, and the end dot, inside the box. The stroke does not
 * scale with the viewBox, so half of it would otherwise sit outside and be
 * clipped by the card's own overflow: hidden.
 */
export const SPARK_PAD = 3;

/**
 * The most recent readings, at most. A market may hold a thousand points and a
 * card is ninety pixels wide, so the whole record is neither drawable nor worth
 * shipping 24 times per page. This takes the tail rather than sampling across
 * the range: a tail is a true window on recent trading, whereas picking every
 * nth point invents a shape by choosing which moves to omit. `truncated` says
 * which of the two the caller is looking at.
 */
export const SPARK_MAX_POINTS = 120;

function clampPrice(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Two decimals is under a hundredth of a card pixel and keeps the path short. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function isDrawable(point: unknown): point is SparkPoint {
  if (!point || typeof point !== 'object') return false;
  const { timestamp, yesPrice } = point as Partial<SparkPoint>;
  return (
    typeof timestamp === 'number' &&
    Number.isFinite(timestamp) &&
    typeof yesPrice === 'number' &&
    Number.isFinite(yesPrice)
  );
}

export function sparklineGeometry(
  history: readonly SparkPoint[] | null | undefined,
  options: SparkOptions = {}
): SparkGeometry {
  const width = options.width ?? SPARK_WIDTH;
  const height = options.height ?? SPARK_HEIGHT;
  const pad = options.pad ?? SPARK_PAD;
  const maxPoints = options.maxPoints ?? SPARK_MAX_POINTS;

  const left = pad;
  const right = width - pad;
  const top = pad;
  const bottom = height - pad;

  // 100c at the top, 0c at the bottom. The domain is fixed rather than fitted
  // to the data, so two cards side by side are the same chart: a line sitting
  // high on one card means the same thing as a line sitting high on the next.
  const yOf = (value: number) => round(bottom - (clampPrice(value) / 100) * (bottom - top));
  const baselineY = yOf(50);

  const usable = (Array.isArray(history) ? history : []).filter(isDrawable);
  // Appended in order already, but a sort costs nothing and a record that is
  // out of order would otherwise draw a line that doubles back on itself.
  const sorted = [...usable].sort((a, b) => a.timestamp - b.timestamp);
  const truncated = sorted.length > maxPoints;
  const drawn = truncated ? sorted.slice(-maxPoints) : sorted;

  if (drawn.length === 0) {
    return {
      kind: 'empty',
      d: '',
      area: '',
      lastX: right,
      lastY: baselineY,
      lastValue: null,
      baselineY,
      left,
      right,
      points: 0,
      truncated: false,
    };
  }

  const first = drawn[0].timestamp;
  const last = drawn[drawn.length - 1].timestamp;
  const span = last - first;

  // Two bets inside the same second, or a record whose timestamps are all
  // equal, gives a span of zero. Dividing by it produces NaN for every x and an
  // SVG path the browser silently drops, which is how this kind of chart ends
  // up as an invisible bug. Even spacing by index is the honest reading of
  // "these happened in this order and we cannot tell how far apart".
  const xOf = (point: SparkPoint, index: number): number => {
    if (span > 0) return round(left + ((point.timestamp - first) / span) * (right - left));
    if (drawn.length === 1) return right;
    return round(left + (index / (drawn.length - 1)) * (right - left));
  };

  const coords = drawn.map((point, index) => ({
    x: xOf(point, index),
    y: yOf(point.yesPrice),
  }));

  const lastPoint = coords[coords.length - 1];
  const lastValue = clampPrice(drawn[drawn.length - 1].yesPrice);

  if (coords.length === 1) {
    return {
      kind: 'single',
      d: '',
      area: '',
      lastX: lastPoint.x,
      lastY: lastPoint.y,
      lastValue,
      baselineY,
      left,
      right,
      points: 1,
      truncated,
    };
  }

  const level = coords.every((point) => point.y === coords[0].y);

  if (level) {
    // A real statement: several readings, none of them different. Drawn edge to
    // edge so it cannot be mistaken for the dashed empty rule, and with no fill
    // under it, which would read as a quantity rather than a price.
    return {
      kind: 'flat',
      d: `M ${left} ${coords[0].y} L ${right} ${coords[0].y}`,
      area: '',
      lastX: right,
      lastY: coords[0].y,
      lastValue,
      baselineY,
      left,
      right,
      points: coords.length,
      truncated,
    };
  }

  // Straight segments between measured points. A curve through them would put
  // prices on the card that the market never traded at.
  const d = coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  const area = `${d} L ${lastPoint.x} ${bottom} L ${coords[0].x} ${bottom} Z`;

  return {
    kind: 'line',
    d,
    area,
    lastX: lastPoint.x,
    lastY: lastPoint.y,
    lastValue,
    baselineY,
    left,
    right,
    points: coords.length,
    truncated,
  };
}

/**
 * The words under a line that cannot speak for itself.
 *
 * A moving line needs no caption. The other three shapes all look like a chart
 * and are not one, so each says what it is instead of leaving the reader to
 * assume the market has been quiet, or busy, or anything at all.
 */
export function sparklineNote(geometry: SparkGeometry): string | null {
  switch (geometry.kind) {
    case 'empty':
      return 'no odds recorded yet';
    case 'single':
      return `one reading, ${geometry.lastValue}¢`;
    case 'flat':
      return `unmoved at ${geometry.lastValue}¢`;
    default:
      return null;
  }
}

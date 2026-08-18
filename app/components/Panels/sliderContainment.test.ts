import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

/**
 * The two things about the activity slider that a unit test cannot see.
 *
 * The track is wider than the page on purpose. If the box around it ever stops
 * clipping, the document gains a horizontal scrollbar and every screen in the
 * app can be dragged sideways off its own layout, which on a phone is the whole
 * app broken by one stylesheet line. There is no DOM in this suite, so the rule
 * itself is pinned rather than the pixel.
 *
 * And the items are rendered exactly twice. The loop wraps at the width of one
 * copy; a third copy would put the wrap a third of the way through the track
 * and the reader would watch the list jump back to the start mid stride.
 *
 * Both of these are one careless edit away from being wrong and neither shows
 * up in a typecheck.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(HERE, 'ProductPanels.css'), 'utf8');
const slider = readFileSync(path.join(HERE, 'ActivitySlider.tsx'), 'utf8');

/** The declarations inside one rule, by selector. */
function ruleBody(sheet: string, selector: string): string {
  const start = sheet.indexOf(`\n${selector} {`);
  expect(start, `no rule for ${selector}`).toBeGreaterThan(-1);
  const open = sheet.indexOf('{', start);
  const close = sheet.indexOf('}', open);
  return sheet.slice(open + 1, close);
}

describe('the activity slider cannot widen the page', () => {
  it('clips its own track', () => {
    expect(ruleBody(css, '.pp-slider')).toMatch(/overflow:\s*hidden/);
  });

  it('lets every box between the track and the grid collapse below its content', () => {
    // Without min-width: 0 a flex or grid item refuses to shrink past the
    // width of what is inside it, and "what is inside it" here is a track
    // several screens wide.
    expect(ruleBody(css, '.pp')).toMatch(/min-width:\s*0/);
    expect(ruleBody(css, '.pp-panel')).toMatch(/min-width:\s*0/);
    expect(ruleBody(css, '.pp-slider')).toMatch(/min-width:\s*0/);
  });

  it('holds the grid columns at minmax(0, ...), which is what stops the blowout', () => {
    expect(css).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(css).not.toMatch(/grid-template-columns:\s*1fr\s+1\.4fr/);
  });

  it('leaves vertical scrolling to the page', () => {
    expect(ruleBody(css, '.pp-slider')).toMatch(/touch-action:\s*pan-y/);
  });
});

describe('the activity slider duplicates its items exactly once', () => {
  it('renders two copies and no more', () => {
    const copies = slider.match(/className="pp-slider__copy"/g) ?? [];
    expect(copies).toHaveLength(2);
  });

  it('hides the duplicate from a screen reader', () => {
    expect(slider).toMatch(/className="pp-slider__copy" aria-hidden="true"/);
  });

  it('wraps at the width of one copy, measured, not at a fraction of the track', () => {
    expect(slider).toMatch(/wrapOffset\(offset\.current, span\.current\)/);
    expect(slider).toMatch(/copy\.offsetWidth/);
  });
});

describe('the activity slider stops when it is asked to', () => {
  it('pauses on pointer and on focus', () => {
    expect(slider).toMatch(/onPointerEnter=/);
    expect(slider).toMatch(/onPointerLeave=/);
    expect(slider).toMatch(/onFocusCapture=/);
    expect(slider).toMatch(/onBlurCapture=/);
  });

  it('does not run at all under reduced motion', () => {
    expect(slider).toMatch(/usePrefersReducedMotion/);
    expect(slider).toMatch(/const loops = !reduced/);
  });

  it('has a reduce block in the stylesheet that reaches everything that moves', () => {
    const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduce).toContain('.pp-panel');
    expect(reduce).toContain('.pp-panel__beam');
    expect(reduce).toContain('.pp-live__dot--on');
    expect(reduce).toContain('.pp-slider__track');
  });

  it('keeps the entry animation start state inside its keyframe', () => {
    // `animation: none` drops the keyframe. A rule that opened at opacity 0
    // would leave every panel invisible for anyone who asked for less motion.
    expect(ruleBody(css, '.pp-panel')).not.toMatch(/opacity:\s*0/);
    expect(css).toMatch(/@keyframes pp-rise \{\s*from \{\s*opacity: 0;/);
  });
});

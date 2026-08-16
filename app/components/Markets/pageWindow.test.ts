import { describe, it, expect } from 'vitest';
import { pageWindow } from './pageWindow';

describe('pageWindow', () => {
  it('lists every page when there are few enough to fit', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps first, last and a window around the current page', () => {
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
  });

  it('does not emit a gap where pages are already adjacent', () => {
    expect(pageWindow(2, 10)).toEqual([1, 2, 3, null, 10]);
    expect(pageWindow(9, 10)).toEqual([1, null, 8, 9, 10]);
  });

  it('never duplicates a page number', () => {
    for (let total = 1; total <= 20; total++) {
      for (let current = 1; current <= total; current++) {
        const pages = pageWindow(current, total).filter(
          (p): p is number => p !== null
        );
        expect(new Set(pages).size).toBe(pages.length);
      }
    }
  });

  it('always includes the current page, and stays in ascending order', () => {
    for (let total = 1; total <= 20; total++) {
      for (let current = 1; current <= total; current++) {
        const pages = pageWindow(current, total).filter(
          (p): p is number => p !== null
        );
        expect(pages).toContain(current);
        expect([...pages].sort((a, b) => a - b)).toEqual(pages);
      }
    }
  });
});

/**
 * Page numbers to render in a pagination control: always the first and last
 * page, plus a window around the current one. `null` marks an elided gap.
 *
 * Kept free of React and CSS imports so it can be unit tested on its own.
 */
export function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>([1, total, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < total) pages.add(current + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1] > 1) out.push(null);
    out.push(page);
  });
  return out;
}

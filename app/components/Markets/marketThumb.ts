/**
 * Thumbnail resolution for a market card.
 *
 * Crypto markets created with "include chart" store a GeckoTerminal *embed*
 * URL in imageUrl — an iframe address, not an image — so <img src> can never
 * render it. Those, and any image that fails to load, fall back to a generated
 * tile so the grid never shows empty holes.
 *
 * No React or CSS imports, so this is unit testable on its own.
 */

export type ThumbKind = 'image' | 'chart' | 'generated';

const EMBED_HOSTS = ['geckoterminal.com', 'dexscreener.com', 'birdeye.so'];

/** True for URLs that are interactive embeds rather than images. */
export function isEmbedUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return EMBED_HOSTS.some((host) => url.includes(host));
}

export function thumbKindFor(url: string | undefined | null): ThumbKind {
  if (!url) return 'generated';
  if (isEmbedUrl(url)) return 'chart';
  return 'image';
}

/**
 * Stable hue from a string, so a given market always gets the same tile colour
 * across reloads and across users.
 */
export function hueFromSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** One or two letters to print on a generated tile. */
export function initialsFor(text: string): string {
  const words = text
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

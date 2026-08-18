import type { ShareNetwork } from './shareTargets';

/**
 * The seven marks in the share sheet.
 *
 * Every one of them is decorative: the button around it carries the name, so
 * these are aria-hidden and never the accessible name of anything. They are
 * drawn rather than imported because the app ships no icon set with brand
 * marks, and a PNG per network would be seven more requests for something that
 * has to recolour on hover.
 *
 * Each keeps its own viewBox so the source path is untouched, and each paints
 * with currentColor so the tile owns the colour. The two marks that are a solid
 * shape with a hole in it, Facebook and Reddit, knock the hole out in
 * var(--shr-face), which is the tile's own background. That variable is why the
 * tile face stays the same colour in every state: change the face on hover and
 * the knockout stops matching it.
 *
 * Farcaster is the exception and uses the arch bitmap already in public/, which
 * the old modal shipped and which is the only brand asset this repo has.
 */

const SIZE = 22;

interface GlyphProps {
  network: ShareNetwork;
}

export function ShareGlyph({ network }: GlyphProps) {
  switch (network) {
    case 'farcaster':
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/farc.png"
          alt=""
          aria-hidden="true"
          width={SIZE}
          height={SIZE}
          className="shr__glyph shr__glyph--img"
        />
      );

    case 'x':
      return (
        <svg
          className="shr__glyph"
          viewBox="0 0 24 24"
          width={SIZE}
          height={SIZE}
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );

    case 'facebook':
      return (
        <svg
          className="shr__glyph"
          viewBox="0 0 24 24"
          width={SIZE}
          height={SIZE}
          aria-hidden="true"
          focusable="false"
        >
          <rect x="1" y="1" width="22" height="22" rx="3" fill="currentColor" />
          <path
            d="M13.6 21.5v-7.3h2.45l.37-2.85H13.6V9.53c0-.82.23-1.39 1.41-1.39h1.5V5.59a19.6 19.6 0 0 0-2.19-.11c-2.17 0-3.65 1.32-3.65 3.75v2.12H8.2v2.85h2.47v7.3z"
            fill="var(--shr-face, #0d0d0d)"
          />
        </svg>
      );

    case 'reddit':
      return (
        <svg
          className="shr__glyph"
          viewBox="0 0 24 24"
          width={SIZE}
          height={SIZE}
          aria-hidden="true"
          focusable="false"
        >
          {/* Head, ears and aerial, then the face knocked back out of them. */}
          <circle cx="12" cy="14.4" r="7.8" fill="currentColor" />
          <circle cx="3.3" cy="12.6" r="2.9" fill="currentColor" />
          <circle cx="20.7" cy="12.6" r="2.9" fill="currentColor" />
          <path
            d="M12 7.4 13.9 2.6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="14.2" cy="2.5" r="2" fill="currentColor" />
          <circle cx="9.1" cy="13.6" r="1.55" fill="var(--shr-face, #0d0d0d)" />
          <circle cx="14.9" cy="13.6" r="1.55" fill="var(--shr-face, #0d0d0d)" />
          <path
            d="M8.5 17.5c.95.85 2.1 1.28 3.5 1.28s2.55-.43 3.5-1.28"
            stroke="var(--shr-face, #0d0d0d)"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      );

    case 'telegram':
      return (
        <svg
          className="shr__glyph"
          viewBox="0 0 24 24"
          width={SIZE}
          height={SIZE}
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.01-.033.02-.149-.056-.22s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      );

    case 'whatsapp':
      return (
        <svg
          className="shr__glyph"
          viewBox="0 0 448 512"
          width={SIZE}
          height={SIZE}
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
        </svg>
      );

    case 'copy':
      return (
        <svg
          className="shr__glyph"
          viewBox="0 0 24 24"
          width={SIZE}
          height={SIZE}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M9.5 14.5a4.5 4.5 0 0 0 6.36 0l3-3a4.5 4.5 0 0 0-6.36-6.36l-1.5 1.5" />
          <path d="M14.5 9.5a4.5 4.5 0 0 0-6.36 0l-3 3a4.5 4.5 0 0 0 6.36 6.36l1.5-1.5" />
        </svg>
      );
  }
}

export default ShareGlyph;

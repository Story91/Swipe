/**
 * Where a share can go, and exactly what each destination receives.
 *
 * The old share modal sent one string to two places: a Farcaster cast and a
 * tweet, with the handle swapped by a regex on the way out. That is the whole
 * reason this file exists. Six networks do not take the same thing. X counts
 * the link against the same 280 as the words, so a cast that reads fine gets
 * silently truncated by the compose box. Facebook's sharer has taken nothing
 * but a URL since 2017, so a message passed to it is dropped on the floor.
 * Reddit wants a title and posts a link, not a paragraph. Telegram splits the
 * link and the note into two fields, WhatsApp has one field and the link has to
 * be inside it, and Farcaster carries the link as an embed so repeating it in
 * the text shows the URL twice under the card.
 *
 * Everything here is pure and has no window, so it is testable, and it is
 * tested in shareTargets.test.ts next door. The component does the transport,
 * this file decides the payload.
 *
 * Nothing in here invents share copy. The caller's text is the caller's text.
 * All this does is retag it, tidy the whitespace, fit it to the destination's
 * budget and put it in the field that destination reads.
 */

export type ShareNetwork =
  | 'farcaster'
  | 'x'
  | 'facebook'
  | 'reddit'
  | 'telegram'
  | 'whatsapp'
  | 'copy';

/** Display order in the sheet. Farcaster first, it is the one that casts in app. */
export const SHARE_NETWORKS: readonly ShareNetwork[] = [
  'farcaster',
  'x',
  'facebook',
  'reddit',
  'telegram',
  'whatsapp',
  'copy',
] as const;

/**
 * X's budget covers the text and the link together. It shortens links to 23
 * characters on its side, so counting the real URL trims a little more than it
 * has to and can never overflow. Under-filling a tweet is invisible, a cut off
 * tweet is not.
 */
export const TWEET_LIMIT = 280;

/** Reddit rejects a longer title outright. */
export const REDDIT_TITLE_LIMIT = 300;

/** A cast is 1024 bytes. Counted in characters here, which is stricter. */
export const CAST_LIMIT = 1024;

const ELLIPSIS = '…';

/**
 * The account is @swipeai on Farcaster and @swipe_ai_ on X, and it is nobody on
 * the other four, where an @ handle is just a word with a symbol stuck to it.
 */
const X_HANDLE = '@swipe_ai_';
const PLAIN_NAME = 'Swipe';

/**
 * Used only when a caller hands over a blank URL. A share with no link is not
 * a share, it is a status update, and every one of these networks needs
 * somewhere to point.
 */
export const FALLBACK_SHARE_URL =
  process.env.NEXT_PUBLIC_URL || 'https://theswipe.app';

export interface ShareInput {
  /** The message as the caller built it, in Farcaster flavour. */
  text: string;
  /** The canonical link to the prediction. */
  url: string;
  /** The market question, which is what Reddit wants as a title. */
  question?: string;
}

/** Where the link ends up once the destination has it. */
export type LinkPlacement =
  /** Inside the message itself, because there is only one field. */
  | 'body'
  /** In its own field, next to the message. */
  | 'field'
  /** Not in the text at all. The destination unfurls the page. */
  | 'embed';

export interface ShareComposition {
  network: ShareNetwork;
  /** The words this destination will carry. Empty for Facebook, which takes none. */
  body: string;
  /** What to call those words in the preview. */
  bodyLabel: string;
  /** The link. Never empty. */
  url: string;
  linkPlacement: LinkPlacement;
  /** The web intent. Null for the two destinations that never open a page. */
  href: string | null;
  /** What lands on the clipboard. Only the copy destination sets it. */
  clipboard: string | null;
  /** The destination's own hard budget, when it has one. */
  limit: number | null;
  /** What body plus link actually costs against that budget. */
  cost: number;
  /** One line for the preview, saying what this destination does with it. */
  note: string;
}

/** Human name, for a button that a screen reader has to read out. */
export const NETWORK_LABELS: Record<ShareNetwork, string> = {
  farcaster: 'Farcaster',
  x: 'X',
  facebook: 'Facebook',
  reddit: 'Reddit',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  copy: 'Copy link',
};

/** What the send button says once a destination is picked. */
export const NETWORK_ACTIONS: Record<ShareNetwork, string> = {
  farcaster: 'Cast it',
  x: 'Open X',
  facebook: 'Open Facebook',
  reddit: 'Open Reddit',
  telegram: 'Open Telegram',
  whatsapp: 'Open WhatsApp',
  copy: 'Copy it',
};

const NOTES: Record<ShareNetwork, string> = {
  farcaster:
    'The link goes on as an embed, so the card renders under the cast instead of showing a URL.',
  x: 'X counts the link inside the 280, so the text is cut to fit rather than by the compose box.',
  facebook:
    'The sharer takes a link and nothing else, so the card does all the talking.',
  reddit: 'A link post. Reddit reads the title, so that is what this sends.',
  telegram: 'Telegram puts the link first and the note under it.',
  whatsapp: 'One field, so the link sits at the end of the message.',
  copy: 'Goes on your clipboard, the message and the link, ready to paste anywhere.',
};

/** The account name is different on X and does not exist on the other four. */
export function retag(text: string, network: ShareNetwork): string {
  if (network === 'farcaster') return text;
  const replacement = network === 'x' ? X_HANDLE : PLAIN_NAME;
  // Longest alternative first, or '@swipe_ai_' matches as '@swipe' and leaves a tail.
  return text.replace(/@swipe_ai_|@swipeai/gi, replacement);
}

/** CRLF out, trailing spaces off, no run of more than one blank line. */
export function tidy(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Cut to a budget on a word boundary where there is one near the end, and mark
 * the cut. The result is never longer than the limit, including the ellipsis.
 */
export function clip(value: string, limit: number): string {
  if (limit <= 0) return '';
  if (value.length <= limit) return value;
  if (limit === 1) return ELLIPSIS;

  const cut = value.slice(0, limit - 1);
  const lastBreak = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
  // Only honour a word boundary that is actually near the end. Backing up to a
  // space at 40% of the budget throws away more than the truncation saves.
  const kept = lastBreak > limit * 0.6 ? cut.slice(0, lastBreak) : cut;
  return kept.replace(/\s+$/, '') + ELLIPSIS;
}

/** The text half of a tweet, trimmed so the link still fits inside the 280. */
export function tweetBody(text: string, url: string): string {
  // The intent puts a space between the text and the link.
  const room = TWEET_LIMIT - url.length - 1;
  if (room <= 0) return '';
  return clip(text, room);
}

/**
 * Reddit's title. The question is the title when there is one, because a
 * Reddit title is a headline and the market question already is one. The
 * suffix says where the link goes, which is the thing Reddit readers ask.
 */
export function redditTitle(input: ShareInput): string {
  const question = (input.question ?? '').trim();
  const source = question
    ? `${question} (prediction market on Swipe)`
    : firstLine(tidy(retag(input.text ?? '', 'reddit')));
  return clip(source.replace(/\s+/g, ' ').trim(), REDDIT_TITLE_LIMIT);
}

function firstLine(text: string): string {
  const line = text.split('\n').find((candidate) => candidate.trim().length > 0);
  return (line ?? 'A prediction market on Swipe').trim();
}

function safeUrl(url: string | undefined): string {
  const trimmed = (url ?? '').trim();
  return trimmed.length > 0 ? trimmed : FALLBACK_SHARE_URL;
}

const enc = encodeURIComponent;

/**
 * The Warpcast compose page, used only when both composeCast transports fail.
 * `embeds[]` is Warpcast's own parameter name and keeps the card on the cast.
 */
export function farcasterComposeHref(body: string, url: string): string {
  return `https://warpcast.com/~/compose?text=${enc(body)}&embeds[]=${enc(url)}`;
}

export function composeShare(
  network: ShareNetwork,
  input: ShareInput
): ShareComposition {
  const url = safeUrl(input.url);
  const text = tidy(retag(input.text ?? '', network));
  const note = NOTES[network];

  switch (network) {
    case 'farcaster': {
      const body = clip(text, CAST_LIMIT);
      return {
        network,
        body,
        bodyLabel: 'cast',
        url,
        linkPlacement: 'embed',
        href: farcasterComposeHref(body, url),
        clipboard: null,
        limit: CAST_LIMIT,
        cost: body.length,
        note,
      };
    }

    case 'x': {
      const body = tweetBody(text, url);
      return {
        network,
        body,
        bodyLabel: 'tweet',
        url,
        linkPlacement: 'field',
        href: `https://twitter.com/intent/tweet?text=${enc(body)}&url=${enc(url)}`,
        clipboard: null,
        limit: TWEET_LIMIT,
        cost: body.length > 0 ? body.length + 1 + url.length : url.length,
        note,
      };
    }

    case 'facebook': {
      return {
        network,
        body: '',
        bodyLabel: 'post',
        url,
        linkPlacement: 'embed',
        href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
        clipboard: null,
        limit: null,
        cost: 0,
        note,
      };
    }

    case 'reddit': {
      const title = redditTitle({ ...input, url });
      return {
        network,
        body: title,
        bodyLabel: 'title',
        url,
        linkPlacement: 'field',
        href: `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(title)}`,
        clipboard: null,
        limit: REDDIT_TITLE_LIMIT,
        cost: title.length,
        note,
      };
    }

    case 'telegram': {
      return {
        network,
        body: text,
        bodyLabel: 'message',
        url,
        linkPlacement: 'field',
        href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,
        clipboard: null,
        limit: null,
        cost: text.length,
        note,
      };
    }

    case 'whatsapp': {
      const body = text.length > 0 ? `${text}\n\n${url}` : url;
      return {
        network,
        body,
        bodyLabel: 'message',
        url,
        linkPlacement: 'body',
        href: `https://wa.me/?text=${enc(body)}`,
        clipboard: null,
        limit: null,
        cost: body.length,
        note,
      };
    }

    case 'copy': {
      const body = text.length > 0 ? `${text}\n\n${url}` : url;
      return {
        network,
        body,
        bodyLabel: 'clipboard',
        url,
        linkPlacement: 'body',
        href: null,
        clipboard: body,
        limit: null,
        cost: body.length,
        note,
      };
    }
  }
}

// ---------------------------------------------------------------- the card

export interface ShareCardSubject {
  id: string;
  imageUrl?: string;
  includeChart?: boolean;
}

/**
 * A market whose card has to be drawn fresh, because the picture is a price
 * chart and yesterday's chart is the wrong picture. Same test the OG route and
 * app/prediction/[id]/layout.tsx run.
 */
export function isChartMarket(subject: ShareCardSubject): boolean {
  return Boolean(
    subject.includeChart || subject.imageUrl?.includes('geckoterminal.com')
  );
}

/**
 * The image every one of these destinations will actually attach, in the same
 * order of preference app/prediction/[id]/layout.tsx uses when it writes the
 * page's own metadata. If the preview showed anything else it would be a
 * mockup, not a preview.
 *
 * `generated` is the ImgBB URL that /api/og/upload/[id] returns, which is also
 * what the metadata reads back out of Redis.
 */
export function shareCardUrl(
  subject: ShareCardSubject,
  generated: string | null,
  chainKey?: string
): string {
  const drawn = `/api/og/prediction/${encodeURIComponent(subject.id)}${
    chainKey ? `?chain=${encodeURIComponent(chainKey)}` : ''
  }`;
  if (isChartMarket(subject)) return generated ?? drawn;
  if (subject.imageUrl) return subject.imageUrl;
  return drawn;
}

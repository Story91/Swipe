import { describe, expect, it } from 'vitest';
import {
  composeShare,
  FALLBACK_SHARE_URL,
  REDDIT_TITLE_LIMIT,
  retag,
  shareCardUrl,
  SHARE_NETWORKS,
  TWEET_LIMIT,
  type ShareInput,
  type ShareNetwork,
} from './shareTargets';

/**
 * The three things that break a share silently.
 *
 * A link that never made it into the intent, so the destination opens an empty
 * compose box. A character that was not encoded, so everything after the first
 * '&' in the message becomes somebody else's query parameter. And a tweet over
 * 280, which X does not reject, it just refuses to post until the user edits it
 * down by hand.
 */

const URL_WITH_QUERY = 'https://theswipe.app/prediction/abc123?ref=share&v=2';

const INPUT: ShareInput = {
  text: 'I just bet on @swipeai!\n\n"Will ETH close above $4,000 on 31 Dec?"\n\nWDYT?',
  url: URL_WITH_QUERY,
  question: 'Will ETH close above $4,000 on 31 Dec?',
};

/** Everything that opens a page rather than casting or copying. */
const LINK_NETWORKS: ShareNetwork[] = [
  'x',
  'facebook',
  'reddit',
  'telegram',
  'whatsapp',
];

describe('every destination gets a link', () => {
  it.each(SHARE_NETWORKS)('%s carries a non-empty url', (network) => {
    const share = composeShare(network, INPUT);
    expect(share.url).toBe(URL_WITH_QUERY);
    expect(share.url.length).toBeGreaterThan(0);
  });

  it.each(LINK_NETWORKS)('%s puts the encoded url in its href', (network) => {
    const share = composeShare(network, INPUT);
    expect(share.href).toBeTruthy();
    expect(share.href).toContain(encodeURIComponent(URL_WITH_QUERY));
  });

  it('falls back to the app origin when the caller has no url', () => {
    for (const network of SHARE_NETWORKS) {
      const share = composeShare(network, { ...INPUT, url: '   ' });
      expect(share.url).toBe(FALLBACK_SHARE_URL);
      if (share.href) {
        expect(share.href).toContain(encodeURIComponent(FALLBACK_SHARE_URL));
      }
    }
  });

  it('reaches Farcaster through the compose page when the SDK cannot be used', () => {
    const share = composeShare('farcaster', INPUT);
    expect(share.href).toContain('warpcast.com/~/compose');
    expect(share.href).toContain(`embeds[]=${encodeURIComponent(URL_WITH_QUERY)}`);
  });

  it('copies to the clipboard rather than opening anything', () => {
    const share = composeShare('copy', INPUT);
    expect(share.href).toBeNull();
    expect(share.clipboard).toContain(URL_WITH_QUERY);
  });
});

describe('encoding', () => {
  const HOSTILE: ShareInput = {
    text: 'Yes & no: 100% in #base @swipeai\nnext line?query=1',
    url: 'https://theswipe.app/prediction/x?a=1&b=2#top',
    question: 'Will it be 50% + 50%?',
  };

  it.each(LINK_NETWORKS)('%s leaves no raw separator in the href', (network) => {
    const share = composeShare(network, HOSTILE);
    const query = share.href!.split('?')[1] ?? '';
    // Every '&' left in the query must be one this module put there, so each
    // segment is a name=value pair and nothing from the message can add one.
    for (const segment of query.split('&')) {
      expect(segment).toMatch(/^[a-z]+(\[\])?=/);
    }
    // The raw text and the raw url never appear unencoded.
    expect(share.href).not.toContain(' ');
    expect(share.href).not.toContain('\n');
    expect(share.href).not.toContain('#top');
  });

  it('round trips the body back out of the href', () => {
    const share = composeShare('telegram', HOSTILE);
    const text = new URL(share.href!).searchParams.get('text');
    expect(text).toBe(share.body);
    const url = new URL(share.href!).searchParams.get('url');
    expect(url).toBe(HOSTILE.url);
  });

  it('encodes the emoji a share text is full of', () => {
    const share = composeShare('whatsapp', { ...INPUT, text: '🎯 bet placed' });
    expect(share.href).toContain(encodeURIComponent('🎯'));
    expect(share.href).not.toContain('🎯');
  });
});

describe('the 280 character budget on X', () => {
  it('keeps a short tweet exactly as written', () => {
    const share = composeShare('x', { ...INPUT, text: 'Short one.' });
    expect(share.body).toBe('Short one.');
    expect(share.cost).toBeLessThanOrEqual(TWEET_LIMIT);
  });

  it('trims a long tweet to fit around the link', () => {
    const long = 'word '.repeat(120).trim();
    const share = composeShare('x', { ...INPUT, text: long });
    expect(share.body.length).toBeLessThan(long.length);
    expect(share.body.endsWith('…')).toBe(true);
    expect(share.cost).toBe(share.body.length + 1 + share.url.length);
    expect(share.cost).toBeLessThanOrEqual(TWEET_LIMIT);
  });

  it('never overflows, whatever the text and the link add up to', () => {
    const url = `https://theswipe.app/prediction/${'z'.repeat(140)}`;
    for (const length of [0, 1, 50, 240, 279, 280, 281, 900]) {
      const share = composeShare('x', { text: 'a'.repeat(length), url });
      expect(share.cost).toBeLessThanOrEqual(TWEET_LIMIT);
      const rebuilt = share.body.length > 0 ? `${share.body} ${share.url}` : share.url;
      expect(rebuilt.length).toBeLessThanOrEqual(TWEET_LIMIT);
    }
  });

  it('drops the text rather than the link when the link alone fills the budget', () => {
    const url = `https://theswipe.app/${'z'.repeat(TWEET_LIMIT)}`;
    const share = composeShare('x', { text: 'anything', url });
    expect(share.body).toBe('');
    expect(share.url).toBe(url);
    expect(share.href).toContain(encodeURIComponent(url));
  });
});

describe('per network copy', () => {
  it('sends a different body to each destination', () => {
    const bodies = SHARE_NETWORKS.map((network) => composeShare(network, INPUT).body);
    expect(new Set(bodies).size).toBeGreaterThan(1);
  });

  it('keeps the Farcaster handle on Farcaster and swaps it on X', () => {
    expect(composeShare('farcaster', INPUT).body).toContain('@swipeai');
    expect(composeShare('x', INPUT).body).toContain('@swipe_ai_');
    expect(composeShare('x', INPUT).body).not.toContain('@swipeai!');
  });

  it('drops a handle nobody on that network can follow', () => {
    for (const network of ['facebook', 'reddit', 'telegram', 'whatsapp', 'copy'] as const) {
      expect(retag('bet on @swipeai now', network)).toBe('bet on Swipe now');
      expect(retag('bet on @swipe_ai_ now', network)).toBe('bet on Swipe now');
    }
  });

  it('gives Facebook the link on its own, because that is all it reads', () => {
    const share = composeShare('facebook', INPUT);
    expect(share.body).toBe('');
    expect(share.href).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(URL_WITH_QUERY)}`
    );
  });

  it('titles a Reddit post with the question, on one line', () => {
    const share = composeShare('reddit', INPUT);
    expect(share.body).toBe(
      'Will ETH close above $4,000 on 31 Dec? (prediction market on Swipe)'
    );
    expect(share.body).not.toContain('\n');
    expect(share.body.length).toBeLessThanOrEqual(REDDIT_TITLE_LIMIT);
  });

  it('caps a Reddit title Reddit would refuse', () => {
    const share = composeShare('reddit', { ...INPUT, question: 'q '.repeat(400) });
    expect(share.body.length).toBeLessThanOrEqual(REDDIT_TITLE_LIMIT);
  });

  it('falls back to the first line of the message when there is no question', () => {
    const share = composeShare('reddit', {
      text: 'Bet placed on @swipeai\n\nsecond line',
      url: URL_WITH_QUERY,
    });
    expect(share.body).toBe('Bet placed on Swipe');
  });

  it('puts the link inside the message where there is only one field', () => {
    for (const network of ['whatsapp', 'copy'] as const) {
      const share = composeShare(network, INPUT);
      expect(share.linkPlacement).toBe('body');
      expect(share.body).toContain(URL_WITH_QUERY);
    }
  });

  it('keeps the link out of the cast, because the embed carries it', () => {
    const share = composeShare('farcaster', INPUT);
    expect(share.linkPlacement).toBe('embed');
    expect(share.body).not.toContain(URL_WITH_QUERY);
  });
});

describe('the card that gets attached', () => {
  it('draws a chart market fresh and prefers the uploaded copy', () => {
    const subject = { id: 'abc', includeChart: true, imageUrl: 'https://img/old.png' };
    expect(shareCardUrl(subject, null, 'base')).toBe(
      '/api/og/prediction/abc?chain=base'
    );
    expect(shareCardUrl(subject, 'https://i.ibb.co/fresh.png', 'base')).toBe(
      'https://i.ibb.co/fresh.png'
    );
  });

  it('uses the market picture when there is one and no chart', () => {
    expect(shareCardUrl({ id: 'abc', imageUrl: 'https://img/pic.png' }, null)).toBe(
      'https://img/pic.png'
    );
  });

  it('falls back to the drawn card', () => {
    expect(shareCardUrl({ id: 'a b' }, null, 'robinhood')).toBe(
      '/api/og/prediction/a%20b?chain=robinhood'
    );
  });
});

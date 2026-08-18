import { describe, it, expect } from 'vitest';
import { notificationTemplates } from './notification-helpers';

/**
 * Push notifications cannot promise what the app does not have.
 *
 * Every template used to close with a pitch for free $SWIPE from daily tasks,
 * including the two that actually fire: a placed bet and a share. No daily task
 * pays $SWIPE and the token is not live, so the app was making a promise on the
 * one surface a user cannot check against the screen.
 *
 * This walks every template rather than the two live ones, because the dead
 * ones get wired up later and the copy is what ships when they do.
 */

/** Every template, called with arguments of the right shape. */
const rendered = [
  notificationTemplates.betSuccess(1, 'Will ETH close above 4000?', '25', 'YES', 'USDC'),
  notificationTemplates.betFailed(1, 'Will ETH close above 4000?', 'The approval was rejected.'),
  notificationTemplates.winningsClaimed(1, 'Will ETH close above 4000?', '48.25', 'USDG'),
  notificationTemplates.predictionShared(1, 'Will ETH close above 4000?', 'farcaster'),
  notificationTemplates.predictionResolved(1, 'Will ETH close above 4000?', 'YES', true),
  notificationTemplates.predictionResolved(1, 'Will ETH close above 4000?', 'NO', false),
  notificationTemplates.newPrediction(1, 'Will ETH close above 4000?', 'Crypto'),
  notificationTemplates.achievement(1, 'First bet', 'You placed your first bet.'),
  notificationTemplates.welcome(1),
  notificationTemplates.milestone(1, 'Ten predictions', 10),
  notificationTemplates.dailyTaskReminder(1, 'Place a bet'),
  notificationTemplates.dailyTaskCompleted(1, 'Place a bet'),
];

describe('what a notification is allowed to say', () => {
  it('never offers a reward the app cannot pay', () => {
    for (const n of rendered) {
      const text = `${n.title} ${n.body}`;
      expect(text, `promised a token in: ${text}`).not.toMatch(/\$SWIPE/i);
      expect(text, `promised something free in: ${text}`).not.toMatch(/\bfree\b/i);
      expect(text, `promised a reward in: ${text}`).not.toMatch(/\breward/i);
    }
  });

  it('names the token it was given, and never substitutes one', () => {
    const usdg = notificationTemplates.betSuccess(1, 'Q', '10', 'NO', 'USDG');
    expect(usdg.body).toContain('10 USDG');
    expect(usdg.body).not.toContain('ETH');

    // Compact only for SWIPE, because a stablecoin bet of 1200000 is not a
    // thing and rounding one to "1.2M" would hide a fat finger.
    expect(notificationTemplates.betSuccess(1, 'Q', '1200000', 'YES', 'SWIPE').body).toContain('1.2M SWIPE');
    expect(notificationTemplates.betSuccess(1, 'Q', '1200000', 'YES', 'USDC').body).toContain('1200000 USDC');
  });

  it('has no token argument to forget, so a bet cannot be announced in ETH by accident', () => {
    // @ts-expect-error the token is required, which is the whole point
    const missing = () => notificationTemplates.betSuccess(1, 'Q', '10', 'YES');
    expect(missing).toBeTypeOf('function');
  });
});

'use client';

import React, { type ReactNode } from 'react';
import './ComingSoonOverlay.css';

/**
 * Blurs a feature that depends on the old SWIPE token and explains what is
 * coming, without deleting it.
 *
 * The Base SWIPE token's fee stream sits in an archived contract, so the daily
 * tasks, the claim page and the token card are being rebuilt around the new
 * token on Robinhood Chain. Leaving the old screens visible but inert shows
 * people what the feature is and that it is returning; removing them would just
 * look like the app lost functionality.
 *
 * The market stats tab is deliberately not on that list any more. Its figures
 * are read from the live V4 contract in the chain's own stablecoin, and the
 * archived ETH and $SWIPE volume it still shows is labelled as archived on the
 * page itself. Wrapping it would blur a screen that is telling the truth. See
 * app/components/Market/CompactStats.tsx.
 *
 * The blurred content is hidden from assistive technology and taken out of the
 * tab order, so it cannot be operated by keyboard or read out as if it were live.
 */
export function ComingSoonOverlay({
  title = 'Coming soon',
  message,
  children,
}: {
  title?: string;
  message: string;
  children: ReactNode;
}) {
  return (
    <div className="coming-soon">
      <div className="coming-soon__panel" role="status">
        <p className="coming-soon__title">{title}</p>
        <p className="coming-soon__message">{message}</p>
        <p className="coming-soon__note">
          Preview below is the previous version and is not active.
        </p>
      </div>

      {/* `inert` is not in React 18's JSX types, but browsers honour the
          attribute: it removes the subtree from the tab order and from the
          accessibility tree, which aria-hidden alone does not do. */}
      <div className="coming-soon__content" aria-hidden="true" {...({ inert: '' } as Record<string, string>)}>
        {children}
      </div>
    </div>
  );
}

export default ComingSoonOverlay;

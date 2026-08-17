'use client';

import React from 'react';

/**
 * The two big price cards, in cents, side by side.
 *
 * Same shape as the USDC markets screen: a side name, the price, and a line
 * saying what pressing it does. The hint is not decoration, it is the only
 * thing on the page that says these are controls rather than readouts.
 *
 * `onPick` is a route push, not a bet. Nothing in this component touches a
 * contract, and the page that renders it must keep it that way: a real
 * placeBet from here would be a second staking implementation, and it would
 * also owe the price-history POST that keeps this chart moving.
 */
export function PriceCards({
  yesPrice,
  noPrice,
  onPick,
  disabled,
  hint,
}: {
  yesPrice: number;
  noPrice: number;
  onPick: (side: 'yes' | 'no') => void;
  disabled?: boolean;
  hint: string;
}) {
  return (
    <div className="mdet-prices">
      <button
        type="button"
        className="mdet-price mdet-price--yes"
        onClick={() => onPick('yes')}
        disabled={disabled}
      >
        <span className="mdet-price__side">Yes</span>
        <span className="mdet-price__value">{yesPrice}¢</span>
        <span className="mdet-price__hint">{hint}</span>
      </button>

      <button
        type="button"
        className="mdet-price mdet-price--no"
        onClick={() => onPick('no')}
        disabled={disabled}
      >
        <span className="mdet-price__side">No</span>
        <span className="mdet-price__value">{noPrice}¢</span>
        <span className="mdet-price__hint">{hint}</span>
      </button>
    </div>
  );
}

export default PriceCards;

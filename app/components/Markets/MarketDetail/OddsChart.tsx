'use client';

import React, { useMemo } from 'react';
import { XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart, CartesianGrid } from 'recharts';
import { Loader2, TrendingUp } from 'lucide-react';
import { chartPoints } from './marketDetail';
import type { PricePoint } from './marketDetail';

/**
 * The two-line odds chart from the USDC markets screen, as a component that
 * takes props and holds no state.
 *
 * It is a copy of that screen's expanded view rather than an import, and that
 * was the call: MarketCard in SwipeMarkets.tsx (retired since) was 485
 * unexported lines that mixed
 * the collapsed tile, the expanded detail, a contract read and an early-exit
 * path, so importing it meant editing the screen the app was happiest with in
 * order to widen a different page. The chart itself is fifty lines of recharts.
 *
 * The stylesheet is not copied. Every class on that screen is drawn for a white
 * card, with its dark values quarantined in a prefers-color-scheme block that
 * keys off the viewer's operating system rather than off the app. Dropped onto
 * a dark page by a viewer in light mode, they are dark text on a dark face.
 */
export function OddsChart({
  history,
  yesPrice,
  noPrice,
  totalPool,
  loading,
}: {
  history: PricePoint[];
  yesPrice: number;
  noPrice: number;
  totalPool: number;
  loading: boolean;
}) {
  const data = useMemo(
    () => chartPoints(history, yesPrice, noPrice, totalPool),
    [history, yesPrice, noPrice, totalPool]
  );

  return (
    <section className="mdet-panel mdet-chart">
      <h2 className="mdet-panel__title">Odds over time</h2>

      <div className="mdet-chart__plot">
        {loading ? (
          <div className="mdet-chart__state">
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            <span>Loading the price line</span>
          </div>
        ) : data.length >= 2 || totalPool > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="mdetYes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mdetNo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={true}
                vertical={false}
                stroke="rgba(255, 255, 255, 0.08)"
              />
              {/* 12px, not the 10px the card uses. Nothing on this page goes
                  under the floor. */}
              <XAxis
                dataKey="time"
                tick={{ fontSize: 12, fill: '#8a8a8a' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 12, fill: '#8a8a8a' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}¢`}
                ticks={[0, 25, 50, 75, 100]}
              />
              <Tooltip
                formatter={(value, name) => [`${value}¢`, name === 'yes' ? 'YES' : 'NO']}
                contentStyle={{
                  background: '#0d0d0d',
                  border: '1px solid #2c2c2c',
                  borderRadius: '0',
                  fontSize: '12px',
                  color: '#ffffff',
                }}
                labelStyle={{ color: '#b4b4b4' }}
              />
              <Area
                type="monotone"
                dataKey="yes"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#mdetYes)"
                name="yes"
              />
              <Area
                type="monotone"
                dataKey="no"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#mdetNo)"
                name="no"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="mdet-chart__state">
            <TrendingUp className="w-7 h-7" aria-hidden="true" />
            <span>The line starts at the first bet</span>
          </div>
        )}
      </div>
    </section>
  );
}

export default OddsChart;

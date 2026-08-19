'use client';

import { useMemo, useState } from 'react';
import { OddsChartPlot } from './OddsChart';
import { tokenChartSources, type TokenChartProvider } from './tokenChart';
import type { PricePoint } from './marketDetail';
import './MarketChart.css';

interface Props {
  imageUrl: string | undefined;
  history: PricePoint[];
  yesPrice: number;
  noPrice: number;
  totalPool: number;
  loading: boolean;
}

type View = 'market' | TokenChartProvider;

const PROVIDER_LABEL: Record<TokenChartProvider, string> = {
  geckoterminal: 'GeckoTerminal',
  dexscreener: 'DexScreener',
};

/**
 * The market's own odds chart, or - for a market with a parseable chart pool
 * (see tokenChart.ts) - a toggle between that and the underlying token's live
 * price on GeckoTerminal, DexScreener, or both, whichever the market's stored
 * chart URL and its known chain mapping actually support.
 *
 * A plain (non-crypto) market has no pool to chart, so it renders exactly the
 * bare OddsChart panel it always did: no toggle, one fewer thing to click for
 * a market where "live price" would not mean anything.
 */
export function MarketChart({ imageUrl, history, yesPrice, noPrice, totalPool, loading }: Props) {
  const sources = useMemo(() => tokenChartSources(imageUrl), [imageUrl]);
  const [view, setView] = useState<View>('market');

  if (!sources) {
    return (
      <section className="mdet-panel mdet-chart">
        <h2 className="mdet-panel__title">Odds over time</h2>
        <OddsChartPlot
          history={history}
          yesPrice={yesPrice}
          noPrice={noPrice}
          totalPool={totalPool}
          loading={loading}
        />
      </section>
    );
  }

  // Whichever of the two actually resolved. tokenChartSources never returns
  // both null - the provider the URL was stored for is always present - but
  // the other one is only filled in when its chain is known on both sides
  // (Robinhood-chain pools, for one, never get a GeckoTerminal tab: see
  // tokenChart.ts).
  const providers = (['geckoterminal', 'dexscreener'] as const).filter(
    (provider): provider is TokenChartProvider => Boolean(sources[provider])
  );

  return (
    <section className="mdet-panel mdet-chart">
      <div className="mdet-chartswitch">
        <h2 className="mdet-panel__title mdet-chartswitch__title">
          {view === 'market' ? 'Odds over time' : 'Live token price'}
        </h2>
        <div className="mdet-chartswitch__tabs" role="tablist" aria-label="Chart source">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'market'}
            className={`mdet-chartswitch__tab${view === 'market' ? ' mdet-chartswitch__tab--active' : ''}`}
            onClick={() => setView('market')}
          >
            Market
          </button>
          {providers.map((provider) => (
            <button
              key={provider}
              type="button"
              role="tab"
              aria-selected={view === provider}
              className={`mdet-chartswitch__tab${view === provider ? ' mdet-chartswitch__tab--active' : ''}`}
              onClick={() => setView(provider)}
            >
              {PROVIDER_LABEL[provider]}
            </button>
          ))}
        </div>
      </div>

      {view === 'market' ? (
        <OddsChartPlot
          history={history}
          yesPrice={yesPrice}
          noPrice={noPrice}
          totalPool={totalPool}
          loading={loading}
        />
      ) : (
        <div className="mdet-chart__plot mdet-chartswitch__frame">
          <iframe
            key={view}
            title={`${PROVIDER_LABEL[view]} price chart`}
            src={(view === 'geckoterminal' ? sources.geckoterminal : sources.dexscreener) ?? undefined}
            loading="lazy"
          />
        </div>
      )}
    </section>
  );
}

export default MarketChart;

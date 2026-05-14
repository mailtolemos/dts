import { notFound } from 'next/navigation';
import { Panel, PanelHeader, Pill, Stat, fmtPrice, fmtPct } from '@/components/ui';
import IndicationCard from '@/components/IndicationCard';
import PriceChart from '@/components/PriceChart';
import RegenButton from '@/components/RegenButton';
import { getAssetBundle } from '@/lib/services/market';

export const revalidate = 60;

export default async function AssetPage({ params }: { params: { symbol: string } }) {
  const symbol = params.symbol.toUpperCase();
  const b = await getAssetBundle(symbol);
  if (!b) notFound();

  const i = b.indicators;
  return (
    <div className="p-5 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-3">
            <div className="text-2xl font-semibold">{b.asset.symbol}</div>
            <div className="text-sm text-muted">{b.asset.name}</div>
            <Pill>{b.asset.assetClass}</Pill>
            {b.price?.stale ? <Pill tone="warn">stale</Pill>
              : b.price ? <Pill tone="accent">{b.price.source}</Pill>
              : <Pill tone="warn">no price</Pill>}
          </div>
          <div className="mt-1 mono tabular text-3xl">{b.price ? fmtPrice(b.price.last) : '—'}
            {b.price ? <span className="text-xs text-muted ml-2">±{fmtPrice(b.price.conf)}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RegenButton symbol={symbol} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <Panel className="h-[420px] flex flex-col">
          <PanelHeader title="Price" hint="Daily candles · 180d" />
          <div className="flex-1 p-2"><PriceChart data={b.ohlc} /></div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Indicators" />
            <div className="grid grid-cols-2">
              <Stat label="Trend"  value={b.trend} />
              <Stat label="Structure" value={b.structure.replaceAll('_', ' ')} />
              <Stat label="RSI 14" value={i.rsi14 != null ? i.rsi14.toFixed(1) : '—'}
                    tone={i.rsi14 != null ? (i.rsi14 > 70 ? 'bear' : i.rsi14 < 30 ? 'bull' : undefined) : undefined} />
              <Stat label="ATR %"  value={i.atrPct != null ? fmtPct(i.atrPct) : '—'} />
              <Stat label="SMA 50" value={fmtPrice(i.sma50)} />
              <Stat label="SMA 200" value={fmtPrice(i.sma200)} />
              <Stat label="MACD"   value={i.macd ? i.macd.line.toFixed(2) : '—'}
                    sub={i.macd ? `hist ${i.macd.hist.toFixed(2)}` : ''}
                    tone={i.macd ? (i.macd.hist > 0 ? 'bull' : 'bear') : undefined} />
              <Stat label="BB mid" value={i.bb ? fmtPrice(i.bb.mid) : '—'} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Levels" />
            <div className="px-4 py-3 text-[12px] space-y-2">
              <div><div className="text-muted text-[10px] uppercase tracking-wide">Resistance</div>
                <div className="mono tabular mt-0.5">{b.levels.resistance.length ? b.levels.resistance.map(fmtPrice).join(' · ') : '—'}</div></div>
              <div><div className="text-muted text-[10px] uppercase tracking-wide">Support</div>
                <div className="mono tabular mt-0.5">{b.levels.support.length ? b.levels.support.map(fmtPrice).join(' · ') : '—'}</div></div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-4">
          {b.card ? (
            <IndicationCard
              symbol={b.asset.symbol} name={b.asset.name}
              bias={b.card.bias as 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'WATCH'}
              horizon={b.card.horizon as 'INTRADAY' | 'SWING' | 'MULTIWEEK'}
              confidence={b.card.confidence as 'LOW' | 'MEDIUM' | 'HIGH'}
              reasoning={b.card.reasoning}
              keyLevels={b.card.keyLevels as { support?: number[]; resistance?: number[]; invalidation: number }}
              riskNotes={b.card.riskNotes}
              whatChangesView={b.card.whatChangesView}
              sourcesUsed={b.card.sourcesUsed}
              at={b.card.at}
            />
          ) : (
            <Panel>
              <PanelHeader title="AI thesis" hint="No card yet — click Regenerate to produce one." />
              <div className="px-4 py-6 text-sm text-muted">Run an analyst pass to generate an indication card for {symbol}.</div>
            </Panel>
          )}
        </div>

        <Panel>
          <PanelHeader title="News" hint="Most recent items mentioning this asset." />
          <div>
            {b.news.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted">No recent items.</div>
            ) : b.news.map((n) => (
              <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer"
                 className="block px-4 py-2.5 hover:bg-panel2 border-b border-border last:border-none">
                <div className="text-sm">{n.title}</div>
                <div className="text-[11px] text-muted mt-0.5">{n.source} · {new Date(n.publishedAt).toLocaleString()}</div>
              </a>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}


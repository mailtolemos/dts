import { Panel, PanelHeader, Pill, Stat, fmtPct, fmtPrice, toneFromChange } from '@/components/ui';
import Link from 'next/link';
import { getDashboard } from '@/lib/services/market';

export const dynamic = 'force-dynamic';

const REGIME_TONE: Record<string, 'bull' | 'bear' | 'warn' | 'neutral' | 'accent'> = {
  RISK_ON: 'bull', RISK_OFF: 'bear', CHOPPY: 'neutral',
  VOL_EXPANSION: 'warn', VOL_COMPRESSION: 'neutral',
  CRYPTO_LED: 'accent', EQUITY_LED: 'accent', MACRO_LED: 'warn', NEWS_DRIVEN: 'warn',
};

export default async function DashboardPage() {
  const d = await getDashboard();

  return (
    <div className="p-5 max-w-[1280px] mx-auto space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xl font-semibold">Market state</div>
          <div className="text-[11px] text-muted mono">updated {new Date(d.at).toLocaleString()}</div>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={REGIME_TONE[d.regime] ?? 'neutral'}>{d.regime.replaceAll('_', ' ')}</Pill>
          <Pill tone={d.riskScore > 0 ? 'bull' : d.riskScore < 0 ? 'bear' : 'neutral'}>
            risk {d.riskScore > 0 ? '+' : ''}{(d.riskScore).toFixed(2)}
          </Pill>
        </div>
      </div>

      <Panel>
        <PanelHeader title="AI summary" hint="Generated from prices, regime, news, and macro context." />
        <p className="px-4 py-3 text-[13px] leading-relaxed">{d.summary}</p>
      </Panel>

      <div className="grid md:grid-cols-4 gap-3">
        <Panel><Stat label="VIX"  value={d.vol.vix != null ? d.vol.vix.toFixed(2) : '—'} /></Panel>
        <Panel><Stat label="DXY"  value={d.vol.dxy != null ? d.vol.dxy.toFixed(2) : '—'} /></Panel>
        <Panel><Stat label="Fear & Greed" value={d.sentiment?.value ?? '—'} sub={d.sentiment?.classification} /></Panel>
        <Panel><Stat label="Risk score" value={(d.riskScore * 100).toFixed(0)} sub="-100 to +100" tone={d.riskScore > 0 ? 'bull' : 'bear'} /></Panel>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ClassCard title="Crypto"     items={d.classes.crypto.topMovers}    agg={d.classes.crypto.aggChange24h} />
        <ClassCard title="Indexes"    items={d.classes.equityIdx.topMovers} agg={d.classes.equityIdx.aggChange24h} />
        <ClassCard title="Commodities" items={d.classes.commodity.topMovers} agg={d.classes.commodity.aggChange24h} />
        <ClassCard title="FX"         items={d.classes.fx.topMovers}        agg={d.classes.fx.aggChange24h} />
      </div>
    </div>
  );
}

function ClassCard({ title, items, agg }: { title: string; items: Array<{ symbol: string; name: string; last: number; change24h: number }>; agg: number }) {
  return (
    <Panel>
      <PanelHeader title={title} right={
        <span className={'text-xs mono tabular ' + (agg > 0 ? 'text-bull' : agg < 0 ? 'text-bear' : 'text-muted')}>
          avg {fmtPct(agg)}
        </span>
      } />
      <div>
        {items.map((m) => (
          <Link key={m.symbol} href={`/asset/${m.symbol}`}
            className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-2 hover:bg-panel2 border-b border-border last:border-none">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{m.symbol} <span className="text-muted text-xs ml-1">{m.name}</span></div>
            </div>
            <div className="text-right mono tabular text-sm">{fmtPrice(m.last)}</div>
            <div className={'text-right mono tabular text-sm w-20 ' + (toneFromChange(m.change24h) === 'bull' ? 'text-bull' : toneFromChange(m.change24h) === 'bear' ? 'text-bear' : 'text-muted')}>
              {fmtPct(m.change24h)}
            </div>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

import { Panel, PanelHeader } from '@/components/ui';
import AssetRow from '@/components/AssetRow';
import { getAllPrices } from '@/lib/services/market';
import { UNIVERSE } from '@/lib/universe';
import { getOhlc } from '@/lib/providers/coingecko';

export const dynamic = 'force-dynamic';

interface SP { class?: string; q?: string }

export default async function FeedsPage({ searchParams }: { searchParams: SP }) {
  const cls = searchParams.class?.toUpperCase();
  const q = (searchParams.q ?? '').toLowerCase();

  const ticks = await getAllPrices();
  const filtered = UNIVERSE
    .filter((u) => !cls || u.assetClass === cls)
    .filter((u) => !q || u.symbol.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));

  const rows = await Promise.all(filtered.map(async (u) => {
    const t = ticks.find((x) => x.symbol === u.symbol);
    let pctChange24h: number | undefined;
    try {
      const o = await getOhlc(u.symbol, 2);
      if (o.length >= 2) pctChange24h = ((o[o.length-1]!.c - o[o.length-2]!.c) / o[o.length-2]!.c) * 100;
    } catch {/* ignore */}
    return {
      symbol: u.symbol, name: u.name, assetClass: u.assetClass,
      last: t?.price ?? 0, conf: t?.conf, source: t?.source, stale: t?.stale,
      updatedAt: t ? new Date(t.publishTime * 1000).toISOString() : '',
      pctChange24h,
    };
  }));

  return (
    <div className="p-5 max-w-[1280px] mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Price feeds</div>
        <div className="flex gap-2">
          <a href="/feeds" className={`text-xs px-2 py-1 rounded ${!cls ? 'bg-panel2 text-text' : 'text-muted hover:text-text'}`}>All</a>
          {['CRYPTO','EQUITY','INDEX','COMMODITY','FX','RATE'].map((c) => (
            <a key={c} href={`/feeds?class=${c}`} className={`text-xs px-2 py-1 rounded ${cls === c ? 'bg-panel2 text-text' : 'text-muted hover:text-text'}`}>{c}</a>
          ))}
        </div>
      </div>

      <Panel>
        <PanelHeader title={`${rows.length} feeds`} hint="Pyth primary, mock/CoinGecko fallback. Click a row for full analysis." />
        <div className="grid grid-cols-[1fr_120px_120px_90px_90px] text-[11px] text-muted px-4 py-2 border-b border-border uppercase tracking-wide">
          <div>Asset</div>
          <div className="text-right">Last</div>
          <div className="text-right">24h</div>
          <div className="text-right">Conf ±</div>
          <div className="text-right">Source</div>
        </div>
        <div>{rows.map((r) => <AssetRow key={r.symbol} {...r} />)}</div>
      </Panel>
    </div>
  );
}

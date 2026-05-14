import { Panel, PanelHeader } from '@/components/ui';
import AssetRow from '@/components/AssetRow';
import { prisma } from '@/lib/db';
import { getLatest, type FeedLookup } from '@/lib/providers/pyth';

export const revalidate = 30;

interface SP { class?: string; q?: string; page?: string }

const PAGE_SIZE = 50;
const CLASSES = ['CRYPTO','EQUITY','INDEX','COMMODITY','FX','RATE'] as const;

export default async function FeedsPage({ searchParams }: { searchParams: SP }) {
  const cls = searchParams.class?.toUpperCase() as typeof CLASSES[number] | undefined;
  const q = (searchParams.q ?? '').trim();
  const page = Math.max(1, Number(searchParams.page ?? 1));

  // Server-side filter + pagination from Prisma.
  const where = {
    ...(cls ? { assetClass: cls } : {}),
    ...(q ? {
      OR: [
        { symbol: { contains: q, mode: 'insensitive' as const } },
        { name:   { contains: q, mode: 'insensitive' as const } },
      ],
    } : {}),
  };

  const [total, assets] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      include: { feeds: { where: { provider: 'PYTH', active: true } },
                 snapshots: { orderBy: { at: 'desc' }, take: 1 } },
      orderBy: { symbol: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  // Live tick refresh for visible page only.
  const lookups: FeedLookup[] = assets
    .map((a) => ({ symbol: a.symbol, feedId: a.feeds[0]?.providerId ?? '' }))
    .filter((f) => f.feedId);
  const ticks = await getLatest(lookups);
  const byTick = new Map(ticks.map((t) => [t.symbol, t]));

  const rows = assets.map((a) => {
    const tick = byTick.get(a.symbol);
    const snap = a.snapshots[0];
    return {
      symbol: a.symbol, name: a.name, assetClass: a.assetClass,
      last: tick?.price ?? snap?.last ?? 0,
      conf: tick?.conf,
      source: tick?.source ?? 'DB',
      stale: tick?.stale ?? false,
      updatedAt: tick ? new Date(tick.publishTime * 1000).toISOString() : (snap?.at.toISOString() ?? ''),
      pctChange24h: snap?.change24h ?? undefined,
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseQs = (overrides: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const v = { class: cls, q, page, ...overrides } as Record<string, string | number | undefined>;
    if (v.class) p.set('class', String(v.class));
    if (v.q) p.set('q', String(v.q));
    if (v.page && Number(v.page) > 1) p.set('page', String(v.page));
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return (
    <div className="p-5 max-w-[1280px] mx-auto space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xl font-semibold">Price feeds</div>
          <div className="text-[11px] text-muted">{total.toLocaleString()} feeds across Pyth · CoinGecko (OHLC).</div>
        </div>
        <form action="/feeds" className="flex items-center gap-2">
          {cls ? <input type="hidden" name="class" value={cls} /> : null}
          <input
            type="text" name="q" defaultValue={q} placeholder="Search symbol or name…"
            className="bg-panel2 border border-border rounded px-3 py-1.5 text-sm w-64"
          />
          <button type="submit" className="text-xs px-3 py-1.5 rounded bg-panel2 border border-border hover:border-muted">Search</button>
        </form>
      </div>

      <div className="flex gap-2 flex-wrap">
        <a href="/feeds" className={`text-xs px-2 py-1 rounded ${!cls ? 'bg-panel2 text-text' : 'text-muted hover:text-text'}`}>All</a>
        {CLASSES.map((c) => (
          <a key={c} href={`/feeds?class=${c}`} className={`text-xs px-2 py-1 rounded ${cls === c ? 'bg-panel2 text-text' : 'text-muted hover:text-text'}`}>{c}</a>
        ))}
      </div>

      <Panel>
        <PanelHeader title={`${total.toLocaleString()} feeds · page ${page}/${totalPages}`}
                     hint="Click a row for chart, indicators, AI thesis." />
        <div className="grid grid-cols-[1fr_120px_120px_90px_90px] text-[11px] text-muted px-4 py-2 border-b border-border uppercase tracking-wide">
          <div>Asset</div>
          <div className="text-right">Last</div>
          <div className="text-right">24h</div>
          <div className="text-right">Conf ±</div>
          <div className="text-right">Source</div>
        </div>
        <div>
          {rows.length === 0
            ? <div className="px-4 py-6 text-sm text-muted">No feeds match your filter.</div>
            : rows.map((r) => <AssetRow key={r.symbol} {...r} />)}
        </div>
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs">
            <a aria-disabled={page <= 1} href={page > 1 ? `/feeds${baseQs({ page: page - 1 })}` : '#'}
               className={page <= 1 ? 'text-muted pointer-events-none' : 'hover:underline'}>← Prev</a>
            <span className="text-muted">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}</span>
            <a aria-disabled={page >= totalPages} href={page < totalPages ? `/feeds${baseQs({ page: page + 1 })}` : '#'}
               className={page >= totalPages ? 'text-muted pointer-events-none' : 'hover:underline'}>Next →</a>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

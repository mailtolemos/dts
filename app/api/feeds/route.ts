import { NextRequest } from 'next/server';
import { ok, err, paginate } from '@/lib/api';
import { getAllPrices } from '@/lib/services/market';
import { UNIVERSE } from '@/lib/universe';
import { logger } from '@/lib/logger';
import { getOhlc } from '@/lib/providers/coingecko';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const cls = url.searchParams.get('class')?.toUpperCase();
    const q   = url.searchParams.get('q')?.toLowerCase() ?? '';
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const pageSize = 50;

    const ticks = await getAllPrices();
    const rows = UNIVERSE
      .filter((u) => !cls || u.assetClass === cls)
      .filter((u) => !q || u.symbol.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
      .map((u) => {
        const t = ticks.find((x) => x.symbol === u.symbol);
        return {
          symbol: u.symbol, name: u.name, assetClass: u.assetClass,
          last: t?.price ?? 0,
          conf: t?.conf  ?? 0,
          updatedAt: t ? new Date(t.publishTime * 1000).toISOString() : new Date().toISOString(),
          source: t?.source ?? 'MOCK',
          stale: t?.stale ?? false,
          feedId: t?.feedId ?? '',
        };
      });

    // Best-effort 24h change for visible page.
    const paged = paginate(rows, page, pageSize);
    await Promise.all(paged.items.map(async (r, i) => {
      try {
        const o = await getOhlc(r.symbol, 2);
        if (o.length >= 2) {
          (paged.items[i] as { pctChange24h?: number }).pctChange24h =
            ((o[o.length-1]!.c - o[o.length-2]!.c) / o[o.length-2]!.c) * 100;
        }
      } catch {/* ignore */}
    }));

    return ok({ ...paged });
  } catch (e) {
    logger.error({ err: String(e) }, '/api/feeds failed');
    return err('INTERNAL', 'feeds failed');
  }
}

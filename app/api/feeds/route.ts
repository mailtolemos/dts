import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getLatest, type FeedLookup } from '@/lib/providers/pyth';
import { logger } from '@/lib/logger';

export const revalidate = 30;

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const cls = url.searchParams.get('class')?.toUpperCase();
    const q = url.searchParams.get('q')?.trim() ?? '';
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));

    const where = {
      ...(cls ? { assetClass: cls as 'CRYPTO' | 'EQUITY' | 'INDEX' | 'COMMODITY' | 'FX' | 'RATE' } : {}),
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
        skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      }),
    ]);

    const lookups: FeedLookup[] = assets
      .map((a) => ({ symbol: a.symbol, feedId: a.feeds[0]?.providerId ?? '' }))
      .filter((f) => f.feedId);
    const ticks = await getLatest(lookups);
    const byTick = new Map(ticks.map((t) => [t.symbol, t]));

    const items = assets.map((a) => {
      const tick = byTick.get(a.symbol);
      const snap = a.snapshots[0];
      return {
        symbol: a.symbol, name: a.name, assetClass: a.assetClass,
        last: tick?.price ?? snap?.last ?? 0,
        conf: tick?.conf ?? 0,
        updatedAt: tick ? new Date(tick.publishTime * 1000).toISOString() : (snap?.at.toISOString() ?? ''),
        source: tick?.source ?? 'DB',
        stale: tick?.stale ?? false,
        feedId: a.feeds[0]?.providerId ?? '',
        pctChange24h: snap?.change24h ?? null,
      };
    });

    return ok({ total, page, pageSize: PAGE_SIZE, items });
  } catch (e) {
    logger.error({ err: String(e) }, '/api/feeds failed');
    return err('INTERNAL', 'feeds failed');
  }
}

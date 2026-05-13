import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api';
import { getNews } from '@/lib/providers/cryptopanic';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const asset = url.searchParams.get('asset')?.toUpperCase();
    const impact = url.searchParams.get('impact') as 'LOW' | 'MEDIUM' | 'HIGH' | null;
    const limit = Math.min(50, Number(url.searchParams.get('limit') ?? 20));

    // Prefer DB-stored items (with classified impact), fall back to raw provider list.
    const dbItems = await prisma.newsItem.findMany({
      orderBy: { publishedAt: 'desc' }, take: limit,
      where: {
        ...(impact ? { impact } : {}),
        ...(asset ? { links: { some: { asset: { symbol: asset } } } } : {}),
      },
    });

    if (dbItems.length > 0) {
      return ok({ items: dbItems.map((n) => ({
        id: n.id, title: n.title, url: n.url, source: n.source, summary: n.summary,
        publishedAt: n.publishedAt.toISOString(), impact: n.impact,
        factuality: n.factuality, secondOrder: n.secondOrder,
      })) });
    }

    const raw = await getNews(asset ? { currency: asset } : {});
    return ok({ items: raw.slice(0, limit).map((n) => ({
      id: n.id, title: n.title, url: n.url, source: n.source,
      publishedAt: n.publishedAt, impact: 'LOW', factuality: 'REPORTED', secondOrder: null,
    })) });
  } catch (e) {
    logger.error({ err: String(e) }, '/api/news failed');
    return err('INTERNAL', 'news failed');
  }
}

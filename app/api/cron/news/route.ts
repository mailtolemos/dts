// Cron: fetch + classify news. Triggered every 15 minutes.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getNews } from '@/lib/providers/cryptopanic';
import { classifyNews } from '@/lib/ai/news';
import { evaluateNewsAlerts } from '@/lib/alerts/evaluator';
import { assertCronAuth } from '@/lib/cron';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest)  { return run(req); }

async function run(req: NextRequest) {
  const auth = assertCronAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: auth.reason } }, { status: 401 });
  const t0 = Date.now();
  let created = 0; let skipped = 0;
  try {
    const items = await getNews();
    for (const it of items.slice(0, 12)) {
      const exists = await prisma.newsItem.findUnique({ where: { url: it.url } });
      if (exists) { skipped++; continue; }
      const cls = await classifyNews(it.title);
      const newsItem = await prisma.newsItem.create({
        data: {
          url: it.url, source: it.source, title: it.title,
          publishedAt: new Date(it.publishedAt),
          impact: cls.impact, factuality: cls.factuality, secondOrder: cls.secondOrder,
        },
      });
      created++;
      const symbols = new Set([...(it.currencies ?? []), ...cls.affected]);
      for (const s of symbols) {
        const a = await prisma.asset.findUnique({ where: { symbol: s } });
        if (!a) continue;
        await prisma.newsAssetLink.upsert({
          where: { newsItemId_assetId: { newsItemId: newsItem.id, assetId: a.id } },
          create: { newsItemId: newsItem.id, assetId: a.id, weight: 1 },
          update: {},
        });
        if (cls.impact === 'MEDIUM' || cls.impact === 'HIGH') {
          await evaluateNewsAlerts({ assetId: a.id, impact: cls.impact, newsId: newsItem.id })
            .catch((e) => logger.warn({ err: String(e) }, 'news alerts'));
        }
      }
    }
    return NextResponse.json({ ok: true, created, skipped, durationMs: Date.now() - t0 });
  } catch (e) {
    logger.error({ err: String(e) }, 'cron/news failed');
    return NextResponse.json({ ok: false, error: { code: 'INTERNAL', message: String(e) } }, { status: 500 });
  }
}

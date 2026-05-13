import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const Body = z.object({
  symbol: z.string().min(1).max(12),
  type: z.enum(['PRICE_CROSS','PCT_MOVE','VOL_EXPANSION','THESIS_CHANGE','TREND_CHANGE','NEWS_EVENT']),
  params: z.record(z.any()),
});

export async function GET() {
  const user = await getCurrentUser();
  const list = await prisma.alert.findMany({
    where: { userId: user.id }, include: { asset: true, events: { orderBy: { firedAt: 'desc' }, take: 1 } },
    orderBy: { createdAt: 'desc' },
  });
  return ok({
    items: list.map((a) => ({
      id: a.id, type: a.type, params: a.params, enabled: a.enabled,
      symbol: a.asset?.symbol ?? null, lastTriggeredAt: a.lastTriggeredAt,
      lastEvent: a.events[0] ?? null, createdAt: a.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  let body: unknown; try { body = await req.json(); } catch { return err('BAD_REQUEST', 'invalid json'); }
  const p = Body.safeParse(body); if (!p.success) return err('BAD_REQUEST', p.error.message);
  const user = await getCurrentUser();
  const a = await prisma.asset.findUnique({ where: { symbol: p.data.symbol.toUpperCase() } });
  if (!a) return err('ASSET_NOT_FOUND', p.data.symbol);
  const alert = await prisma.alert.create({
    data: { userId: user.id, assetId: a.id, type: p.data.type, params: p.data.params as never, enabled: true },
  });
  return ok({ id: alert.id });
}

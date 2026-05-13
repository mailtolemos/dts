import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const Body = z.object({ symbol: z.string().min(1).max(12) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: unknown; try { body = await req.json(); } catch { return err('BAD_REQUEST', 'invalid json'); }
  const p = Body.safeParse(body); if (!p.success) return err('BAD_REQUEST', p.error.message);
  const user = await getCurrentUser();
  const wl = await prisma.watchlist.findFirst({ where: { id: params.id, userId: user.id } });
  if (!wl) return err('ASSET_NOT_FOUND', 'watchlist');
  const a = await prisma.asset.findUnique({ where: { symbol: p.data.symbol.toUpperCase() } });
  if (!a) return err('ASSET_NOT_FOUND', p.data.symbol);
  const max = await prisma.watchlistItem.aggregate({ where: { watchlistId: wl.id }, _max: { order: true } });
  await prisma.watchlistItem.upsert({
    where: { watchlistId_assetId: { watchlistId: wl.id, assetId: a.id } },
    create: { watchlistId: wl.id, assetId: a.id, order: (max._max.order ?? -1) + 1 },
    update: {},
  });
  return ok({ ok: true });
}

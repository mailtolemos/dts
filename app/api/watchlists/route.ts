import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  const lists = await prisma.watchlist.findMany({
    where: { userId: user.id }, orderBy: { order: 'asc' },
    include: { items: { include: { asset: true }, orderBy: { order: 'asc' } } },
  });
  return ok({
    items: lists.map((l) => ({
      id: l.id, name: l.name, order: l.order,
      assets: l.items.map((i) => ({ symbol: i.asset.symbol, name: i.asset.name, order: i.order })),
    })),
  });
}

const Body = z.object({ name: z.string().min(1).max(64) });

export async function POST(req: NextRequest) {
  let body: unknown; try { body = await req.json(); } catch { return err('BAD_REQUEST', 'invalid json'); }
  const p = Body.safeParse(body); if (!p.success) return err('BAD_REQUEST', p.error.message);
  const user = await getCurrentUser();
  const max = await prisma.watchlist.aggregate({ where: { userId: user.id }, _max: { order: true } });
  const wl = await prisma.watchlist.create({
    data: { name: p.data.name, userId: user.id, order: (max._max.order ?? -1) + 1 },
  });
  return ok({ id: wl.id, name: wl.name, order: wl.order });
}

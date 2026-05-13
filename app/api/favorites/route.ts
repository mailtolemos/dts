import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentUser();
    const favs = await prisma.favorite.findMany({
      where: { userId: user.id }, include: { asset: true }, orderBy: { createdAt: 'asc' },
    });
    return ok({ items: favs.map((f) => ({ symbol: f.asset.symbol, name: f.asset.name, addedAt: f.createdAt })) });
  } catch (e) { logger.error({ err: String(e) }); return err('INTERNAL', 'favorites failed'); }
}

const Body = z.object({ symbol: z.string().min(1).max(12) });

export async function POST(req: NextRequest) {
  let body: unknown; try { body = await req.json(); } catch { return err('BAD_REQUEST', 'invalid json'); }
  const p = Body.safeParse(body); if (!p.success) return err('BAD_REQUEST', p.error.message);
  try {
    const user = await getCurrentUser();
    const sym = p.data.symbol.toUpperCase();
    const asset = await prisma.asset.findUnique({ where: { symbol: sym } });
    if (!asset) return err('ASSET_NOT_FOUND', sym);
    await prisma.favorite.upsert({
      where: { userId_assetId: { userId: user.id, assetId: asset.id } },
      create: { userId: user.id, assetId: asset.id },
      update: {},
    });
    return ok({ ok: true });
  } catch (e) { logger.error({ err: String(e) }); return err('INTERNAL', 'favorites POST failed'); }
}

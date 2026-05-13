import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function DELETE(_req: NextRequest, { params }: { params: { symbol: string } }) {
  try {
    const user = await getCurrentUser();
    const asset = await prisma.asset.findUnique({ where: { symbol: params.symbol.toUpperCase() } });
    if (!asset) return err('ASSET_NOT_FOUND', params.symbol);
    await prisma.favorite.deleteMany({ where: { userId: user.id, assetId: asset.id } });
    return ok({ ok: true });
  } catch (e) { logger.error({ err: String(e) }); return err('INTERNAL', 'fav delete failed'); }
}

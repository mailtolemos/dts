import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const asset = url.searchParams.get('asset')?.toUpperCase();
    const horizon = url.searchParams.get('horizon') as
      'INTRADAY' | 'SWING' | 'MULTIWEEK' | null;
    const limit = Math.min(50, Number(url.searchParams.get('limit') ?? 20));

    const where: Record<string, unknown> = {};
    if (asset)   where.asset = { symbol: asset };
    if (horizon) where.horizon = horizon;

    const rows = await prisma.aiAnalysis.findMany({
      where, take: limit, orderBy: { at: 'desc' }, include: { asset: true },
    });

    return ok({
      items: rows.map((r) => ({
        symbol: r.asset.symbol, name: r.asset.name,
        bias: r.bias, horizon: r.horizon, confidence: r.confidence,
        reasoning: r.reasoning, keyLevels: r.keyLevels,
        riskNotes: r.riskNotes, whatChangesView: r.whatChangesView,
        sourcesUsed: r.sourcesUsed, at: r.at.toISOString(),
        model: r.model,
      })),
    });
  } catch (e) {
    logger.error({ err: String(e) }, '/api/cards failed');
    return err('INTERNAL', 'cards failed');
  }
}

import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api';
import { regenerateCard } from '@/lib/services/market';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const Body = z.object({ symbol: z.string().min(1).max(12) });

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return err('BAD_REQUEST', 'invalid json'); }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return err('BAD_REQUEST', parsed.error.message);

  try {
    const card = await regenerateCard(parsed.data.symbol.toUpperCase());
    return ok({ ok: true, card });
  } catch (e) {
    const msg = String(e);
    if (msg.includes('ASSET_NOT_FOUND')) return err('ASSET_NOT_FOUND', msg);
    logger.error({ err: msg }, '/api/cards/regenerate failed');
    return err('INTERNAL', 'regenerate failed');
  }
}

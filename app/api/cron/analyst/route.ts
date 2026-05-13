// Cron: run AI analyst for a slice of the top assets per invocation.
// Triggered by GitHub Actions every 15 minutes.
// Each call processes BATCH_SIZE symbols; subset rotates by hour to stay under
// Vercel's function timeout (60s).
import { NextRequest, NextResponse } from 'next/server';
import { regenerateCard } from '@/lib/services/market';
import { assertCronAuth } from '@/lib/cron';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TOP_SYMBOLS = ['BTC','ETH','SOL','XRP','BNB','ADA','AVAX','DOGE','LINK','SPX','NDX','XAU','VIX','EURUSD','DXY'];
const BATCH_SIZE = 2;

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest)  { return run(req); }

async function run(req: NextRequest) {
  const auth = assertCronAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: auth.reason } }, { status: 401 });
  const t0 = Date.now();
  // Rotate which slice runs each invocation so every asset eventually gets processed.
  const url = new URL(req.url);
  const explicitOffset = Number(url.searchParams.get('offset'));
  const offset = Number.isFinite(explicitOffset) ? explicitOffset : (Math.floor(Date.now() / (15 * 60_000)) * BATCH_SIZE) % TOP_SYMBOLS.length;
  const slice = [...TOP_SYMBOLS, ...TOP_SYMBOLS].slice(offset, offset + BATCH_SIZE);

  const results: Array<{ sym: string; ok: boolean; bias?: string; err?: string }> = [];
  for (const sym of slice) {
    try {
      const card = await regenerateCard(sym) as { bias?: string };
      results.push({ sym, ok: true, bias: card.bias });
    } catch (e) {
      logger.warn({ err: String(e), sym }, 'analyst slice item failed');
      results.push({ sym, ok: false, err: String(e) });
    }
  }
  return NextResponse.json({ ok: true, offset, slice, results, durationMs: Date.now() - t0 });
}

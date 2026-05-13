// Cron: write market regime snapshot. Triggered every 5 minutes.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOhlc } from '@/lib/providers/coingecko';
import { getAllMacro } from '@/lib/providers/fred';
import { classifyRegime, riskScore } from '@/lib/analysis/regime';
import { assertCronAuth } from '@/lib/cron';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest)  { return run(req); }

async function run(req: NextRequest) {
  const auth = assertCronAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: auth.reason } }, { status: 401 });
  const t0 = Date.now();
  try {
    const macro = await getAllMacro();
    const btc = await getOhlc('BTC', 2).catch(() => []);
    const btcCh = btc.length >= 2 ? ((btc[btc.length-1]!.c - btc[btc.length-2]!.c) / btc[btc.length-2]!.c) * 100 : 0;
    const inputs = { btcChange1d: btcCh, spxChange1d: 0, vix: macro.VIX, us10y: macro.US10Y, dxyChange1d: 0, highImpactNews: 0 };
    const regime = classifyRegime(inputs);
    const rs = riskScore(inputs);
    await prisma.marketSnapshot.create({
      data: { regime, riskScore: rs, vix: macro.VIX, dxy: macro.DXY,
              summary: `regime=${regime} risk=${rs.toFixed(2)}`, inputs: inputs as never },
    });
    return NextResponse.json({ ok: true, regime, riskScore: rs, durationMs: Date.now() - t0 });
  } catch (e) {
    logger.error({ err: String(e) }, 'cron/regime failed');
    return NextResponse.json({ ok: false, error: { code: 'INTERNAL', message: String(e) } }, { status: 500 });
  }
}

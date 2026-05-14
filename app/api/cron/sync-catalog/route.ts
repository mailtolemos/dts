// Cron: pull the full Pyth Hermes feed catalog and upsert Asset+PriceFeed rows.
// Runs daily. Idempotent — safe to invoke manually any time.
import { NextRequest, NextResponse } from 'next/server';
import { syncCatalog } from '@/lib/services/catalog';
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
  try {
    const result = await syncCatalog();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error({ err: String(e) }, 'cron/sync-catalog failed');
    return NextResponse.json({ ok: false, error: { code: 'INTERNAL', message: String(e) } }, { status: 500 });
  }
}

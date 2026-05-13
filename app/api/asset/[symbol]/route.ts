import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api';
import { getAssetBundle } from '@/lib/services/market';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { symbol: string } }) {
  try {
    const bundle = await getAssetBundle(params.symbol.toUpperCase());
    if (!bundle) return err('ASSET_NOT_FOUND', `unknown symbol ${params.symbol}`);
    return ok(bundle);
  } catch (e) {
    logger.error({ err: String(e), symbol: params.symbol }, '/api/asset failed');
    return err('INTERNAL', 'asset failed');
  }
}

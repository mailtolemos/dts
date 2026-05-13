import { ok, err } from '@/lib/api';
import { getDashboard } from '@/lib/services/market';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    return ok(await getDashboard());
  } catch (e) {
    logger.error({ err: String(e) }, '/api/dashboard failed');
    return err('INTERNAL', 'dashboard failed');
  }
}

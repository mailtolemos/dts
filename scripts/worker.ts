// Worker stub.
//
// Production scheduling is handled by GitHub Actions hitting the cron API
// routes (see .github/workflows/cron.yml). This script remains as a
// developer convenience for running the same loops locally.
//
// To run: `pnpm worker` after `pnpm seed`.

import { regenerateCard } from '../lib/services/market';
import { syncCatalog } from '../lib/services/catalog';
import { logger } from '../lib/logger';
import { prisma } from '../lib/db';

const TOP = ['BTC', 'ETH', 'SOL', 'AAPL', 'NVDA', 'SPY', 'XAU', 'EURUSD'];

async function main() {
  logger.info('worker started — syncing catalog');
  await syncCatalog().catch((e) => logger.error({ err: String(e) }, 'catalog sync failed'));

  for (const sym of TOP) {
    try {
      const a = await prisma.asset.findUnique({ where: { symbol: sym } });
      if (!a) continue;
      await regenerateCard(sym);
      logger.info({ sym }, 'card regenerated');
    } catch (err) {
      logger.warn({ err: String(err), sym }, 'card regen failed');
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });

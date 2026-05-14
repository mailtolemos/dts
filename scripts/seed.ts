// Bootstrap script.
//   - Upserts the default user.
//   - Syncs the full Pyth catalog into the DB.
//   - Creates a default watchlist with a handful of liquid favorites.

import { prisma } from '../lib/db';
import { syncCatalog } from '../lib/services/catalog';
import { env } from '../lib/env';
import { logger } from '../lib/logger';

async function main() {
  const email = env().DTS_USER_EMAIL;
  const user = await prisma.user.upsert({
    where: { email }, create: { email, displayName: 'You' }, update: {},
  });
  logger.info({ user: user.email }, 'user upserted');

  const result = await syncCatalog();
  logger.info(result, 'catalog synced');

  // Default favorites (best-effort — quietly skip any that aren't in catalog).
  const favSymbols = ['BTC', 'ETH', 'SOL', 'AAPL', 'NVDA', 'TSLA', 'SPY', 'QQQ', 'XAU', 'EURUSD'];
  let wl = await prisma.watchlist.findFirst({ where: { userId: user.id, name: 'Default' } });
  if (!wl) {
    wl = await prisma.watchlist.create({
      data: { userId: user.id, name: 'Default', order: 0 },
    });
  }
  let added = 0;
  for (let i = 0; i < favSymbols.length; i++) {
    const sym = favSymbols[i]!;
    const a = await prisma.asset.findUnique({ where: { symbol: sym } });
    if (!a) continue;
    await prisma.favorite.upsert({
      where: { userId_assetId: { userId: user.id, assetId: a.id } },
      create: { userId: user.id, assetId: a.id }, update: {},
    });
    await prisma.watchlistItem.upsert({
      where: { watchlistId_assetId: { watchlistId: wl.id, assetId: a.id } },
      create: { watchlistId: wl.id, assetId: a.id, order: i }, update: { order: i },
    });
    added++;
  }
  logger.info({ added }, 'watchlist seeded');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });

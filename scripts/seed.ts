// Seeds the asset universe + a default user + a default watchlist.
// Resolves Pyth feed IDs from Hermes when available; falls back to placeholders so the app
// still runs offline.

import { prisma } from '../lib/db';
import { UNIVERSE } from '../lib/universe';
import { env } from '../lib/env';
import { logger } from '../lib/logger';

interface HermesFeed { id: string; attributes: { symbol: string; asset_type: string } }

async function fetchPythCatalog(): Promise<Map<string, string>> {
  try {
    const r = await fetch(`${env().PYTH_HERMES_URL}/v2/price_feeds`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${r.status}`);
    const json = await r.json() as HermesFeed[];
    const map = new Map<string, string>();
    for (const f of json) map.set(f.attributes.symbol, f.id);
    return map;
  } catch (err) {
    logger.warn({ err: String(err) }, 'pyth catalog fetch failed; using placeholders');
    return new Map();
  }
}

async function main() {
  const pythMap = await fetchPythCatalog();

  // Default user (single-user mode).
  const email = env().DTS_USER_EMAIL;
  const user = await prisma.user.upsert({
    where: { email }, create: { email, displayName: 'You' }, update: {},
  });

  // Assets + feeds.
  for (const u of UNIVERSE) {
    const asset = await prisma.asset.upsert({
      where: { symbol: u.symbol },
      create: { symbol: u.symbol, name: u.name, assetClass: u.assetClass,
                metadata: { coingeckoId: u.coingeckoId ?? null } },
      update: { name: u.name, assetClass: u.assetClass },
    });

    if (u.pythSymbol) {
      const id = pythMap.get(u.pythSymbol) ?? `placeholder:${u.symbol}`;
      await prisma.priceFeed.upsert({
        where: { providerId: id },
        create: {
          assetId: asset.id, providerId: id, provider: 'PYTH',
          displaySymbol: u.pythSymbol, decimals: 8, active: true,
        },
        update: {},
      });
    }
  }

  // Default watchlist with 8 favorites.
  const favSymbols = ['BTC','ETH','SOL','SPX','NDX','XAU','EURUSD','VIX'];
  const wl = await prisma.watchlist.upsert({
    where: { id: `${user.id}-default` },
    create: { id: `${user.id}-default`, userId: user.id, name: 'Watchlist', order: 0 },
    update: {},
  });
  for (let i = 0; i < favSymbols.length; i++) {
    const s = favSymbols[i]!;
    const a = await prisma.asset.findUnique({ where: { symbol: s } });
    if (!a) continue;
    await prisma.favorite.upsert({
      where: { userId_assetId: { userId: user.id, assetId: a.id } },
      create: { userId: user.id, assetId: a.id }, update: {},
    });
    await prisma.watchlistItem.upsert({
      where: { watchlistId_assetId: { watchlistId: wl.id, assetId: a.id } },
      create: { watchlistId: wl.id, assetId: a.id, order: i }, update: { order: i },
    });
  }

  console.log(`Seeded ${UNIVERSE.length} assets, ${pythMap.size > 0 ? 'with' : 'without'} Pyth catalog.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });

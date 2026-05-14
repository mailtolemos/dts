// Catalog sync: pull the full Pyth Hermes feed list and upsert Asset +
// PriceFeed rows for each. Run on first deploy and then daily by cron.

import { prisma } from '../db';
import { listAllFeeds, type HermesFeedRow } from '../providers/pyth';
import { logger } from '../logger';
import type { AssetClass } from '../types';

// Map Pyth's asset_type → our AssetClass enum. Anything outside the set is
// stored under its closest fit; unmapped types are skipped.
function mapAssetType(t: string): AssetClass | null {
  switch (t.toLowerCase()) {
    case 'crypto':
    case 'crypto nav':
    case 'crypto index':
    case 'crypto redemption rate':
      return 'CRYPTO';
    case 'equity':
      return 'EQUITY';
    case 'fx':
      return 'FX';
    case 'commodities':
      return 'COMMODITY';
    case 'metal':
      return 'COMMODITY';
    case 'rates':
      return 'RATE';
    case 'eco':
    case 'kalshi':
    default:
      return null;
  }
}

// Pyth symbols come like "Crypto.BTC/USD", "Equity.US.AAPL/USD", "FX.EUR/USD",
// "Metal.XAU/USD". We extract a friendly short symbol — base currency with a
// disambiguating suffix when needed (post-market, redemption, etc.).
function shortSymbol(row: HermesFeedRow): string {
  const a = row.attributes;
  const base = (a.base ?? '').toUpperCase();
  const quote = (a.quote_currency ?? '').toUpperCase();
  const sym = a.symbol ?? '';

  // FX: prefer "EURUSD" form.
  if (a.asset_type.toLowerCase() === 'fx' && base && quote) {
    return `${base}${quote}`;
  }
  // Equities with venue suffix (POST/PRE) — keep them to avoid collisions.
  if (a.asset_type === 'Equity') {
    const m = sym.match(/Equity\.[A-Z]+\.([A-Z0-9.\-]+)\/[A-Z]+(?:\.([A-Z]+))?$/);
    if (m) {
      const ticker = m[1];
      const venue = m[2];
      return venue ? `${ticker}.${venue}` : ticker!;
    }
  }
  // Default: just the base.
  if (base) return base;
  // Last resort: the full Pyth symbol (uniqueness guaranteed).
  return sym;
}

export interface SyncResult {
  total: number;
  synced: number;
  skipped: number;
  durationMs: number;
}

export async function syncCatalog(opts: { limit?: number } = {}): Promise<SyncResult> {
  const t0 = Date.now();
  let feeds = await listAllFeeds();
  if (opts.limit) feeds = feeds.slice(0, opts.limit);

  // De-duplicate by short symbol — Pyth has multiple variants (POST/PRE etc.)
  // for the same ticker. We keep the first occurrence per (symbol, asset_type)
  // and store the rest with their venue suffix.
  const usedSymbols = new Set<string>();
  let synced = 0, skipped = 0;

  for (const f of feeds) {
    const cls = mapAssetType(f.attributes.asset_type);
    if (!cls) { skipped++; continue; }

    let symbol = shortSymbol(f);
    // If symbol already taken by a different feed, append a short hash of the id.
    if (usedSymbols.has(symbol)) {
      symbol = `${symbol}.${f.id.slice(0, 6)}`;
    }
    usedSymbols.add(symbol);

    try {
      // Upsert asset.
      const asset = await prisma.asset.upsert({
        where: { symbol },
        create: {
          symbol,
          name: f.attributes.description?.slice(0, 200) || f.attributes.symbol,
          assetClass: cls,
          metadata: {
            pythSymbol: f.attributes.symbol,
            base: f.attributes.base,
            quote: f.attributes.quote_currency,
            country: f.attributes.country ?? null,
            schedule: f.attributes.schedule ?? null,
            assetType: f.attributes.asset_type,
          },
        },
        update: {
          name: f.attributes.description?.slice(0, 200) || f.attributes.symbol,
          assetClass: cls,
        },
      });
      synced++;

      // Upsert price feed.
      const providerId = f.id.startsWith('0x') ? f.id : `0x${f.id}`;
      await prisma.priceFeed.upsert({
        where: { providerId },
        create: {
          assetId: asset.id,
          providerId,
          provider: 'PYTH',
          displaySymbol: f.attributes.display_symbol ?? f.attributes.symbol,
          decimals: 8,
          active: true,
        },
        update: {
          assetId: asset.id,
          displaySymbol: f.attributes.display_symbol ?? f.attributes.symbol,
          active: true,
        },
      });
    } catch (err) {
      logger.warn({ err: String(err), symbol, pyth: f.attributes.symbol }, 'catalog upsert failed');
      skipped++;
    }
  }

  const result = { total: feeds.length, synced, skipped, durationMs: Date.now() - t0 };
  logger.info(result, 'catalog sync done');
  return result;
}

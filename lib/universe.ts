// Catalog is now stored in the DB and populated dynamically from Pyth via
// lib/services/catalog.ts. This file is kept only for the type definition
// used by older code paths.
import type { AssetClass } from './types';

export interface UniverseAsset {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  pythId?: string;
  pythSymbol?: string;
  coingeckoId?: string;
}

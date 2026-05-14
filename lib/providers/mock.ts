// Mock provider removed. DTS uses real data only. This file is kept as a
// placeholder so older imports compile to clear errors instead of stale data.
//
// If anything imports from this file, replace it with the real provider.

export function mockTick(): never {
  throw new Error('mock provider has been removed — use lib/providers/pyth.ts');
}
export function mockCandles(): never {
  throw new Error('mock provider has been removed — use lib/providers/coingecko.ts');
}

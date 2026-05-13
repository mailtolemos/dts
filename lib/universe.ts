// The default asset universe DTS knows about. Used by seed and as a fallback when DB is empty.
// `pythId` values are placeholders; scripts/seed.ts resolves real ids from Hermes.

import type { AssetClass } from './types';

export interface UniverseAsset {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  pythId?: string;
  pythSymbol?: string; // e.g. "Crypto.BTC/USD"
  coingeckoId?: string;
}

export const UNIVERSE: UniverseAsset[] = [
  // Crypto
  { symbol: 'BTC',   name: 'Bitcoin',     assetClass: 'CRYPTO',    pythSymbol: 'Crypto.BTC/USD',   coingeckoId: 'bitcoin' },
  { symbol: 'ETH',   name: 'Ethereum',    assetClass: 'CRYPTO',    pythSymbol: 'Crypto.ETH/USD',   coingeckoId: 'ethereum' },
  { symbol: 'SOL',   name: 'Solana',      assetClass: 'CRYPTO',    pythSymbol: 'Crypto.SOL/USD',   coingeckoId: 'solana' },
  { symbol: 'BNB',   name: 'BNB',         assetClass: 'CRYPTO',    pythSymbol: 'Crypto.BNB/USD',   coingeckoId: 'binancecoin' },
  { symbol: 'XRP',   name: 'XRP',         assetClass: 'CRYPTO',    pythSymbol: 'Crypto.XRP/USD',   coingeckoId: 'ripple' },
  { symbol: 'ADA',   name: 'Cardano',     assetClass: 'CRYPTO',    pythSymbol: 'Crypto.ADA/USD',   coingeckoId: 'cardano' },
  { symbol: 'AVAX',  name: 'Avalanche',   assetClass: 'CRYPTO',    pythSymbol: 'Crypto.AVAX/USD',  coingeckoId: 'avalanche-2' },
  { symbol: 'DOGE',  name: 'Dogecoin',    assetClass: 'CRYPTO',    pythSymbol: 'Crypto.DOGE/USD',  coingeckoId: 'dogecoin' },
  { symbol: 'LINK',  name: 'Chainlink',   assetClass: 'CRYPTO',    pythSymbol: 'Crypto.LINK/USD',  coingeckoId: 'chainlink' },
  { symbol: 'MATIC', name: 'Polygon',     assetClass: 'CRYPTO',    pythSymbol: 'Crypto.MATIC/USD', coingeckoId: 'matic-network' },
  { symbol: 'DOT',   name: 'Polkadot',    assetClass: 'CRYPTO',    pythSymbol: 'Crypto.DOT/USD',   coingeckoId: 'polkadot' },
  { symbol: 'TON',   name: 'Toncoin',     assetClass: 'CRYPTO',    pythSymbol: 'Crypto.TON/USD',   coingeckoId: 'the-open-network' },
  { symbol: 'SUI',   name: 'Sui',         assetClass: 'CRYPTO',    pythSymbol: 'Crypto.SUI/USD',   coingeckoId: 'sui' },
  { symbol: 'ARB',   name: 'Arbitrum',    assetClass: 'CRYPTO',    pythSymbol: 'Crypto.ARB/USD',   coingeckoId: 'arbitrum' },
  { symbol: 'OP',    name: 'Optimism',    assetClass: 'CRYPTO',    pythSymbol: 'Crypto.OP/USD',    coingeckoId: 'optimism' },
  { symbol: 'ATOM',  name: 'Cosmos',      assetClass: 'CRYPTO',    pythSymbol: 'Crypto.ATOM/USD',  coingeckoId: 'cosmos' },

  // Indexes
  { symbol: 'SPX', name: 'S&P 500',       assetClass: 'INDEX',     pythSymbol: 'Equity.US.SPY/USD' },
  { symbol: 'NDX', name: 'Nasdaq 100',    assetClass: 'INDEX',     pythSymbol: 'Equity.US.QQQ/USD' },
  { symbol: 'RUT', name: 'Russell 2000',  assetClass: 'INDEX',     pythSymbol: 'Equity.US.IWM/USD' },
  { symbol: 'DJI', name: 'Dow Jones',     assetClass: 'INDEX',     pythSymbol: 'Equity.US.DIA/USD' },
  { symbol: 'VIX', name: 'VIX',           assetClass: 'INDEX' },

  // Equities
  { symbol: 'AAPL', name: 'Apple',        assetClass: 'EQUITY',    pythSymbol: 'Equity.US.AAPL/USD' },
  { symbol: 'MSFT', name: 'Microsoft',    assetClass: 'EQUITY',    pythSymbol: 'Equity.US.MSFT/USD' },
  { symbol: 'NVDA', name: 'NVIDIA',       assetClass: 'EQUITY',    pythSymbol: 'Equity.US.NVDA/USD' },
  { symbol: 'AMZN', name: 'Amazon',       assetClass: 'EQUITY',    pythSymbol: 'Equity.US.AMZN/USD' },
  { symbol: 'TSLA', name: 'Tesla',        assetClass: 'EQUITY',    pythSymbol: 'Equity.US.TSLA/USD' },
  { symbol: 'META', name: 'Meta',         assetClass: 'EQUITY',    pythSymbol: 'Equity.US.META/USD' },
  { symbol: 'GOOG', name: 'Alphabet',     assetClass: 'EQUITY',    pythSymbol: 'Equity.US.GOOG/USD' },
  { symbol: 'JPM',  name: 'JPMorgan',     assetClass: 'EQUITY',    pythSymbol: 'Equity.US.JPM/USD' },

  // Commodities
  { symbol: 'XAU',  name: 'Gold',         assetClass: 'COMMODITY', pythSymbol: 'Metal.XAU/USD' },
  { symbol: 'XAG',  name: 'Silver',       assetClass: 'COMMODITY', pythSymbol: 'Metal.XAG/USD' },
  { symbol: 'WTI',  name: 'WTI Crude',    assetClass: 'COMMODITY' },
  { symbol: 'BRENT',name: 'Brent Crude',  assetClass: 'COMMODITY' },
  { symbol: 'NG',   name: 'Natural Gas',  assetClass: 'COMMODITY' },
  { symbol: 'HG',   name: 'Copper',       assetClass: 'COMMODITY' },

  // FX
  { symbol: 'EURUSD', name: 'Euro / US Dollar',    assetClass: 'FX', pythSymbol: 'FX.EUR/USD' },
  { symbol: 'GBPUSD', name: 'Pound / US Dollar',   assetClass: 'FX', pythSymbol: 'FX.GBP/USD' },
  { symbol: 'USDJPY', name: 'US Dollar / Yen',     assetClass: 'FX', pythSymbol: 'FX.USD/JPY' },
  { symbol: 'USDCAD', name: 'US Dollar / CAD',     assetClass: 'FX', pythSymbol: 'FX.USD/CAD' },
  { symbol: 'AUDUSD', name: 'Aussie / US Dollar',  assetClass: 'FX', pythSymbol: 'FX.AUD/USD' },
  { symbol: 'USDCHF', name: 'US Dollar / CHF',     assetClass: 'FX', pythSymbol: 'FX.USD/CHF' },
  { symbol: 'DXY',    name: 'US Dollar Index',     assetClass: 'FX' },

  // Rates
  { symbol: 'US10Y', name: 'US 10Y Yield',         assetClass: 'RATE' },
  { symbol: 'US02Y', name: 'US 2Y Yield',          assetClass: 'RATE' },
];

export const SYMBOLS = UNIVERSE.map((u) => u.symbol);
export function findUniverse(symbol: string): UniverseAsset | undefined {
  return UNIVERSE.find((u) => u.symbol === symbol);
}

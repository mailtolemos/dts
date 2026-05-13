import { z } from 'zod';

export const AssetClassZ = z.enum(['CRYPTO','EQUITY','INDEX','COMMODITY','FX','RATE']);
export type AssetClass = z.infer<typeof AssetClassZ>;

export const BiasZ       = z.enum(['BULLISH','BEARISH','NEUTRAL','WATCH']);
export const HorizonZ    = z.enum(['INTRADAY','SWING','MULTIWEEK']);
export const ConfidenceZ = z.enum(['LOW','MEDIUM','HIGH']);
export const TrendZ      = z.enum(['UP','DOWN','SIDEWAYS']);
export const RegimeZ     = z.enum([
  'RISK_ON','RISK_OFF','CHOPPY','VOL_EXPANSION','VOL_COMPRESSION',
  'CRYPTO_LED','EQUITY_LED','MACRO_LED','NEWS_DRIVEN',
]);
export const ImpactZ     = z.enum(['LOW','MEDIUM','HIGH']);
export const FactZ       = z.enum(['CONFIRMED','REPORTED','RUMOR','OPINION']);
export const AlertTypeZ  = z.enum(['PRICE_CROSS','PCT_MOVE','VOL_EXPANSION','THESIS_CHANGE','TREND_CHANGE','NEWS_EVENT']);

export type Bias       = z.infer<typeof BiasZ>;
export type Horizon    = z.infer<typeof HorizonZ>;
export type Confidence = z.infer<typeof ConfidenceZ>;
export type Trend      = z.infer<typeof TrendZ>;
export type Regime     = z.infer<typeof RegimeZ>;
export type Impact     = z.infer<typeof ImpactZ>;
export type Factuality = z.infer<typeof FactZ>;
export type AlertType  = z.infer<typeof AlertTypeZ>;

export const PriceTickZ = z.object({
  symbol: z.string(),
  feedId: z.string(),
  price: z.number(),
  conf: z.number(),
  publishTime: z.number(),
  stale: z.boolean().default(false),
  source: z.enum(['PYTH','COINGECKO','POLYGON','MOCK']).default('PYTH'),
});
export type PriceTick = z.infer<typeof PriceTickZ>;

export const CandleZ = z.object({
  t: z.number(),  // unix seconds, candle open
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().optional(),
});
export type Candle = z.infer<typeof CandleZ>;

export const AiCardZ = z.object({
  bias: BiasZ,
  horizon: HorizonZ,
  confidence: ConfidenceZ,
  reasoning: z.string().min(20).max(800),
  keyLevels: z.object({
    support: z.array(z.number()).max(5),
    resistance: z.array(z.number()).max(5),
    invalidation: z.number(),
  }),
  riskNotes: z.string().max(500),
  whatChangesView: z.string().max(400),
  sourcesUsed: z.array(z.string()).min(1),
});
export type AiCard = z.infer<typeof AiCardZ>;

export const NewsClassZ = z.object({
  impact: ImpactZ,
  factuality: FactZ,
  affected: z.array(z.string()).max(20),
  secondOrder: z.string().max(400).nullable(),
});
export type NewsClass = z.infer<typeof NewsClassZ>;

export const ApiErrorZ = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.enum(['PROVIDER_DOWN','ASSET_NOT_FOUND','RATE_LIMITED','BAD_REQUEST','UNAUTHORIZED','INTERNAL']),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorZ>;

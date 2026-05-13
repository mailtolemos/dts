import type { Regime } from '../types';

export interface RegimeInputs {
  spxChange1d?: number | null;     // %
  btcChange1d?: number | null;     // %
  dxyChange1d?: number | null;
  goldChange1d?: number | null;
  vix?: number | null;
  vixChange1d?: number | null;
  us10y?: number | null;
  us10yChange1d?: number | null;   // in bps
  highImpactNews?: number;          // count last 24h
}

/**
 * Composite risk score in [-1, 1]:
 *   +1: SPX up, BTC up, DXY down, VIX low/falling, yields stable
 *   -1: SPX down, BTC down, DXY up, VIX high/rising
 */
export function riskScore(i: RegimeInputs): number {
  const clip = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  const z = (v: number | null | undefined, scale: number) =>
    v == null ? 0 : clip(v / scale, -1, 1);
  // Each input contributes equally; sign convention chosen so risk-on = positive.
  const c = [
    z(i.spxChange1d, 1.5),
    z(i.btcChange1d, 3.0),
    -z(i.dxyChange1d, 0.5),
    -z(i.vixChange1d, 8),
    i.vix != null ? clip((20 - i.vix) / 20, -1, 1) * 0.5 : 0,
  ];
  return clip(c.reduce((a, b) => a + b, 0) / c.length, -1, 1);
}

export function classifyRegime(i: RegimeInputs): Regime {
  const r = riskScore(i);
  if ((i.highImpactNews ?? 0) >= 2) return 'NEWS_DRIVEN';
  if (i.vix != null && i.vix >= 25) return 'VOL_EXPANSION';
  if (i.vix != null && i.vix <= 12) return 'VOL_COMPRESSION';
  if (r > 0.25) return 'RISK_ON';
  if (r < -0.25) return 'RISK_OFF';
  // Otherwise: who's leading?
  const absBtc = Math.abs(i.btcChange1d ?? 0);
  const absSpx = Math.abs(i.spxChange1d ?? 0);
  const absDxy = Math.abs(i.dxyChange1d ?? 0);
  if (absBtc > absSpx + 0.5 && absBtc > absDxy + 0.3) return 'CRYPTO_LED';
  if (absSpx > absBtc + 0.3) return 'EQUITY_LED';
  if (absDxy > 0.3 && absDxy >= absSpx) return 'MACRO_LED';
  return 'CHOPPY';
}

import pThrottle from 'p-throttle';
import { env, flags } from '../env';
import { logger } from '../logger';
import { macroCache } from '../cache';

const BASE = 'https://api.stlouisfed.org/fred';
const throttle = pThrottle({ limit: 30, interval: 60_000 });

// Series of interest: DXY (DTWEXBGS proxy), US10Y (DGS10), US02Y (DGS2), VIX (VIXCLS),
// CPI YoY (CPIAUCSL), Unemp (UNRATE), Fed Funds (DFF).
const SERIES = {
  DXY:   'DTWEXBGS',
  US10Y: 'DGS10',
  US02Y: 'DGS2',
  VIX:   'VIXCLS',
  CPI:   'CPIAUCSL',
  UNRATE:'UNRATE',
  DFF:   'DFF',
} as const;
export type FredSeries = keyof typeof SERIES;

const _fetch = throttle(async (id: string): Promise<{ date: string; value: number }[]> => {
  const params = new URLSearchParams({
    series_id: id, api_key: env().FRED_API_KEY, file_type: 'json',
    sort_order: 'desc', limit: '90',
  });
  const url = `${BASE}/series/observations?${params.toString()}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`fred ${r.status}`);
  const json = await r.json() as { observations: Array<{ date: string; value: string }> };
  return (json.observations ?? [])
    .map((o) => ({ date: o.date, value: Number(o.value) }))
    .filter((o) => !Number.isNaN(o.value));
});

const FALLBACK: Record<FredSeries, number> = {
  DXY: 104.5, US10Y: 4.30, US02Y: 4.10, VIX: 13.5, CPI: 311.2, UNRATE: 4.0, DFF: 4.83,
};

export async function getLatest(series: FredSeries): Promise<number | null> {
  const key = `fred:${series}`;
  const cached = macroCache.get(key) as number | undefined;
  if (cached !== undefined) return cached;

  if (!flags.hasFred) {
    macroCache.set(key, FALLBACK[series], 60_000);
    return FALLBACK[series];
  }
  try {
    const data = await _fetch(SERIES[series]);
    const v = data[0]?.value ?? FALLBACK[series];
    macroCache.set(key, v);
    return v;
  } catch (err) {
    logger.warn({ err: String(err), series }, 'fred fetch failed; using fallback');
    return FALLBACK[series];
  }
}

export async function getAllMacro(): Promise<Record<FredSeries, number | null>> {
  const out = {} as Record<FredSeries, number | null>;
  for (const k of Object.keys(SERIES) as FredSeries[]) out[k] = await getLatest(k);
  return out;
}

export async function health(): Promise<{ ok: boolean; lastError?: string }> {
  if (!flags.hasFred) return { ok: false, lastError: 'no key (fallback active)' };
  try { await _fetch(SERIES.US10Y); return { ok: true }; }
  catch (err) { return { ok: false, lastError: String(err) }; }
}

import pThrottle from 'p-throttle';
import { env, flags } from '../env';
import { logger } from '../logger';
import { macroCache } from '../cache';

// FRED (St. Louis Fed). Real data only — returns null when key missing or
// fetch fails. No hard-coded fallbacks.
const BASE = 'https://api.stlouisfed.org/fred';
const throttle = pThrottle({ limit: 30, interval: 60_000 });

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

export async function getLatest(series: FredSeries): Promise<number | null> {
  const key = `fred:${series}`;
  const cached = macroCache.get(key) as number | null | undefined;
  if (cached !== undefined) return cached;
  if (!flags.hasFred) return null;
  try {
    const data = await _fetch(SERIES[series]);
    const v = data[0]?.value ?? null;
    macroCache.set(key, v);
    return v;
  } catch (err) {
    logger.warn({ err: String(err), series }, 'fred fetch failed');
    macroCache.set(key, null, 60_000);
    return null;
  }
}

export async function getAllMacro(): Promise<Record<FredSeries, number | null>> {
  const keys = Object.keys(SERIES) as FredSeries[];
  // Run in parallel; FRED handles bursts fine.
  const values = await Promise.all(keys.map((k) => getLatest(k)));
  const out = {} as Record<FredSeries, number | null>;
  keys.forEach((k, i) => { out[k] = values[i]!; });
  return out;
}

export async function health(): Promise<{ ok: boolean; lastError?: string }> {
  if (!flags.hasFred) return { ok: false, lastError: 'no key' };
  try { await _fetch(SERIES.US10Y); return { ok: true }; }
  catch (err) { return { ok: false, lastError: String(err) }; }
}

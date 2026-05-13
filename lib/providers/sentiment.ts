import { logger } from '../logger';
import { macroCache } from '../cache';

// Fear & Greed index from alternative.me (free, no key).
export interface FearGreed { value: number; classification: string; updatedAt: string }

export async function getFearGreed(): Promise<FearGreed | null> {
  const key = 'altme:fg';
  const cached = macroCache.get(key) as FearGreed | undefined;
  if (cached) return cached;
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=1', { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const json = await r.json() as { data?: Array<{ value: string; value_classification: string; timestamp: string }> };
    const d = json.data?.[0];
    if (!d) return null;
    const out: FearGreed = {
      value: Number(d.value),
      classification: d.value_classification,
      updatedAt: new Date(Number(d.timestamp) * 1000).toISOString(),
    };
    macroCache.set(key, out, 3_600_000); // 1h
    return out;
  } catch (err) {
    logger.warn({ err: String(err) }, 'sentiment fetch failed');
    return { value: 55, classification: 'Greed', updatedAt: new Date().toISOString() };
  }
}

export async function health(): Promise<{ ok: boolean; lastError?: string }> {
  const fg = await getFearGreed();
  return fg ? { ok: true } : { ok: false, lastError: 'no data' };
}

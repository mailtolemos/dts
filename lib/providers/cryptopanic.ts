import pThrottle from 'p-throttle';
import { env, flags } from '../env';
import { logger } from '../logger';
import { newsCache } from '../cache';

export interface RawNews {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;  // ISO
  summary?: string;
  currencies?: string[]; // symbols mentioned
}

const BASE = 'https://cryptopanic.com/api/v1';
const throttle = pThrottle({ limit: 10, interval: 60_000 });

const _fetch = throttle(async (currencies?: string): Promise<RawNews[]> => {
  const params = new URLSearchParams({ auth_token: env().CRYPTOPANIC_API_KEY, public: 'true' });
  if (currencies) params.set('currencies', currencies);
  const url = `${BASE}/posts/?${params.toString()}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`cryptopanic ${r.status}`);
  const json = await r.json() as { results: Array<{
    id: number; title: string; url: string; published_at: string;
    source?: { title?: string }; currencies?: Array<{ code: string }>;
  }> };
  return (json.results ?? []).map((x) => ({
    id: String(x.id),
    title: x.title,
    url: x.url,
    source: x.source?.title ?? 'cryptopanic',
    publishedAt: x.published_at,
    currencies: (x.currencies ?? []).map((c) => c.code),
  }));
});

const FALLBACK_NEWS: RawNews[] = [
  { id: 'm1', title: 'BTC spot ETF inflows accelerate as institutional buyers return',
    url: 'https://example.com/n1', source: 'wire', publishedAt: new Date().toISOString(),
    currencies: ['BTC'] },
  { id: 'm2', title: 'Fed minutes lean hawkish; rate-cut bets pushed back to Q3',
    url: 'https://example.com/n2', source: 'wire', publishedAt: new Date().toISOString(),
    currencies: [] },
  { id: 'm3', title: 'ETH staking yields tick higher after fee market repricing',
    url: 'https://example.com/n3', source: 'wire', publishedAt: new Date().toISOString(),
    currencies: ['ETH'] },
  { id: 'm4', title: 'Gold breaks to new all-time high as DXY pulls back',
    url: 'https://example.com/n4', source: 'wire', publishedAt: new Date().toISOString(),
    currencies: ['XAU'] },
];

export async function getNews(opts: { currency?: string } = {}): Promise<RawNews[]> {
  const key = `cp:${opts.currency ?? 'all'}`;
  const cached = newsCache.get(key) as RawNews[] | undefined;
  if (cached) return cached;

  if (!flags.hasCryptopanic) {
    newsCache.set(key, FALLBACK_NEWS, 60_000);
    return FALLBACK_NEWS;
  }
  try {
    const data = await _fetch(opts.currency);
    newsCache.set(key, data);
    return data;
  } catch (err) {
    logger.warn({ err: String(err) }, 'cryptopanic failed; using fallback');
    return FALLBACK_NEWS;
  }
}

export async function health(): Promise<{ ok: boolean; lastError?: string }> {
  if (!flags.hasCryptopanic) return { ok: false, lastError: 'no key (mock active)' };
  try { await _fetch(); return { ok: true }; }
  catch (err) { return { ok: false, lastError: String(err) }; }
}

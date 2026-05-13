// News provider.
//
// Historically Cryptopanic — they went paid in 2026, so this file is now
// a multi-source RSS aggregator. Filename kept to avoid churning imports.
//
// Sources (all free, no key, no quota):
//   - CoinDesk      https://www.coindesk.com/arc/outboundfeeds/rss/
//   - CoinTelegraph https://cointelegraph.com/rss
//   - Decrypt       https://decrypt.co/feed
//
// Returns the same RawNews shape as before. `currencies` are extracted from
// title/body via keyword scan; the AI classifier downstream (lib/ai/news.ts)
// refines this with proper symbol detection.

import pThrottle from 'p-throttle';
import { logger } from '../logger';
import { newsCache } from '../cache';

export interface RawNews {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string;
  currencies?: string[];
}

interface FeedSource { name: string; url: string }

const FEEDS: FeedSource[] = [
  { name: 'CoinDesk',      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'Decrypt',       url: 'https://decrypt.co/feed' },
];

// Keyword → asset symbol mapping. Crude but useful as a hint before the LLM
// classifier runs. Order matters; longer keywords win.
const KEYWORD_MAP: Array<[RegExp, string]> = [
  [/\bbitcoin\b/i, 'BTC'],   [/\bbtc\b/i, 'BTC'],
  [/\bethereum\b/i, 'ETH'],  [/\beth\b/i, 'ETH'],
  [/\bsolana\b/i, 'SOL'],    [/\bsol\b/i, 'SOL'],
  [/\bripple\b/i, 'XRP'],    [/\bxrp\b/i, 'XRP'],
  [/\bbnb\b/i, 'BNB'],       [/\bbinance coin\b/i, 'BNB'],
  [/\bcardano\b/i, 'ADA'],   [/\bada\b/i, 'ADA'],
  [/\bavalanche\b/i, 'AVAX'],[/\bavax\b/i, 'AVAX'],
  [/\bdogecoin\b/i, 'DOGE'], [/\bdoge\b/i, 'DOGE'],
  [/\bchainlink\b/i, 'LINK'],[/\blink\b/i, 'LINK'],
  [/\bpolygon\b/i, 'MATIC'], [/\bmatic\b/i, 'MATIC'],
  [/\bpolkadot\b/i, 'DOT'],
  [/\btoncoin\b/i, 'TON'],
  [/\bsui\b/i, 'SUI'],
  [/\barbitrum\b/i, 'ARB'],  [/\barb\b/i, 'ARB'],
  [/\boptimism\b/i, 'OP'],
  [/\bcosmos\b/i, 'ATOM'],   [/\batom\b/i, 'ATOM'],
  [/\bgold\b/i, 'XAU'],      [/\bsilver\b/i, 'XAG'],
  [/\bsp\s?500\b/i, 'SPX'],  [/\bnasdaq\b/i, 'NDX'],
  [/\bdxy\b/i, 'DXY'],       [/\bdollar index\b/i, 'DXY'],
  [/\bvix\b/i, 'VIX'],
];

function extractCurrencies(text: string): string[] {
  const found = new Set<string>();
  for (const [re, sym] of KEYWORD_MAP) if (re.test(text)) found.add(sym);
  return Array.from(found);
}

// Tiny robust-enough RSS parser. Handles RSS 2.0 + Atom basics.
function parseRSS(xml: string, source: string): RawNews[] {
  // Strip XML comments to avoid matching tags inside them.
  const stripped = xml.replace(/<!--[\s\S]*?-->/g, '');

  // Try RSS <item> first, then Atom <entry>.
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;
  const matches = stripped.match(itemRe) ?? stripped.match(entryRe) ?? [];

  const out: RawNews[] = [];
  for (const block of matches) {
    const title = extractTag(block, 'title');
    if (!title) continue;
    const link = extractLink(block);
    if (!link) continue;
    const pubDate = extractTag(block, 'pubDate') ||
                    extractTag(block, 'published') ||
                    extractTag(block, 'updated') ||
                    new Date().toUTCString();
    const description = (extractTag(block, 'description') ||
                         extractTag(block, 'summary') ||
                         extractTag(block, 'content') || '')
      .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 500);
    const id = hashStr(link);
    out.push({
      id,
      title: decodeEntities(title),
      url: link,
      source,
      publishedAt: safeIso(pubDate),
      summary: decodeEntities(description) || undefined,
      currencies: extractCurrencies(title + ' ' + description),
    });
  }
  return out;
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  if (!m) return '';
  const raw = m[1] ?? '';
  // Strip CDATA wrapper if present.
  const cdata = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return (cdata ? cdata[1] : raw).trim();
}

function extractLink(block: string): string {
  // RSS: <link>url</link>
  const a = extractTag(block, 'link');
  if (a) return a;
  // Atom: <link href="url" rel="alternate"/>
  const m = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
  return m?.[1] ?? '';
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCharCode(parseInt(c, 16)));
}

function safeIso(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// Stable short id from url (no crypto import needed).
function hashStr(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const throttle = pThrottle({ limit: 6, interval: 1_000 });

const fetchFeed = throttle(async (f: FeedSource): Promise<RawNews[]> => {
  const r = await fetch(f.url, {
    headers: { 'User-Agent': 'DTS/0.1 (+https://dts-six-pink.vercel.app)' },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`${f.name} ${r.status}`);
  const xml = await r.text();
  return parseRSS(xml, f.name);
});

const FALLBACK_NEWS: RawNews[] = [
  { id: 'fb1', title: 'BTC spot ETF inflows accelerate as institutional buyers return',
    url: 'https://example.com/n1', source: 'wire', publishedAt: new Date().toISOString(),
    currencies: ['BTC'] },
  { id: 'fb2', title: 'Fed minutes lean hawkish; rate-cut bets pushed back to Q3',
    url: 'https://example.com/n2', source: 'wire', publishedAt: new Date().toISOString(),
    currencies: [] },
];

export async function getNews(opts: { currency?: string } = {}): Promise<RawNews[]> {
  const cacheKey = `rss:${opts.currency ?? 'all'}`;
  const cached = newsCache.get(cacheKey) as RawNews[] | undefined;
  if (cached) return cached;

  // Pull all sources in parallel; tolerate per-feed failures.
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const items: RawNews[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === 'fulfilled') {
      items.push(...r.value);
    } else {
      logger.warn({ feed: FEEDS[i]!.name, err: String(r.reason) }, 'rss feed failed');
    }
  }

  if (items.length === 0) {
    logger.warn('all RSS feeds failed; using fallback');
    newsCache.set(cacheKey, FALLBACK_NEWS, 60_000);
    return FALLBACK_NEWS;
  }

  // Dedupe by id (url hash), sort newest first.
  const seen = new Set<string>();
  const unique = items.filter((x) => { if (seen.has(x.id)) return false; seen.add(x.id); return true; });
  unique.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));

  // Optional asset filter via keyword presence.
  const filtered = opts.currency
    ? unique.filter((x) => (x.currencies ?? []).includes(opts.currency!.toUpperCase()))
    : unique;

  const top = filtered.slice(0, 40);
  newsCache.set(cacheKey, top); // 5min TTL by default
  return top;
}

export async function health(): Promise<{ ok: boolean; lastError?: string }> {
  try {
    const items = await getNews();
    return items.length > 0 && items[0]!.source !== 'wire'
      ? { ok: true }
      : { ok: false, lastError: 'fallback active' };
  } catch (err) {
    return { ok: false, lastError: String(err) };
  }
}

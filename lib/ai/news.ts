import { callGroq } from './groq';
import { NewsClassZ, type NewsClass } from '../types';
import { env } from '../env';
import { logger } from '../logger';

const SYSTEM = `You are a market news classifier. For each headline you receive, output a single JSON object:

{
  "impact":   "LOW" | "MEDIUM" | "HIGH",
  "factuality": "CONFIRMED" | "REPORTED" | "RUMOR" | "OPINION",
  "affected": string[],     // ticker symbols this affects (BTC, ETH, SPX, DXY, XAU, etc.)
  "secondOrder": string | null   // one sentence on second-order effects, or null
}

Guidance:
- HIGH = central bank decisions, major macro prints (CPI, NFP), large ETF flows, geopolitical shocks.
- MEDIUM = sector-wide news, mid-cap M&A, important on-chain events.
- LOW = price noise, opinion pieces, social posts.
- CONFIRMED requires an authoritative source.
- "affected" must be tickers, not full names.
- Output JSON only.`;

export async function classifyNews(title: string, summary?: string): Promise<NewsClass> {
  const userMsg = JSON.stringify({ title, summary: summary?.slice(0, 400) ?? null });
  let raw: string;
  try {
    raw = await callGroq({
      system: SYSTEM,
      user: userMsg,
      jsonMode: true,
      temperature: 0,
      model: env().GROQ_FAST_MODEL,
      maxTokens: 200,
    });
  } catch (err) {
    logger.warn({ err: String(err) }, 'news classifier failed');
    raw = '{}';
  }

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  const o = parsed as Record<string, unknown>;
  o.impact ??= 'LOW';
  o.factuality ??= 'REPORTED';
  o.affected ??= [];
  o.secondOrder ??= null;
  try { return NewsClassZ.parse(o); }
  catch { return { impact: 'LOW', factuality: 'REPORTED', affected: [], secondOrder: null }; }
}

export async function marketSummary(input: {
  regime: string; riskScore: number;
  topMovers: Array<{ symbol: string; change24h: number }>;
  topNews: string[];
  macro: { dxy?: number | null; us10y?: number | null; vix?: number | null };
}): Promise<string> {
  const SYS = `You are DTS, a markets analyst. Write a concise 3-5 sentence narrative of the current market state. Be evidence-based, mention regime, what's leading, what's trailing, and one risk to watch. No predictions, no banned phrases (moon, easy, guaranteed). Plain text only, no markdown.`;
  const user = JSON.stringify(input);
  try {
    return (await callGroq({ system: SYS, user, temperature: 0.3, maxTokens: 250 })).trim();
  } catch (err) {
    logger.warn({ err: String(err) }, 'market summary failed');
    return `Market regime: ${input.regime}. Risk score ${(input.riskScore * 100).toFixed(0)}. Top movers and macro indicate a mixed tape; watch DXY and yields for the next direction cue.`;
  }
}

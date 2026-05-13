import crypto from 'node:crypto';
import { callGroq } from './groq';
import { AiCardZ, type AiCard } from '../types';
import type { FeatureBag } from '../analysis/features';
import { env } from '../env';
import { logger } from '../logger';

const SYSTEM_PROMPT = `You are DTS, an institutional-grade market analyst. You receive a structured JSON feature bag for one asset, plus recent macro and news context. You return a single JSON object (no prose, no code fences) that matches this exact shape:

{
  "bias": "BULLISH" | "BEARISH" | "NEUTRAL" | "WATCH",
  "horizon": "INTRADAY" | "SWING" | "MULTIWEEK",
  "confidence": "LOW" | "MEDIUM" | "HIGH",
  "reasoning": string,        // <= 60 words, cite which input drove each clause
  "keyLevels": {
    "support":    number[],   // pick from features.levels.support
    "resistance": number[],   // pick from features.levels.resistance
    "invalidation": number    // single price level
  },
  "riskNotes": string,        // <= 30 words
  "whatChangesView": string,  // <= 25 words
  "sourcesUsed": string[]     // e.g. ["pyth","indicators","news","macro"]
}

Hard rules:
1. NEVER invent price levels. Only use levels present in features.levels.
2. Confidence is LOW unless 3+ independent inputs agree (trend + momentum + structure + macro/news).
3. Bias is NEUTRAL when inputs conflict, WATCH when a setup is forming but not triggered.
4. If features.price.stale is true, bias MUST be WATCH and reasoning must say why.
5. Banned phrases: "moon", "easy", "guaranteed", "to the moon", "going to print", "all-in", any leverage suggestion.
6. State invalidation as a single price below current price for bullish bias, above for bearish.
7. Output JSON only.`;

export interface AnalystResult {
  card: AiCard;
  inputsHash: string;
  model: string;
}

function hashFeatures(f: FeatureBag): string {
  const stable = JSON.stringify({
    trend: f.trend,
    signals: f.signals.map((s) => s.kind).sort(),
    regime: f.regime,
    macro: f.macro,
    news: f.news.slice(0, 5).map((n) => n.title),
    levels: f.levels,
  });
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 16);
}

const BANNED = ['moon', 'easy', 'guaranteed', 'to the moon', 'going to print', 'all-in', 'leverage'];

function hasBanned(card: AiCard): boolean {
  const blob = (card.reasoning + ' ' + card.riskNotes + ' ' + card.whatChangesView).toLowerCase();
  return BANNED.some((w) => blob.includes(w));
}

function sanitizeLevels(card: AiCard, f: FeatureBag): AiCard {
  const allowed = new Set([...f.levels.support, ...f.levels.resistance, f.price.last]);
  const within2pct = (v: number) => Array.from(allowed).some((a) => Math.abs(v - a) / Math.max(a, 1) <= 0.02);
  const filter = (xs: number[]) => xs.filter(within2pct).slice(0, 5);
  const inval = within2pct(card.keyLevels.invalidation)
    ? card.keyLevels.invalidation
    : (f.levels.support[0] ?? f.price.last * 0.97);
  return {
    ...card,
    keyLevels: {
      support: filter(card.keyLevels.support).length ? filter(card.keyLevels.support) : f.levels.support.slice(0, 3),
      resistance: filter(card.keyLevels.resistance).length ? filter(card.keyLevels.resistance) : f.levels.resistance.slice(0, 3),
      invalidation: inval,
    },
  };
}

function downgradeIfAgreementWeak(card: AiCard, f: FeatureBag): AiCard {
  // Count agreement: trend, momentum (rsi>55 bull / <45 bear), structure, macro (risk-on/off matching), news+signals
  let agree = 0;
  const bull = card.bias === 'BULLISH';
  if (bull ? f.trend.direction === 'UP' : f.trend.direction === 'DOWN') agree++;
  if (f.momentum.rsi14 != null) {
    if (bull && f.momentum.rsi14 > 55) agree++;
    if (!bull && f.momentum.rsi14 < 45) agree++;
  }
  if (bull && f.trend.structure === 'HIGHER_HIGHS_HIGHER_LOWS') agree++;
  if (!bull && f.trend.structure === 'LOWER_HIGHS_LOWER_LOWS') agree++;
  if (bull && f.regime.global === 'RISK_ON') agree++;
  if (!bull && f.regime.global === 'RISK_OFF') agree++;
  if (f.signals.length > 0) agree++;
  if (card.confidence === 'HIGH' && agree < 4) return { ...card, confidence: 'MEDIUM' };
  if (card.confidence === 'MEDIUM' && agree < 3) return { ...card, confidence: 'LOW' };
  return card;
}

export async function runAnalyst(features: FeatureBag): Promise<AnalystResult> {
  const userMsg = JSON.stringify(features);
  let raw: string;
  try {
    raw = await callGroq({
      system: SYSTEM_PROMPT,
      user: userMsg,
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 700,
    });
  } catch (err) {
    logger.warn({ err: String(err), symbol: features.asset.symbol }, 'analyst groq call failed');
    raw = '{}';
  }

  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { parsed = {}; }

  // Fill any missing required fields with sensible defaults so zod doesn't reject.
  const filled = fillDefaults(parsed as Record<string, unknown>, features);
  let card = AiCardZ.parse(filled);

  // Stale price gate.
  if (features.price.stale) {
    card = { ...card, bias: 'WATCH', confidence: 'LOW' };
  }

  card = sanitizeLevels(card, features);
  card = downgradeIfAgreementWeak(card, features);

  if (hasBanned(card)) {
    logger.warn({ symbol: features.asset.symbol }, 'analyst output contained banned phrase; downgrading');
    card = { ...card, confidence: 'LOW', bias: 'WATCH', reasoning: 'Output failed phrasing sanity check; downgraded to WATCH.' };
  }

  return { card, inputsHash: hashFeatures(features), model: `groq:${env().GROQ_MODEL}` };
}

function fillDefaults(raw: Record<string, unknown>, f: FeatureBag): Record<string, unknown> {
  const r: Record<string, unknown> = { ...raw };
  r.bias       ??= 'NEUTRAL';
  r.horizon    ??= 'SWING';
  r.confidence ??= 'LOW';
  r.reasoning  ??= 'Insufficient data for a clear thesis right now.';
  r.riskNotes  ??= 'Market may chop; size accordingly.';
  r.whatChangesView ??= 'Look for clean break of nearest level on volume.';
  r.sourcesUsed ??= ['indicators'];
  const kl = (r.keyLevels as Record<string, unknown> | undefined) ?? {};
  r.keyLevels = {
    support:    Array.isArray(kl.support) ? kl.support : f.levels.support.slice(0, 3),
    resistance: Array.isArray(kl.resistance) ? kl.resistance : f.levels.resistance.slice(0, 3),
    invalidation: typeof kl.invalidation === 'number' ? kl.invalidation
                  : (f.levels.support[0] ?? f.price.last * 0.97),
  };
  return r;
}

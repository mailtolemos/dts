import OpenAI from 'openai';
import { env, flags } from '../env';
import { logger } from '../logger';

// Groq exposes an OpenAI-compatible REST API.
// Free tier is generous: see https://console.groq.com/docs/rate-limits
let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  _client = new OpenAI({
    apiKey: env().GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  return _client;
}

interface CallOpts {
  model?: string;
  system: string;
  user: string;
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
}

const minuteCallCap = 60;
let windowStart = Date.now();
let callsInWindow = 0;

function rateGuard(): void {
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; callsInWindow = 0; }
  if (callsInWindow >= minuteCallCap) {
    throw new Error('RATE_LIMITED:local-cap');
  }
  callsInWindow++;
}

export async function callGroq(opts: CallOpts): Promise<string> {
  if (!flags.hasGroq) {
    // Stub mode: return a JSON skeleton if jsonMode is asked, otherwise a placeholder.
    return opts.jsonMode
      ? stubJson(opts.system + '\n' + opts.user)
      : stubText();
  }
  rateGuard();
  const model = opts.model ?? env().GROQ_MODEL;
  const r = await client().chat.completions.create({
    model,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 800,
    response_format: opts.jsonMode ? { type: 'json_object' } : undefined,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  });
  const text = r.choices[0]?.message.content ?? '';
  if (!text) throw new Error('groq:empty-response');
  return text;
}

function stubText(): string {
  return 'AI offline (no GROQ_API_KEY set). This is a placeholder summary. ' +
         'Configure GROQ_API_KEY in .env.local to enable narrative output.';
}

function stubJson(hint: string): string {
  // Produce a minimally valid card-like JSON. The caller's zod schema will trim it.
  // We don't know exact levels here — caller will substitute from features.
  return JSON.stringify({
    bias: 'NEUTRAL',
    horizon: 'SWING',
    confidence: 'LOW',
    reasoning: 'AI offline (no GROQ_API_KEY). Showing a neutral placeholder so the UI works.',
    keyLevels: { support: [], resistance: [], invalidation: 0 },
    riskNotes: 'Configure GROQ_API_KEY to get real analysis.',
    whatChangesView: 'Enable AI by setting GROQ_API_KEY in .env.local.',
    sourcesUsed: ['stub'],
    _stubFrom: hint.slice(0, 64),
  });
}

export async function health(): Promise<{ ok: boolean; lastError?: string }> {
  if (!flags.hasGroq) return { ok: false, lastError: 'no key (stub active)' };
  try {
    await callGroq({ system: 'echo', user: 'ping', maxTokens: 4 });
    return { ok: true };
  } catch (err) {
    return { ok: false, lastError: String(err) };
  }
}

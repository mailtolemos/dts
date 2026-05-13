# DTS — AI Analyst Pipeline

## Principle

**The LLM narrates; deterministic code computes.** Levels, indicators, regime, and signals are calculated in `lib/analysis/*`. The LLM receives a structured feature bag plus relevant news and produces a card. It never invents a price level — if it tries, the JSON schema validator drops the field.

## Pipeline

```
            ┌─────────────────────────────────────────────────┐
            │  Worker tick (every 15 min for top 30 assets)   │
            └───────┬─────────────────────────────────────────┘
                    │
       ┌────────────▼─────────────┐
       │ 1. Pull OHLC + last tick │
       └────────────┬─────────────┘
       ┌────────────▼──────────────────┐
       │ 2. Compute indicators + trend │
       │    + levels + regime context  │
       └────────────┬──────────────────┘
       ┌────────────▼──────────────────┐
       │ 3. Pull recent news (24h) for │
       │    asset + class peers        │
       └────────────┬──────────────────┘
       ┌────────────▼──────────────────┐
       │ 4. Hash feature bag.          │
       │    If unchanged since last    │
       │    card AND > 5m old, skip.   │
       └────────────┬──────────────────┘
       ┌────────────▼──────────────────┐
       │ 5. Render prompt → Groq.      │
       │    System prompt is fixed.    │
       │    User msg = feature JSON.   │
       └────────────┬──────────────────┘
       ┌────────────▼──────────────────┐
       │ 6. Parse JSON, validate with  │
       │    zod, sanitize phrasing.    │
       └────────────┬──────────────────┘
       ┌────────────▼──────────────────┐
       │ 7. Persist AiAnalysis,        │
       │    emit SSE 'card' event.     │
       └───────────────────────────────┘
```

## Feature bag (input to LLM)

```jsonc
{
  "asset":  { "symbol":"BTC", "class":"CRYPTO", "name":"Bitcoin" },
  "price":  { "last":67341.2, "conf":12.4, "stale":false, "updatedAt":"..." },
  "change": { "h1":0.4, "h24":2.1, "d7":-1.8, "d30":5.6 },
  "trend":  { "direction":"UP", "structure":"HIGHER_HIGHS_HIGHER_LOWS",
              "sma50":64200, "sma200":58400, "ema20":66120 },
  "momentum": { "rsi14":58.2, "macd":{"line":312,"signal":270,"hist":42,"crossedUpAt":"..."} },
  "volatility": { "atr14":1820, "atrPct":2.7, "bbWidth":0.06, "regime":"EXPANDING" },
  "levels": { "support":[64800,62100,58400], "resistance":[69300,71800,73900],
              "nearestStopBelow":62100 },
  "relative": { "vsBtc":null, "vsSpx":1.4, "vsDxy":-0.6 },
  "macro":   { "dxy":104.2, "us10y":4.31, "vix":13.2 },
  "regime":  { "global":"RISK_ON", "riskScore":0.32 },
  "news":    [
    { "title":"Spot BTC ETF inflows hit $580m...", "impact":"MEDIUM",
      "factuality":"CONFIRMED", "publishedAt":"..." },
    { "title":"Fed minutes hawkish-leaning", "impact":"MEDIUM",
      "factuality":"CONFIRMED", "publishedAt":"..." }
  ],
  "signals": [
    { "kind":"MA50_CROSS_UP", "at":"..." },
    { "kind":"BB_SQUEEZE_BREAKOUT", "at":"..." }
  ]
}
```

## System prompt (verbatim — `lib/ai/analyst.ts`)

> You are DTS, an institutional-grade market analyst. You are given a structured feature bag for a single asset and recent context. Produce a single JSON object that matches the schema. Be concise, evidence-based, and risk-aware.
>
> Hard rules:
> 1. Never invent prices. Use only the levels in `levels.*`.
> 2. State invalidation explicitly.
> 3. Confidence: LOW unless multiple independent inputs agree (trend + momentum + structure + macro or news).
> 4. Bias is NEUTRAL when inputs conflict; WATCH when a setup is forming but not triggered.
> 5. Banned phrases: "moon", "easy", "guaranteed", "to the moon", "going to print", any specific price target without a range, any leverage suggestion.
> 6. Reasoning must cite which input drove each clause (e.g. "RSI 58 + MACD positive cross").
> 7. Keep `reasoning` ≤ 60 words. Keep `riskNotes` ≤ 30 words. Keep `whatChangesView` ≤ 25 words.
> 8. If `price.stale` is true, set bias to WATCH and explain why in `reasoning`.
> 9. Output JSON only. No prose outside JSON. No code fences.

## Output schema (zod-validated)

```ts
const Card = z.object({
  bias: z.enum(['BULLISH','BEARISH','NEUTRAL','WATCH']),
  horizon: z.enum(['INTRADAY','SWING','MULTIWEEK']),
  confidence: z.enum(['LOW','MEDIUM','HIGH']),
  reasoning: z.string().min(20).max(600),
  keyLevels: z.object({
    support: z.array(z.number()).max(5),
    resistance: z.array(z.number()).max(5),
    invalidation: z.number()
  }),
  riskNotes: z.string().max(400),
  whatChangesView: z.string().max(300),
  sourcesUsed: z.array(z.string()).min(1)
});
```

## Phrasing sanitizer

Before persisting:
1. Lowercase-scan for banned tokens — if found, regenerate once with stricter prompt; if still bad, drop card and log.
2. Levels in `keyLevels.*` must each be in `features.levels.support ∪ features.levels.resistance ∪ {features.price.last}` within ±2%. Otherwise replace with the nearest allowed level.
3. Confidence is downgraded one step if input agreement < 3 inputs.

## Cache & regen logic

`inputsHash = sha256(stable_stringify(featureBag.signals + featureBag.trend + featureBag.regime + featureBag.macro + topNewsIds))`.
If a card exists with the same hash within 15 minutes, reuse it. Otherwise regen.

## Dashboard summary

Same pipeline, but the feature bag is the **global** snapshot (regime, risk score, top movers, top news). Output is plain text 3–5 sentences, not a card. Same banned-phrase sanitizer.

## News classifier (separate, cheaper)

For each news item:
- Prompt the LLM with title + first 400 chars of summary, asset universe.
- Return JSON `{ impact, factuality, affected: [symbol], secondOrder: string|null }`.
- Run in batches of 10, capped at 60/min.

## Guardrails on cost & rate

- Worker keeps a token bucket: max 60 LLM calls / minute total.
- Per-asset cooldown: 5 minutes between cards.
- If Groq returns 429, exponential backoff and skip cycle.
- All LLM calls log model, latency, tokens, cost (estimated).

## Eval hooks (for later)

`scripts/eval/cards.ts` runs a fixed set of feature bags through the pipeline and checks:
- JSON parses, schema validates.
- No banned phrases.
- Levels match input.
- Confidence consistent with agreement count.

Run in CI; fails block merges.

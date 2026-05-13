# DTS — Degening the Situation
## Product Specification v0.1

> Market intelligence and decision support. Not a guaranteed trading system. Every output presents risk, uncertainty, and invalidation.

---

## 1. Mission

DTS helps traders and serious enthusiasts answer six questions, fast:

1. **What is moving?** — Top movers across crypto, equities, indexes, commodities, FX.
2. **Why is it moving?** — News, macro, flow, correlation, regime context.
3. **Is it likely to continue or reverse?** — Trend + momentum + structure read.
4. **What are the key levels?** — Support / resistance / breakout triggers.
5. **What risks invalidate the thesis?** — Stops, structural breaks, catalysts on the calendar.
6. **What should I watch next?** — Triggers and confirmations to monitor.

## 2. Target user

- **Primary:** active traders (crypto-first, multi-asset aware) who already use TradingView / brokerage tools but want a layer of synthesis on top.
- **Secondary:** analysts and investors who want a single dashboard for cross-asset context.
- **Anti-persona:** users looking for autonomous trade execution or pump signals. DTS will not provide either.

## 3. Product principles

1. **Honesty over hype.** State uncertainty. Never present speculation as fact.
2. **Evidence-first.** Every indication card shows the inputs it used.
3. **Cross-asset by default.** Crypto reads BTC dominance, ETH/BTC, DXY, SPX, VIX, rates.
4. **Levels, not predictions.** "Bullish above X, invalidated below Y" — never "going to $200k by July."
5. **Skim-first UI.** Trader needs the take in 3 seconds; the reasoning is one click away.
6. **No reckless suggestions.** No oversized leverage, no "all-in" framing, no promised returns.

## 4. Feature surface (v1)

### 4.1 Dashboard
Global market state at a glance.
- Crypto / Equity index / Commodities / FX overview tiles.
- Top movers (24h) per asset class.
- Volatility snapshot (BTC IV, VIX, MOVE proxy, DXY range).
- Risk-on / risk-off score (composite of SPX, BTC, DXY, gold, yields).
- AI market summary (3–5 bullet narrative, regenerated every N minutes).
- Current market regime classification.

### 4.2 Price Feeds
Pyth-backed feed catalog.
- Search, filter by asset class, sort by % change / volatility.
- Favorite ⭐ a feed → appears in default watchlist.
- Multi-watchlist support.
- Each row: symbol, last price, confidence interval, last update, 24h % change.

### 4.3 Asset Detail
The asset workbench.
- Live price (Pyth) + chart (CoinGecko/Polygon OHLC).
- Indicators: SMA/EMA, RSI, MACD, Bollinger Bands, ATR.
- Support/resistance (rolling pivots + recent swing highs/lows).
- Trend direction, volume notes where available.
- Relevant news (filtered to this asset / its sector).
- AI thesis: bull case, bear case, invalidation levels, confidence, monitoring triggers.

### 4.4 AI Analyst
Stream of indication cards. Each card:
- Asset, directional bias (bullish / bearish / neutral / watch-only).
- Time horizon (intraday / swing / multi-week).
- Confidence (low / medium / high).
- Reasoning (3–6 sentences).
- Key levels.
- Invalidation.
- Risk notes.
- "What would change the view."
- Timestamp + data sources used.

### 4.5 News Intelligence
- Pull from Cryptopanic + RSS + optional NewsAPI.
- LLM classifier scores each item for likely market impact (low / medium / high).
- Separates confirmed facts from rumor.
- Maps each item to affected assets.
- Surfaces second-order effects ("CPI hot → DXY up → BTC/risk pressure").

### 4.6 Alerts
- Price level cross (above/below).
- % move over window (e.g., > 3% in 1h).
- Volatility expansion (ATR / realized vol breaking N-day range).
- AI thesis change (card flipped from bullish → bearish on watched asset).
- Trend regime change.
- News event on a watched asset.

Channels: in-app toast + persistent feed; email/webhook stubbed.

### 4.7 Admin / Settings
- Provider status (Pyth, CoinGecko, Cryptopanic, FRED, Groq).
- AI model + refresh interval controls.
- Per-user preferences (default asset class, theme, alert defaults).
- All API keys via env vars only; never exposed to client.

## 5. Output style (AI analyst)

**Good:**
> BTC is bullish on a swing basis while above $58,200. Momentum is improving (daily RSI 58, MACD bull cross last Tue), ETH/BTC turning up confirms risk appetite. Volatility expanding from compressed 14-day range. Invalidation: daily close below $56,800. Confidence: medium.

**Bad:**
> BTC could go up or down. The market is volatile right now.

**Banned phrasing:** "moon," "going to print," "easy money," "guaranteed," specific price predictions without ranges, leverage suggestions.

## 6. Analytical axes

Every asset evaluation considers: **trend, momentum, volatility, liquidity, relative strength, correlation, macro sensitivity, news catalyst, market structure, risk/reward, invalidation.**

## 7. Market regime taxonomy

DTS classifies the market environment into one of: **risk-on, risk-off, choppy, vol-expansion, vol-compression, crypto-led, equity-led, macro-led, news-driven.** Regime affects how indication cards are framed (e.g., breakouts in chop are downgraded; in vol-expansion, momentum is upgraded).

## 8. Non-goals (v1)

- No order routing or brokerage integration.
- No portfolio P&L tracking.
- No social/copy-trading features.
- No on-device ML training.
- No mobile native app (web responsive only).

## 9. Success metrics

- p50 dashboard load < 1.2s with warm cache.
- Indication cards refreshed at ≤ 15 min cadence for top 30 assets.
- < 1% of cards contain banned phrasing (LLM eval check).
- User can go from landing → asset detail → AI thesis in ≤ 3 clicks.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM hallucinates levels | Levels are computed from OHLC, not LLM-generated. LLM only narrates. |
| Pyth feed staleness | Confidence interval + staleness threshold gates display. |
| API rate limits | Caching layer + provider-side caps in code. |
| Bad news source | Curated source allowlist + LLM impact scoring with abstention. |
| Cost runaway (LLM) | Groq free tier + per-minute caps + cached features fed to LLM. |

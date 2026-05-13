# DTS — Alerting System

## Alert types

| Type | Params (jsonb) | Eval source |
|---|---|---|
| `PRICE_CROSS` | `{ level: number; direction: 'ABOVE'\|'BELOW' }` | live price tick |
| `PCT_MOVE`    | `{ pct: number; windowMin: number }` | rolling tick buffer |
| `VOL_EXPANSION` | `{ atrMultiple: number; lookback: number }` | AssetSnapshot ATR |
| `THESIS_CHANGE` | `{ from?: Bias; to?: Bias }` | AiAnalysis diff |
| `TREND_CHANGE` | `{ from?: Trend; to?: Trend }` | AssetSnapshot trend diff |
| `NEWS_EVENT`   | `{ minImpact: 'MEDIUM'\|'HIGH' }` | NewsItem.impact |

## Evaluation loop

Two evaluators:

**Tick-driven (low latency)** — runs inside the SSE bridge. Every Pyth tick is run through any `PRICE_CROSS` and `PCT_MOVE` alerts on that asset.

**Snapshot-driven (every 1 min)** — runs in the worker. For each newly written `AssetSnapshot` and `AiAnalysis`, diff against previous row and evaluate `VOL_EXPANSION`, `THESIS_CHANGE`, `TREND_CHANGE`. News evaluator runs per new `NewsItem`.

## Dedupe / cooldown

Each alert has an internal cooldown: 5 min for `PRICE_CROSS`, 15 min for `PCT_MOVE`, 60 min for `THESIS_CHANGE`, configurable. `Alert.lastTriggeredAt` enforces this in a transaction.

## Delivery channels

v1:
- **In-app feed** — every fire writes an `AlertEvent`; UI subscribes via SSE topic `alerts:user:<userId>`.
- **Browser notification** — when SSE event arrives and the tab has permission.

v1.1 (stubbed):
- **Email** — via Resend (`RESEND_API_KEY`).
- **Webhook** — POST to user-provided URL with HMAC signature.

## Lifecycle

```
created → enabled
       ↘
        triggered (writes AlertEvent, may go silent until cooldown)
                 ↘
                  disabled (user toggle) → archived
```

## Storage

`Alert` for definitions (small, hot). `AlertEvent` for fires (append-only, retained 90 days).

## Failure modes

- Provider drops a tick → tick-driven alerts can miss. Snapshot-driven covers most cases at 1-min resolution.
- LLM card schema invalid → no `THESIS_CHANGE` fires for that cycle; logged.
- Worker dies → alerts stop firing. Healthcheck endpoint exposes `worker.lastRunAt`; alerts are not a safety-critical system, but the UI shows a warning banner if last run > 5 min ago.

import { prisma } from '../db';
import type { PriceTick } from '../types';
import { logger } from '../logger';

interface PriceCrossParams { level: number; direction: 'ABOVE' | 'BELOW' }
interface PctMoveParams    { pct: number; windowMin: number }
interface VolExpansionParams { atrMultiple: number; lookback: number }
interface NewsEventParams  { minImpact: 'MEDIUM' | 'HIGH' }

const COOLDOWN_MS: Record<string, number> = {
  PRICE_CROSS: 5 * 60_000,
  PCT_MOVE: 15 * 60_000,
  VOL_EXPANSION: 30 * 60_000,
  THESIS_CHANGE: 60 * 60_000,
  TREND_CHANGE: 60 * 60_000,
  NEWS_EVENT: 10 * 60_000,
};

function withinCooldown(lastTriggeredAt: Date | null | undefined, type: string): boolean {
  if (!lastTriggeredAt) return false;
  return Date.now() - lastTriggeredAt.getTime() < (COOLDOWN_MS[type] ?? 0);
}

export async function evaluateTickAlerts(tick: PriceTick): Promise<void> {
  const asset = await prisma.asset.findUnique({ where: { symbol: tick.symbol } });
  if (!asset) return;
  const alerts = await prisma.alert.findMany({
    where: { assetId: asset.id, enabled: true, type: { in: ['PRICE_CROSS', 'PCT_MOVE'] } },
  });
  for (const a of alerts) {
    if (withinCooldown(a.lastTriggeredAt, a.type)) continue;
    let fired = false; let payload: Record<string, unknown> = {};

    if (a.type === 'PRICE_CROSS') {
      const p = a.params as unknown as PriceCrossParams;
      if (p && typeof p.level === 'number') {
        if (p.direction === 'ABOVE' && tick.price > p.level) { fired = true; payload = { level: p.level, price: tick.price }; }
        if (p.direction === 'BELOW' && tick.price < p.level) { fired = true; payload = { level: p.level, price: tick.price }; }
      }
    } else if (a.type === 'PCT_MOVE') {
      const p = a.params as unknown as PctMoveParams;
      const windowStart = new Date(Date.now() - p.windowMin * 60_000);
      const earliest = await prisma.assetSnapshot.findFirst({
        where: { assetId: asset.id, at: { gte: windowStart } },
        orderBy: { at: 'asc' },
      });
      if (earliest) {
        const pct = ((tick.price - earliest.last) / earliest.last) * 100;
        if (Math.abs(pct) >= p.pct) { fired = true; payload = { pct, windowMin: p.windowMin }; }
      }
    }

    if (fired) await fireAlert(a.id, payload);
  }
}

export async function evaluateSnapshotAlerts(args: {
  assetId: string; trend?: string; prevTrend?: string;
  atr?: number | null; prevAtr?: number | null;
  bias?: string; prevBias?: string;
}): Promise<void> {
  const alerts = await prisma.alert.findMany({
    where: { assetId: args.assetId, enabled: true,
             type: { in: ['VOL_EXPANSION', 'THESIS_CHANGE', 'TREND_CHANGE'] } },
  });

  for (const a of alerts) {
    if (withinCooldown(a.lastTriggeredAt, a.type)) continue;
    let fired = false; let payload: Record<string, unknown> = {};

    if (a.type === 'TREND_CHANGE' && args.trend && args.prevTrend && args.trend !== args.prevTrend) {
      fired = true; payload = { from: args.prevTrend, to: args.trend };
    }
    if (a.type === 'THESIS_CHANGE' && args.bias && args.prevBias && args.bias !== args.prevBias) {
      fired = true; payload = { from: args.prevBias, to: args.bias };
    }
    if (a.type === 'VOL_EXPANSION') {
      const p = a.params as unknown as VolExpansionParams;
      if (args.atr && args.prevAtr && args.prevAtr > 0) {
        const mult = args.atr / args.prevAtr;
        if (mult >= p.atrMultiple) { fired = true; payload = { atr: args.atr, prevAtr: args.prevAtr, mult }; }
      }
    }
    if (fired) await fireAlert(a.id, payload);
  }
}

export async function evaluateNewsAlerts(args: {
  assetId: string; impact: 'LOW'|'MEDIUM'|'HIGH'; newsId: string;
}): Promise<void> {
  const alerts = await prisma.alert.findMany({
    where: { assetId: args.assetId, enabled: true, type: 'NEWS_EVENT' },
  });
  for (const a of alerts) {
    if (withinCooldown(a.lastTriggeredAt, a.type)) continue;
    const p = a.params as unknown as NewsEventParams;
    const ranks = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
    if (ranks[args.impact] >= ranks[p.minImpact]) {
      await fireAlert(a.id, { newsId: args.newsId, impact: args.impact });
    }
  }
}

async function fireAlert(alertId: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await prisma.$transaction([
      prisma.alertEvent.create({ data: { alertId, payload: payload as never } }),
      prisma.alert.update({ where: { id: alertId }, data: { lastTriggeredAt: new Date() } }),
    ]);
    // Hook for SSE broadcast — see lib/alerts/bus.ts.
    const { alertBus } = await import('./bus');
    alertBus.emit({ alertId, payload, firedAt: new Date().toISOString() });
  } catch (err) {
    logger.error({ err: String(err), alertId }, 'fireAlert failed');
  }
}

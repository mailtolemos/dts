// Simple in-process pub/sub for SSE broadcast.
// In a multi-worker deploy, swap to Redis pub/sub.

type Listener<T> = (msg: T) => void;

class Bus<T> {
  private listeners = new Set<Listener<T>>();
  on(l: Listener<T>): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  emit(msg: T): void {
    for (const l of this.listeners) {
      try { l(msg); } catch {/* ignore */}
    }
  }
}

export interface AlertEventMsg { alertId: string; payload: unknown; firedAt: string }
export interface CardEventMsg  { symbol: string; card: unknown; at: string }
export interface PriceEventMsg { symbol: string; last: number; conf: number; at: string }

export const alertBus = new Bus<AlertEventMsg>();
export const cardBus  = new Bus<CardEventMsg>();
export const priceBus = new Bus<PriceEventMsg>();

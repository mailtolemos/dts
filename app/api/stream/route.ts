import { NextRequest } from 'next/server';
import { alertBus, cardBus, priceBus } from '@/lib/alerts/bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Multiplexed SSE stream. Clients pass topics=price:BTC,price:ETH,cards:BTC,alerts:user:<id>
// We rebroadcast events that match the subscription set.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const topics = (url.searchParams.get('topics') ?? '').split(',').filter(Boolean);
  const wantPrice = (sym: string) => topics.includes(`price:${sym}`);
  const wantCard  = (sym: string) => topics.includes(`cards:${sym}`);
  const wantAlerts = topics.some((t) => t.startsWith('alerts:'));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      send('hello', { ts: Date.now(), topics });

      const offPrice = priceBus.on((m) => { if (wantPrice(m.symbol)) send('price', m); });
      const offCard  = cardBus .on((m) => { if (wantCard(m.symbol))  send('card',  m); });
      const offAlert = alertBus.on((m) => { if (wantAlerts)          send('alert', m); });

      const heartbeat = setInterval(() => {
        try { send('hb', { ts: Date.now() }); } catch {/* closed */}
      }, 15_000);

      const close = () => {
        clearInterval(heartbeat);
        offPrice(); offCard(); offAlert();
        try { controller.close(); } catch {/* ignore */}
      };

      // Cancel on disconnect.
      req.signal.addEventListener('abort', close);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

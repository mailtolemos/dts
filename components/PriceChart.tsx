'use client';
import { useEffect, useRef } from 'react';
import type { Candle } from '@/lib/types';

interface Props { data: Candle[] }

// Client-only chart. We lazy-import lightweight-charts to keep SSR clean.
export default function PriceChart({ data }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let chart: { remove(): void } | null = null;
    let resizeObs: ResizeObserver | null = null;
    let cancelled = false;

    (async () => {
      if (!ref.current) return;
      const { createChart, ColorType } = await import('lightweight-charts');
      if (cancelled || !ref.current) return;

      const el = ref.current;
      const c = createChart(el, {
        height: el.clientHeight,
        width: el.clientWidth,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#7c8aa3',
          attributionLogo: false,
        },
        grid: {
          horzLines: { color: 'rgba(255,255,255,0.04)' },
          vertLines: { color: 'rgba(255,255,255,0.04)' },
        },
        rightPriceScale: { borderColor: '#222a3a' },
        timeScale: { borderColor: '#222a3a' },
        crosshair: { mode: 0 },
      });
      const series = (c as unknown as {
        addCandlestickSeries: (o: Record<string, unknown>) => {
          setData: (d: Array<{ time: number; open: number; high: number; low: number; close: number }>) => void;
        };
      }).addCandlestickSeries({
        upColor: '#34d399', downColor: '#f87171',
        borderUpColor: '#34d399', borderDownColor: '#f87171',
        wickUpColor: '#34d399', wickDownColor: '#f87171',
      });
      series.setData(data.map((d) => ({ time: d.t, open: d.o, high: d.h, low: d.l, close: d.c })));
      chart = c as unknown as { remove(): void };

      resizeObs = new ResizeObserver(() => {
        if (!el || !chart) return;
        (chart as unknown as { applyOptions: (o: { width: number; height: number }) => void })
          .applyOptions({ width: el.clientWidth, height: el.clientHeight });
      });
      resizeObs.observe(el);
    })();

    return () => {
      cancelled = true;
      resizeObs?.disconnect();
      chart?.remove();
    };
  }, [data]);

  return <div ref={ref} className="w-full h-full min-h-[320px]" />;
}

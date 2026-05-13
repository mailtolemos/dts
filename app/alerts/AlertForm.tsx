'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type AlertType = 'PRICE_CROSS' | 'PCT_MOVE' | 'VOL_EXPANSION' | 'THESIS_CHANGE' | 'TREND_CHANGE' | 'NEWS_EVENT';

export default function AlertForm() {
  const router = useRouter();
  const [symbol, setSymbol] = useState('BTC');
  const [type, setType] = useState<AlertType>('PRICE_CROSS');
  const [level, setLevel] = useState('');
  const [direction, setDirection] = useState<'ABOVE' | 'BELOW'>('ABOVE');
  const [pct, setPct] = useState('3');
  const [windowMin, setWindowMin] = useState('60');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setMsg(null);
    const params: Record<string, unknown> =
      type === 'PRICE_CROSS' ? { level: Number(level), direction }
      : type === 'PCT_MOVE'  ? { pct: Number(pct), windowMin: Number(windowMin) }
      : type === 'NEWS_EVENT'? { minImpact: 'MEDIUM' }
      : type === 'VOL_EXPANSION' ? { atrMultiple: 1.5, lookback: 14 }
      : {};
    try {
      const r = await fetch('/api/alerts', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol: symbol.toUpperCase(), type, params }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg(`Failed: ${j?.error?.message ?? r.statusText}`); }
      else { setMsg('Created.'); router.refresh(); }
    } catch (e) { setMsg(`Failed: ${String(e)}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
        <Field label="Symbol">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="w-full bg-panel2 border border-border rounded px-2 py-1.5 text-sm mono" />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as AlertType)}
            className="w-full bg-panel2 border border-border rounded px-2 py-1.5 text-sm">
            <option value="PRICE_CROSS">PRICE_CROSS</option>
            <option value="PCT_MOVE">PCT_MOVE</option>
            <option value="VOL_EXPANSION">VOL_EXPANSION</option>
            <option value="THESIS_CHANGE">THESIS_CHANGE</option>
            <option value="TREND_CHANGE">TREND_CHANGE</option>
            <option value="NEWS_EVENT">NEWS_EVENT</option>
          </select>
        </Field>

        {type === 'PRICE_CROSS' && (
          <>
            <Field label="Level">
              <input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="67000"
                className="w-full bg-panel2 border border-border rounded px-2 py-1.5 text-sm mono" />
            </Field>
            <Field label="Direction">
              <select value={direction} onChange={(e) => setDirection(e.target.value as 'ABOVE' | 'BELOW')}
                className="w-full bg-panel2 border border-border rounded px-2 py-1.5 text-sm">
                <option value="ABOVE">ABOVE</option>
                <option value="BELOW">BELOW</option>
              </select>
            </Field>
          </>
        )}
        {type === 'PCT_MOVE' && (
          <>
            <Field label="% threshold">
              <input value={pct} onChange={(e) => setPct(e.target.value)}
                className="w-full bg-panel2 border border-border rounded px-2 py-1.5 text-sm mono" />
            </Field>
            <Field label="Window (min)">
              <input value={windowMin} onChange={(e) => setWindowMin(e.target.value)}
                className="w-full bg-panel2 border border-border rounded px-2 py-1.5 text-sm mono" />
            </Field>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={submit} disabled={busy}
          className="text-xs px-3 py-1.5 rounded-md bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 disabled:opacity-50">
          {busy ? 'Saving…' : 'Create alert'}
        </button>
        {msg ? <span className="text-[11px] text-muted">{msg}</span> : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-muted uppercase tracking-wide mb-1">{label}</div>
      {children}
    </div>
  );
}

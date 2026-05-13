'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function RegenButton({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  async function go() {
    setStatus('Generating…');
    try {
      const r = await fetch('/api/cards/regenerate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setStatus(`Failed: ${j?.error?.message ?? r.statusText}`);
        return;
      }
      setStatus('Done.');
      startTransition(() => router.refresh());
    } catch (e) {
      setStatus(`Failed: ${String(e)}`);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={go} disabled={pending}
        className="text-xs px-3 py-1.5 rounded-md bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 disabled:opacity-50">
        {pending ? 'Refreshing…' : 'Regenerate AI thesis'}
      </button>
      {status ? <span className="text-[11px] text-muted">{status}</span> : null}
    </div>
  );
}

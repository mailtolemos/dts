import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-lg border border-border bg-panel shadow-panel', className)}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {hint ? <div className="text-[11px] text-muted mt-0.5">{hint}</div> : null}
      </div>
      {right}
    </div>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'bull' | 'bear' | 'warn' | 'neutral' | 'accent' }) {
  const toneClass = {
    bull:    'bg-bull/15  text-bull  border-bull/30',
    bear:    'bg-bear/15  text-bear  border-bear/30',
    warn:    'bg-warn/15  text-warn  border-warn/30',
    neutral: 'bg-panel2   text-muted border-border',
    accent:  'bg-accent/15 text-accent border-accent/30',
  }[tone];
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase tracking-wide', toneClass)}>
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bull' | 'bear' }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[11px] text-muted uppercase tracking-wide">{label}</div>
      <div className={clsx('mt-1 text-xl font-semibold tabular mono',
        tone === 'bull' && 'text-bull', tone === 'bear' && 'text-bear')}>{value}</div>
      {sub ? <div className="text-[11px] text-muted mt-0.5">{sub}</div> : null}
    </div>
  );
}

export function fmtPct(p?: number | null, digits = 2): string {
  if (p == null || Number.isNaN(p)) return '—';
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(digits)}%`;
}

export function fmtPrice(p?: number | null): string {
  if (p == null || Number.isNaN(p)) return '—';
  const abs = Math.abs(p);
  const digits = abs > 1000 ? 2 : abs > 1 ? 2 : abs > 0.01 ? 4 : 6;
  return p.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function toneFromChange(p?: number | null): 'bull' | 'bear' | undefined {
  if (p == null) return undefined;
  if (p > 0) return 'bull';
  if (p < 0) return 'bear';
  return undefined;
}

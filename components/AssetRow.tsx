import Link from 'next/link';
import { fmtPrice, fmtPct, toneFromChange, Pill } from './ui';
import { clsx } from 'clsx';

export interface AssetRowProps {
  symbol: string;
  name: string;
  assetClass: string;
  last: number;
  pctChange24h?: number;
  conf?: number;
  source?: string;
  stale?: boolean;
  updatedAt?: string;
}

export default function AssetRow(p: AssetRowProps) {
  const tone = toneFromChange(p.pctChange24h);
  return (
    <Link href={`/asset/${p.symbol}`}
      className="grid grid-cols-[1fr_120px_120px_90px_90px] items-center px-4 py-2.5 hover:bg-panel2 border-b border-border last:border-none">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-md bg-panel2 border border-border grid place-items-center text-[10px] mono">
          {p.symbol.slice(0, 3)}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{p.symbol} <span className="text-muted text-xs ml-1">{p.name}</span></div>
          <div className="text-[11px] text-muted">{p.assetClass}</div>
        </div>
      </div>
      <div className="text-right mono tabular text-sm">{fmtPrice(p.last)}</div>
      <div className={clsx('text-right mono tabular text-sm', tone === 'bull' && 'text-bull', tone === 'bear' && 'text-bear')}>
        {fmtPct(p.pctChange24h)}
      </div>
      <div className="text-right text-[11px] text-muted mono tabular">
        {p.conf != null ? `±${fmtPrice(p.conf)}` : '—'}
      </div>
      <div className="text-right">
        {p.stale ? <Pill tone="warn">stale</Pill>
          : p.source === 'MOCK' ? <Pill>mock</Pill>
          : <Pill tone="accent">{p.source ?? 'live'}</Pill>}
      </div>
    </Link>
  );
}

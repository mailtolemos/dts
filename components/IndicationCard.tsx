import { Pill, fmtPrice } from './ui';

export interface IndicationCardProps {
  symbol: string;
  name?: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'WATCH';
  horizon: 'INTRADAY' | 'SWING' | 'MULTIWEEK';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoning: string;
  keyLevels: { support?: number[]; resistance?: number[]; invalidation: number };
  riskNotes: string;
  whatChangesView: string;
  sourcesUsed: string[];
  at: string;
  model?: string;
}

export default function IndicationCard(p: IndicationCardProps) {
  const tone = p.bias === 'BULLISH' ? 'bull' : p.bias === 'BEARISH' ? 'bear' : p.bias === 'WATCH' ? 'warn' : 'neutral';
  const conf = p.confidence === 'HIGH' ? 'accent' : p.confidence === 'MEDIUM' ? 'warn' : 'neutral';
  return (
    <div className="rounded-lg border border-border bg-panel p-4 shadow-panel">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">{p.symbol}</div>
            {p.name ? <div className="text-xs text-muted">{p.name}</div> : null}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <Pill tone={tone as 'bull' | 'bear' | 'warn' | 'neutral'}>{p.bias}</Pill>
            <Pill>{p.horizon}</Pill>
            <Pill tone={conf as 'accent' | 'warn' | 'neutral'}>conf {p.confidence}</Pill>
          </div>
        </div>
        <div className="text-[10px] text-muted text-right">
          {new Date(p.at).toLocaleString()}<br />
          <span className="mono">{p.model ?? ''}</span>
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed">{p.reasoning}</p>

      <div className="mt-3 grid grid-cols-3 gap-3 text-[11px]">
        <div>
          <div className="text-muted uppercase tracking-wide">Support</div>
          <div className="mono tabular mt-0.5">{(p.keyLevels.support ?? []).map(fmtPrice).join(' · ') || '—'}</div>
        </div>
        <div>
          <div className="text-muted uppercase tracking-wide">Resistance</div>
          <div className="mono tabular mt-0.5">{(p.keyLevels.resistance ?? []).map(fmtPrice).join(' · ') || '—'}</div>
        </div>
        <div>
          <div className="text-muted uppercase tracking-wide">Invalidation</div>
          <div className="mono tabular mt-0.5 text-bear">{fmtPrice(p.keyLevels.invalidation)}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <div className="text-muted text-[10px] uppercase tracking-wide">Risk notes</div>
          <div className="mt-0.5">{p.riskNotes}</div>
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-wide">What would change the view</div>
          <div className="mt-0.5">{p.whatChangesView}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {p.sourcesUsed.map((s) => <Pill key={s}>{s}</Pill>)}
      </div>
    </div>
  );
}

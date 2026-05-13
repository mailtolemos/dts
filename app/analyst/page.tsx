import { Panel, PanelHeader } from '@/components/ui';
import IndicationCard from '@/components/IndicationCard';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AnalystPage() {
  const rows = await prisma.aiAnalysis.findMany({
    take: 30, orderBy: { at: 'desc' }, include: { asset: true },
  }).catch(() => []);

  return (
    <div className="p-5 max-w-[1280px] mx-auto space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xl font-semibold">AI Analyst</div>
          <div className="text-[11px] text-muted">Indication cards across the universe. Newest first.</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <Panel>
          <PanelHeader title="No cards yet" hint="Cards appear after the worker runs an analyst pass, or you click Regenerate on an asset detail page." />
          <div className="px-4 py-6 text-sm text-muted">Run <code className="mono">pnpm worker</code> in a terminal, or open any asset page and click "Regenerate AI thesis".</div>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((r) => (
            <IndicationCard key={r.id}
              symbol={r.asset.symbol} name={r.asset.name}
              bias={r.bias as 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'WATCH'}
              horizon={r.horizon as 'INTRADAY' | 'SWING' | 'MULTIWEEK'}
              confidence={r.confidence as 'LOW' | 'MEDIUM' | 'HIGH'}
              reasoning={r.reasoning}
              keyLevels={r.keyLevels as { support?: number[]; resistance?: number[]; invalidation: number }}
              riskNotes={r.riskNotes}
              whatChangesView={r.whatChangesView}
              sourcesUsed={r.sourcesUsed as string[]}
              at={r.at.toISOString()} model={r.model}
            />
          ))}
        </div>
      )}
    </div>
  );
}

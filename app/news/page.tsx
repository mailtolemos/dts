import { Panel, PanelHeader, Pill } from '@/components/ui';
import { getNews } from '@/lib/providers/cryptopanic';
import { prisma } from '@/lib/db';

export const revalidate = 60;

const IMPACT_TONE: Record<string, 'bull' | 'bear' | 'warn' | 'neutral' | 'accent'> = {
  HIGH: 'warn', MEDIUM: 'accent', LOW: 'neutral',
};

export default async function NewsPage() {
  const fromDb = await prisma.newsItem.findMany({ orderBy: { publishedAt: 'desc' }, take: 40 }).catch(() => []);
  const items = fromDb.length > 0
    ? fromDb.map((n) => ({
        id: n.id, title: n.title, url: n.url, source: n.source,
        publishedAt: n.publishedAt.toISOString(), impact: n.impact,
        factuality: n.factuality, secondOrder: n.secondOrder,
      }))
    : (await getNews()).slice(0, 40).map((n) => ({
        id: n.id, title: n.title, url: n.url, source: n.source,
        publishedAt: n.publishedAt, impact: 'LOW', factuality: 'REPORTED', secondOrder: null,
      }));

  return (
    <div className="p-5 max-w-[1024px] mx-auto space-y-4">
      <div className="text-xl font-semibold">News intelligence</div>
      <Panel>
        <PanelHeader title="Recent items" hint="Classified by impact. Click to read source." />
        <div>
          {items.map((n) => (
            <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer"
               className="block px-4 py-3 hover:bg-panel2 border-b border-border last:border-none">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm">{n.title}</div>
                <div className="flex items-center gap-1 shrink-0">
                  <Pill tone={IMPACT_TONE[n.impact] ?? 'neutral'}>{n.impact}</Pill>
                  <Pill>{n.factuality}</Pill>
                </div>
              </div>
              <div className="text-[11px] text-muted mt-1">{n.source} · {new Date(n.publishedAt).toLocaleString()}</div>
              {n.secondOrder ? <div className="text-[12px] mt-1 text-text/80">→ {n.secondOrder}</div> : null}
            </a>
          ))}
        </div>
      </Panel>
    </div>
  );
}

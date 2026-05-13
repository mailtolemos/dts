import { Panel, PanelHeader, Pill } from '@/components/ui';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import AlertForm from './AlertForm';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const user = await getCurrentUser().catch(() => null);
  const list = user ? await prisma.alert.findMany({
    where: { userId: user.id }, include: { asset: true, events: { take: 1, orderBy: { firedAt: 'desc' } } },
    orderBy: { createdAt: 'desc' },
  }) : [];

  return (
    <div className="p-5 max-w-[1024px] mx-auto space-y-4">
      <div className="text-xl font-semibold">Alerts</div>

      <Panel>
        <PanelHeader title="New alert" hint="Price crosses, % moves, vol expansion, thesis changes, news events." />
        <div className="p-4">
          <AlertForm />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title={`${list.length} configured`} />
        {list.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted">No alerts yet. Create one above.</div>
        ) : (
          <div>
            {list.map((a) => (
              <div key={a.id} className="px-4 py-3 border-b border-border last:border-none">
                <div className="flex items-center gap-2">
                  <Pill tone={a.enabled ? 'accent' : 'neutral'}>{a.enabled ? 'ON' : 'OFF'}</Pill>
                  <Pill>{a.type}</Pill>
                  <div className="text-sm">{a.asset?.symbol ?? '—'}</div>
                </div>
                <div className="text-[11px] text-muted mt-1 mono">{JSON.stringify(a.params)}</div>
                <div className="text-[11px] text-muted mt-0.5">
                  Last fired: {a.lastTriggeredAt ? new Date(a.lastTriggeredAt).toLocaleString() : 'never'}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

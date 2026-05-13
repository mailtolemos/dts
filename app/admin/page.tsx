import { Panel, PanelHeader, Pill } from '@/components/ui';
import * as pyth from '@/lib/providers/pyth';
import * as cg from '@/lib/providers/coingecko';
import * as cp from '@/lib/providers/cryptopanic';
import * as fred from '@/lib/providers/fred';
import * as sent from '@/lib/providers/sentiment';
import * as groq from '@/lib/ai/groq';
import { env, flags } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const [P, C, N, F, S, G] = await Promise.all([
    pyth.health(), cg.health(), cp.health(), fred.health(), sent.health(), groq.health(),
  ]);
  const rows = [
    { name: 'pyth',        ok: P.ok, hasKey: flags.hasPyth,       lastError: P.lastError },
    { name: 'coingecko',   ok: C.ok, hasKey: true,                lastError: C.lastError },
    { name: 'cryptopanic', ok: N.ok, hasKey: flags.hasCryptopanic, lastError: N.lastError },
    { name: 'fred',        ok: F.ok, hasKey: flags.hasFred,       lastError: F.lastError },
    { name: 'sentiment',   ok: S.ok, hasKey: true,                lastError: S.lastError },
    { name: 'groq',        ok: G.ok, hasKey: flags.hasGroq,       lastError: G.lastError },
  ];

  return (
    <div className="p-5 max-w-[1024px] mx-auto space-y-4">
      <div className="text-xl font-semibold">Admin</div>

      <Panel>
        <PanelHeader title="Provider status" hint="All keys are read from environment variables. Never exposed to the client." />
        <div>
          {rows.map((r) => (
            <div key={r.name} className="grid grid-cols-[120px_1fr_1fr_auto] gap-3 items-center px-4 py-2.5 border-b border-border last:border-none">
              <div className="text-sm font-medium">{r.name}</div>
              <div className="flex items-center gap-1.5">
                {r.ok ? <Pill tone="bull">OK</Pill> : <Pill tone="bear">DOWN</Pill>}
                {r.hasKey ? <Pill tone="accent">key set</Pill> : <Pill>no key</Pill>}
              </div>
              <div className="text-[11px] text-muted truncate mono">{r.lastError ?? ''}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Settings" hint="Env-locked. Edit .env.local and restart." />
        <div className="p-4 grid grid-cols-2 gap-3 text-[12px] mono">
          <KV k="NODE_ENV" v={env().NODE_ENV} />
          <KV k="LOG_LEVEL" v={env().LOG_LEVEL} />
          <KV k="GROQ_MODEL" v={env().GROQ_MODEL} />
          <KV k="GROQ_FAST_MODEL" v={env().GROQ_FAST_MODEL} />
          <KV k="PYTH_HERMES_URL" v={env().PYTH_HERMES_URL} />
          <KV k="AUTH_ENABLED" v={env().AUTH_ENABLED} />
        </div>
      </Panel>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted">{k}</span>
      <span>{v}</span>
    </div>
  );
}

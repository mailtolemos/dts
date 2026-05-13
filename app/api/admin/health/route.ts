import { ok } from '@/lib/api';
import * as pyth from '@/lib/providers/pyth';
import * as cg from '@/lib/providers/coingecko';
import * as cp from '@/lib/providers/cryptopanic';
import * as fred from '@/lib/providers/fred';
import * as sent from '@/lib/providers/sentiment';
import * as groq from '@/lib/ai/groq';
import { flags } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [P, C, N, F, S, G] = await Promise.all([
    pyth.health(), cg.health(), cp.health(), fred.health(), sent.health(), groq.health(),
  ]);
  return ok({
    providers: [
      { name: 'pyth',        ok: P.ok, lastError: P.lastError, hasKey: flags.hasPyth },
      { name: 'coingecko',   ok: C.ok, lastError: C.lastError },
      { name: 'cryptopanic', ok: N.ok, lastError: N.lastError, hasKey: flags.hasCryptopanic },
      { name: 'fred',        ok: F.ok, lastError: F.lastError, hasKey: flags.hasFred },
      { name: 'sentiment',   ok: S.ok, lastError: S.lastError },
      { name: 'groq',        ok: G.ok, lastError: G.lastError, hasKey: flags.hasGroq },
    ],
    worker: { status: 'IDLE' },  // populated by worker process via DB later
  });
}

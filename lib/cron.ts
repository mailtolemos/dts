// Shared helper for cron routes.
//   - Verifies Authorization: Bearer ${CRON_SECRET}.
//   - In dev (CRON_SECRET unset) allows requests from localhost.
import { NextRequest } from 'next/server';

export function assertCronAuth(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret) {
    // Allow local dev. Production must set CRON_SECRET.
    if (process.env.NODE_ENV !== 'production') return { ok: true };
    return { ok: false, reason: 'CRON_SECRET not configured' };
  }
  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  // Constant-time compare-ish (length-bound).
  if (header.length !== expected.length) return { ok: false, reason: 'bad auth' };
  let diff = 0;
  for (let i = 0; i < header.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? { ok: true } : { ok: false, reason: 'bad auth' };
}

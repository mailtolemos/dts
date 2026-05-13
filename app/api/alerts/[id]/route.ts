import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const Patch = z.object({ enabled: z.boolean().optional(), params: z.record(z.any()).optional() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: unknown; try { body = await req.json(); } catch { return err('BAD_REQUEST', 'invalid json'); }
  const p = Patch.safeParse(body); if (!p.success) return err('BAD_REQUEST', p.error.message);
  const user = await getCurrentUser();
  const a = await prisma.alert.findFirst({ where: { id: params.id, userId: user.id } });
  if (!a) return err('ASSET_NOT_FOUND', 'alert');
  const upd = await prisma.alert.update({
    where: { id: a.id },
    data: {
      ...(p.data.enabled !== undefined ? { enabled: p.data.enabled } : {}),
      ...(p.data.params  !== undefined ? { params: p.data.params as never } : {}),
    },
  });
  return ok({ id: upd.id });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  await prisma.alert.deleteMany({ where: { id: params.id, userId: user.id } });
  return ok({ ok: true });
}

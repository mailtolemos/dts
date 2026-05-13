import { env, flags } from './env';
import { prisma } from './db';

/**
 * v1 single-user mode: there is always exactly one User, identified by DTS_USER_EMAIL.
 * `getCurrentUser()` upserts and returns it on first call.
 */
export async function getCurrentUser() {
  if (flags.authEnabled) {
    // Multi-user mode would consult NextAuth session here. Stubbed for v1.
    throw new Error('AUTH_ENABLED=1 requires NextAuth wiring (not in v1 scaffold).');
  }
  const email = env().DTS_USER_EMAIL;
  return prisma.user.upsert({
    where: { email },
    create: { email, displayName: 'You' },
    update: {},
  });
}

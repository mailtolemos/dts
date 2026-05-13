import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  GROQ_API_KEY: z.string().optional().default(''),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  GROQ_FAST_MODEL: z.string().default('llama-3.1-8b-instant'),
  PYTH_API_KEY: z.string().optional().default(''),
  PYTH_HERMES_URL: z.string().url().default('https://hermes.pyth.network'),
  CRYPTOPANIC_API_KEY: z.string().optional().default(''),
  FRED_API_KEY: z.string().optional().default(''),
  POLYGON_API_KEY: z.string().optional().default(''),
  COINGECKO_API_KEY: z.string().optional().default(''),
  AUTH_ENABLED: z.string().default('0'),
  DTS_USER_EMAIL: z.string().email().default('you@example.com'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

// Lazy parse so unit tests can stub process.env.
let cached: Env | null = null;
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

// Convenience flags (do NOT export raw keys; only booleans).
export const flags = {
  get hasGroq() { return env().GROQ_API_KEY.length > 0; },
  get hasPyth() { return env().PYTH_API_KEY.length > 0; },
  get hasCryptopanic() { return env().CRYPTOPANIC_API_KEY.length > 0; },
  get hasFred() { return env().FRED_API_KEY.length > 0; },
  get hasPolygon() { return env().POLYGON_API_KEY.length > 0; },
  get authEnabled() { return env().AUTH_ENABLED === '1'; },
};

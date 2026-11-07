import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? '0.0.0.0',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  databaseUrl: required('DATABASE_URL', 'postgres://osl:osl@localhost:5432/openstatuslayer'),
  // Check worker
  checkIntervalMs: Number(process.env.CHECK_INTERVAL_MS ?? 30000),
  checkTimeoutMs: Number(process.env.CHECK_TIMEOUT_MS ?? 5000),
  degradedLatencyMs: Number(process.env.DEGRADED_LATENCY_MS ?? 1000),
};

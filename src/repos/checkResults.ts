import { pool } from '../db/index.js';
import type { Status } from '../checks/classify.js';

export interface CheckResultInput {
  serviceId: string;
  source?: 'synthetic' | 'push';
  status: Status;
  latencyMs?: number | null;
  detail?: Record<string, unknown>;
}

export async function insertCheckResult(input: CheckResultInput): Promise<void> {
  await pool.query(
    `INSERT INTO check_results(service_id, source, status, latency_ms, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.serviceId,
      input.source ?? 'synthetic',
      input.status,
      input.latencyMs ?? null,
      JSON.stringify(input.detail ?? {}),
    ],
  );
}

export async function latestCheckResult(
  serviceId: string,
): Promise<{ status: Status; latencyMs: number | null } | null> {
  const { rows } = await pool.query<{ status: Status; latency_ms: number | null }>(
    'SELECT status, latency_ms FROM check_results WHERE service_id = $1 ORDER BY observed_at DESC LIMIT 1',
    [serviceId],
  );
  return rows[0] ? { status: rows[0].status, latencyMs: rows[0].latency_ms } : null;
}

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

/** Latest status per service, across both synthetic and pushed results. */
export async function latestStatuses(): Promise<Map<string, Status>> {
  const { rows } = await pool.query<{ service_id: string; status: Status }>(
    `SELECT DISTINCT ON (service_id) service_id, status
       FROM check_results
      ORDER BY service_id, observed_at DESC, id DESC`,
  );
  return new Map(rows.map((r) => [r.service_id, r.status]));
}

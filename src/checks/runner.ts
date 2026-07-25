import { listServices } from '../repos/services.js';
import { insertCheckResult } from '../repos/checkResults.js';
import { httpCheck } from './http.js';
import { tcpCheck } from './tcp.js';
import { config } from '../config.js';

export interface RunSummary {
  checked: number;
  skipped: number;
}

/**
 * Runs one synthetic-check pass across all services that have a probe target.
 * Push-only services (check_type = 'push') are skipped — their signals arrive
 * via the ingest endpoint. Results are persisted to check_results.
 */
export async function runChecksOnce(): Promise<RunSummary> {
  const services = await listServices();
  let checked = 0;
  let skipped = 0;

  await Promise.all(
    services.map(async (svc) => {
      if (svc.checkType === 'push' || !svc.checkUrl) {
        skipped += 1;
        return;
      }
      const outcome =
        svc.checkType === 'tcp'
          ? await tcpCheck(svc.checkUrl, config.checkTimeoutMs, config.degradedLatencyMs)
          : await httpCheck(svc.checkUrl, config.checkTimeoutMs, config.degradedLatencyMs);
      await insertCheckResult({
        serviceId: svc.id,
        status: outcome.status,
        latencyMs: outcome.latencyMs,
        detail: outcome.detail,
      });
      checked += 1;
    }),
  );

  return { checked, skipped };
}

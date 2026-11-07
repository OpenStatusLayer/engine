// Pure status classification — no I/O, fully unit-testable.
export type Status = 'operational' | 'degraded' | 'down';

/**
 * Classify an HTTP check result.
 * - non-2xx or no response => down
 * - 2xx but slow (>= degradedMs) => degraded
 * - 2xx and fast => operational
 */
export function classifyHttp(
  statusCode: number | null,
  latencyMs: number,
  degradedMs: number,
): Status {
  if (statusCode === null || statusCode < 200 || statusCode >= 300) return 'down';
  return latencyMs >= degradedMs ? 'degraded' : 'operational';
}

/**
 * Classify a TCP connect result.
 * - failed connect => down
 * - connected but slow => degraded
 * - connected and fast => operational
 */
export function classifyTcp(connected: boolean, latencyMs: number, degradedMs: number): Status {
  if (!connected) return 'down';
  return latencyMs >= degradedMs ? 'degraded' : 'operational';
}

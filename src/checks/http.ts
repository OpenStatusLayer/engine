import { classifyHttp, type Status } from './classify.js';

export interface CheckOutcome {
  status: Status;
  latencyMs: number;
  detail: Record<string, unknown>;
}

export async function httpCheck(url: string, timeoutMs: number, degradedMs: number): Promise<CheckOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'manual' });
    const latencyMs = Math.round(performance.now() - started);
    return {
      status: classifyHttp(res.status, latencyMs, degradedMs),
      latencyMs,
      detail: { statusCode: res.status },
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    const reason = err instanceof Error ? err.name : 'error';
    return { status: 'down', latencyMs, detail: { error: reason } };
  } finally {
    clearTimeout(timer);
  }
}

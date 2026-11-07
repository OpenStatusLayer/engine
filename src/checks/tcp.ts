import net from 'node:net';
import { classifyTcp, type Status } from './classify.js';
import type { CheckOutcome } from './http.js';

// Accepts "host:port" (or a URL whose host/port we parse).
function parseHostPort(target: string): { host: string; port: number } | null {
  try {
    if (target.includes('://')) {
      const u = new URL(target);
      return { host: u.hostname, port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80) };
    }
    const [host, port] = target.split(':');
    if (!host || !port) return null;
    return { host, port: Number(port) };
  } catch {
    return null;
  }
}

export function tcpCheck(target: string, timeoutMs: number, degradedMs: number): Promise<CheckOutcome> {
  const parsed = parseHostPort(target);
  if (!parsed) {
    return Promise.resolve({ status: 'down' as Status, latencyMs: 0, detail: { error: 'bad_target' } });
  }
  return new Promise((resolve) => {
    const started = performance.now();
    const socket = new net.Socket();
    const done = (connected: boolean, extra: Record<string, unknown> = {}) => {
      const latencyMs = Math.round(performance.now() - started);
      socket.destroy();
      resolve({ status: classifyTcp(connected, latencyMs, degradedMs), latencyMs, detail: { ...extra } });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false, { error: 'timeout' }));
    socket.once('error', (e) => done(false, { error: e.name }));
    socket.connect(parsed.port, parsed.host);
  });
}

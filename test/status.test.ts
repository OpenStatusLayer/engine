import { describe, it, expect, afterAll } from 'vitest';
import { build } from '../src/server.js';
import { pool } from '../src/db/index.js';

interface ServiceStatus {
  serviceId: string;
  directStatus: string;
  derivedStatus: string;
  reason: string | null;
  blastRadius: string[];
}

const runDb = process.env.RUN_DB_TESTS === '1';

// Validation runs before any query, so these need no database.
describe('POST /ingest validation', () => {
  const app = build();
  afterAll(async () => {
    await app.close();
    if (!runDb) await pool.end();
  });

  const cases: [Record<string, unknown>, string][] = [
    [{}, 'missing fields'],
    [{ serviceKey: 'x', status: 'on fire' }, 'unknown status'],
    [{ serviceKey: 'x', status: 'down', latencyMs: 1.5 }, 'non-integer latency'],
    [{ serviceKey: 'x', status: 'down', detail: [1] }, 'array detail'],
  ];
  it.each(cases)('rejects %j (%s) with 400', async (payload) => {
    const res = await app.inject({ method: 'POST', url: '/ingest', payload });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error');
  });
});

describe.runIf(runDb)('dependency-aware /status', () => {
  const app = build();
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function post(url: string, payload: Record<string, unknown>) {
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBeLessThan(300);
    return res.statusCode === 202 ? null : res.json();
  }

  it('propagates a pushed failure up the graph and reports the blast radius', async () => {
    const tag = Date.now();
    const sys = await post('/systems', { key: `st-${tag}`, name: 'Status test' });
    const svc = (k: string) =>
      post('/services', { systemId: sys.id, key: `${k}-${tag}`, name: k, checkType: 'push' });
    const web = await svc('web');
    const api = await svc('api');
    const db = await svc('db');
    const cache = await svc('cache');
    await post('/dependencies', { serviceId: web.id, dependsOnId: api.id, kind: 'hard' });
    await post('/dependencies', { serviceId: api.id, dependsOnId: db.id, kind: 'hard' });
    await post('/dependencies', { serviceId: api.id, dependsOnId: cache.id, kind: 'soft' });

    const statusOf = async () => {
      const res = await app.inject({ method: 'GET', url: `/status?systemId=${sys.id}` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.services).toHaveLength(4);
      expect(body.edges).toHaveLength(3);
      const list = body.services as ServiceStatus[];
      return Object.fromEntries(list.map((x) => [x.serviceId, x])) as Record<string, ServiceStatus>;
    };

    // No signals yet: everything operational.
    let s = await statusOf();
    expect(Object.values(s).every((x) => x.derivedStatus === 'operational')).toBe(true);

    // Soft dependency down: api and web degrade.
    await post('/ingest', { serviceKey: `cache-${tag}`, status: 'down' });
    s = await statusOf();
    expect(s[api.id].derivedStatus).toBe('degraded');
    expect(s[web.id].derivedStatus).toBe('degraded');

    // Hard dependency down: api and web go down, db's blast radius covers both.
    await post('/ingest', { serviceKey: `db-${tag}`, status: 'down', latencyMs: 12, detail: { from: 'test' } });
    s = await statusOf();
    expect(s[db.id].directStatus).toBe('down');
    expect(s[api.id].directStatus).toBe('operational');
    expect(s[api.id].derivedStatus).toBe('down');
    expect(s[web.id].derivedStatus).toBe('down');
    expect(s[api.id].reason).toContain('hard dependency db is down');
    expect([...s[db.id].blastRadius].sort()).toEqual([api.id, web.id].sort());

    // Recovery: the latest signal wins.
    await post('/ingest', { serviceKey: `db-${tag}`, status: 'operational' });
    await post('/ingest', { serviceKey: `cache-${tag}`, status: 'operational' });
    s = await statusOf();
    expect(Object.values(s).every((x) => x.derivedStatus === 'operational')).toBe(true);
  });

  it('returns 404 when ingesting for an unknown service', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ingest',
      payload: { serviceKey: `nope-${Date.now()}`, status: 'down' },
    });
    expect(res.statusCode).toBe(404);
  });
});

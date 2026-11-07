// Integration tests against a real Postgres. Run only when RUN_DB_TESTS=1 and a
// migrated database is reachable via DATABASE_URL (CI provides both). Skipped
// locally so `npm test` stays runnable without a database.
import { describe, it, expect, afterAll } from 'vitest';
import { build } from '../src/server.js';
import { pool } from '../src/db/index.js';

const runDb = process.env.RUN_DB_TESTS === '1';

describe.runIf(runDb)('CRUD + dependency graph', () => {
  const app = build();

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('creates a system, services, and a dependency edge', async () => {
    const sys = await app.inject({
      method: 'POST',
      url: '/systems',
      payload: { key: `sys-${Date.now()}`, name: 'Test System', isPublic: true },
    });
    expect(sys.statusCode).toBe(201);
    const systemId = sys.json().id as string;

    const a = await app.inject({
      method: 'POST',
      url: '/services',
      payload: { systemId, key: `a-${Date.now()}`, name: 'A' },
    });
    const b = await app.inject({
      method: 'POST',
      url: '/services',
      payload: { systemId, key: `b-${Date.now()}`, name: 'B' },
    });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(a.json().checkType).toBe('http');

    const dep = await app.inject({
      method: 'POST',
      url: '/dependencies',
      payload: { serviceId: a.json().id, dependsOnId: b.json().id, kind: 'hard' },
    });
    expect(dep.statusCode).toBe(201);
    expect(dep.json().kind).toBe('hard');

    const list = await app.inject({ method: 'GET', url: `/services?systemId=${systemId}` });
    expect(list.json()).toHaveLength(2);
  });

  it('rejects a self-dependency with 400', async () => {
    const s = await app.inject({
      method: 'POST',
      url: '/services',
      payload: { key: `self-${Date.now()}`, name: 'Self' },
    });
    const id = s.json().id as string;
    const dep = await app.inject({
      method: 'POST',
      url: '/dependencies',
      payload: { serviceId: id, dependsOnId: id },
    });
    expect(dep.statusCode).toBe(400);
  });

  it('returns 409 for a duplicate service key', async () => {
    const key = `dup-${Date.now()}`;
    const first = await app.inject({ method: 'POST', url: '/services', payload: { key, name: 'Dup' } });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/services', payload: { key, name: 'Dup' } });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'key already exists' });
  });

  it('returns 409 for a duplicate dependency edge', async () => {
    const a = await app.inject({ method: 'POST', url: '/services', payload: { key: `ea-${Date.now()}`, name: 'A' } });
    const b = await app.inject({ method: 'POST', url: '/services', payload: { key: `eb-${Date.now()}`, name: 'B' } });
    const payload = { serviceId: a.json().id, dependsOnId: b.json().id };
    expect((await app.inject({ method: 'POST', url: '/dependencies', payload })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/dependencies', payload })).statusCode).toBe(409);
  });

  it('returns 404 when a dependency references an unknown service', async () => {
    const s = await app.inject({ method: 'POST', url: '/services', payload: { key: `fk-${Date.now()}`, name: 'FK' } });
    const dep = await app.inject({
      method: 'POST',
      url: '/dependencies',
      payload: { serviceId: s.json().id, dependsOnId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(dep.statusCode).toBe(404);
    expect(dep.json()).toEqual({ error: 'referenced depends_on_id does not exist' });
  });

  it('returns 404 when a service references an unknown system', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/services',
      payload: { key: `nosys-${Date.now()}`, name: 'X', systemId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for a malformed id or systemId', async () => {
    expect((await app.inject({ method: 'GET', url: '/services/not-a-uuid' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/services?systemId=nope' })).statusCode).toBe(400);
  });

  it('returns 404 for an unknown service', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/services/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
  });
});

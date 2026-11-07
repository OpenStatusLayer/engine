// Unit tests for database-error mapping and the app-wide error handler.
// No database needed: errors are simulated with the shape `pg` throws.
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { mapDbError, registerErrorHandler } from '../src/errors.js';

function pgError(fields: Record<string, unknown>): Error {
  return Object.assign(new Error('db error'), fields);
}

describe('mapDbError', () => {
  it('maps a malformed uuid to 400', () => {
    expect(mapDbError(pgError({ code: '22P02' }))).toEqual({
      statusCode: 400,
      error: 'invalid identifier or value',
    });
  });

  it('maps a unique violation to 409 naming the column', () => {
    const err = pgError({ code: '23505', detail: 'Key (key)=(web) already exists.' });
    expect(mapDbError(err)).toEqual({ statusCode: 409, error: 'key already exists' });
  });

  it('maps a composite unique violation to 409', () => {
    const err = pgError({
      code: '23505',
      detail: 'Key (service_id, depends_on_id)=(a, b) already exists.',
    });
    expect(mapDbError(err)).toEqual({
      statusCode: 409,
      error: 'service_id, depends_on_id already exists',
    });
  });

  it('maps a foreign-key violation to 404 naming the column', () => {
    const err = pgError({
      code: '23503',
      detail: 'Key (depends_on_id)=(00000000-0000-0000-0000-000000000000) is not present in table "services".',
    });
    expect(mapDbError(err)).toEqual({ statusCode: 404, error: 'referenced depends_on_id does not exist' });
  });

  it('maps check and not-null violations to 400', () => {
    expect(mapDbError(pgError({ code: '23514', constraint: 'no_self_dependency' }))).toEqual({
      statusCode: 400,
      error: 'violates no_self_dependency',
    });
    expect(mapDbError(pgError({ code: '23502', column: 'name' }))).toEqual({
      statusCode: 400,
      error: 'name is required',
    });
  });

  it('falls back to generic messages when detail is missing', () => {
    expect(mapDbError(pgError({ code: '23505' }))?.error).toBe('resource already exists');
    expect(mapDbError(pgError({ code: '23503' }))?.error).toBe('referenced resource does not exist');
  });

  it('returns null for anything else', () => {
    expect(mapDbError(new Error('boom'))).toBeNull();
    expect(mapDbError(pgError({ code: '57P01' }))).toBeNull(); // admin shutdown
    expect(mapDbError(null)).toBeNull();
    expect(mapDbError('nope')).toBeNull();
  });
});

describe('error handler', () => {
  function appThrowing(err: unknown) {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    app.get('/x', async () => {
      throw err;
    });
    app.post('/echo', async (req) => req.body);
    return app;
  }

  it('turns a db error into its mapped status with an { error } body', async () => {
    const app = appThrowing(pgError({ code: '23505', detail: 'Key (key)=(web) already exists.' }));
    const res = await app.inject({ method: 'GET', url: '/x' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'key already exists' });
    await app.close();
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const app = appThrowing(new Error('connection string has password=hunter2'));
    const res = await app.inject({ method: 'GET', url: '/x' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal server error' });
    await app.close();
  });

  it('keeps Fastify client errors such as malformed JSON as 4xx', async () => {
    const app = appThrowing(new Error('unused'));
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error');
    await app.close();
  });
});

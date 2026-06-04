import { describe, it, expect } from 'vitest';
import { build } from '../src/server.js';

describe('health', () => {
  it('GET /health returns ok', async () => {
    const app = build();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});

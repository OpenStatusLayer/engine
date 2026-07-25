// DB-gated integration: spins up a local HTTP server, points a service at it,
// runs one check pass, and asserts a persisted check_result. Self-contained
// (localhost only) so it needs no external network. Runs when RUN_DB_TESTS=1.
import { describe, it, expect, afterAll } from 'vitest';
import http from 'node:http';
import { createSystem } from '../src/repos/systems.js';
import { createService } from '../src/repos/services.js';
import { runChecksOnce } from '../src/checks/runner.js';
import { latestCheckResult } from '../src/repos/checkResults.js';
import { pool } from '../src/db/index.js';

const runDb = process.env.RUN_DB_TESTS === '1';

describe.runIf(runDb)('check worker', () => {
  const servers: http.Server[] = [];

  afterAll(async () => {
    for (const s of servers) s.close();
    await pool.end();
  });

  function startServer(handler: http.RequestListener): Promise<number> {
    return new Promise((resolve) => {
      const server = http.createServer(handler);
      servers.push(server);
      server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port));
    });
  }

  it('records operational for a healthy HTTP service and down for a 500', async () => {
    const okPort = await startServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    });
    const badPort = await startServer((_req, res) => {
      res.writeHead(500);
      res.end('boom');
    });

    const sys = await createSystem({ key: `checks-${Date.now()}`, name: 'Checks Test' });
    const up = await createService({
      systemId: sys.id,
      key: `up-${Date.now()}`,
      name: 'Up',
      checkType: 'http',
      checkUrl: `http://127.0.0.1:${okPort}/`,
    });
    const down = await createService({
      systemId: sys.id,
      key: `down-${Date.now()}`,
      name: 'Down',
      checkType: 'http',
      checkUrl: `http://127.0.0.1:${badPort}/`,
    });

    const summary = await runChecksOnce();
    expect(summary.checked).toBeGreaterThanOrEqual(2);

    expect((await latestCheckResult(up.id))?.status).toBe('operational');
    expect((await latestCheckResult(down.id))?.status).toBe('down');
  });
});

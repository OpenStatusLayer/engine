import type { FastifyInstance } from 'fastify';
import { ping } from '../db/index.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness: process is up.
  app.get('/health', async () => ({ status: 'ok' }));

  // Readiness: dependencies (db) reachable.
  app.get('/ready', async (_req, reply) => {
    try {
      const ok = await ping();
      return ok ? { status: 'ready' } : reply.code(503).send({ status: 'degraded' });
    } catch {
      return reply.code(503).send({ status: 'down' });
    }
  });
}

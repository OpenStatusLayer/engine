import type { FastifyInstance } from 'fastify';
import { listSystems, createSystem } from '../repos/systems.js';

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/systems', async () => listSystems());

  app.post('/systems', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.key !== 'string' || typeof body.name !== 'string') {
      return reply.code(400).send({ error: 'key and name are required' });
    }
    const created = await createSystem({
      key: body.key,
      name: body.name,
      description: typeof body.description === 'string' ? body.description : undefined,
      isPublic: typeof body.isPublic === 'boolean' ? body.isPublic : undefined,
    });
    return reply.code(201).send(created);
  });
}

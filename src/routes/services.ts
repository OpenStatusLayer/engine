import type { FastifyInstance } from 'fastify';
import { listServices, getService, createService, type CheckType } from '../repos/services.js';

const CHECK_TYPES: CheckType[] = ['http', 'tcp', 'push'];

export async function serviceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/services', async (req) => {
    const { systemId } = req.query as { systemId?: string };
    return listServices(systemId);
  });

  app.get('/services/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const service = await getService(id);
    if (!service) return reply.code(404).send({ error: 'not found' });
    return service;
  });

  app.post('/services', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.key !== 'string' || typeof body.name !== 'string') {
      return reply.code(400).send({ error: 'key and name are required' });
    }
    const checkType =
      typeof body.checkType === 'string' && CHECK_TYPES.includes(body.checkType as CheckType)
        ? (body.checkType as CheckType)
        : undefined;
    const created = await createService({
      systemId: typeof body.systemId === 'string' ? body.systemId : undefined,
      key: body.key,
      name: body.name,
      description: typeof body.description === 'string' ? body.description : undefined,
      checkUrl: typeof body.checkUrl === 'string' ? body.checkUrl : undefined,
      checkType,
    });
    return reply.code(201).send(created);
  });
}

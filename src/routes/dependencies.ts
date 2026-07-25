import type { FastifyInstance } from 'fastify';
import { listDependencies, createDependency, type DependencyKind } from '../repos/dependencies.js';

export async function dependencyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/dependencies', async () => listDependencies());

  app.post('/dependencies', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.serviceId !== 'string' || typeof body.dependsOnId !== 'string') {
      return reply.code(400).send({ error: 'serviceId and dependsOnId are required' });
    }
    if (body.serviceId === body.dependsOnId) {
      return reply.code(400).send({ error: 'a service cannot depend on itself' });
    }
    const kind: DependencyKind | undefined = body.kind === 'soft' ? 'soft' : body.kind === 'hard' ? 'hard' : undefined;
    const created = await createDependency({
      serviceId: body.serviceId,
      dependsOnId: body.dependsOnId,
      kind,
    });
    return reply.code(201).send(created);
  });
}

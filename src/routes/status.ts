import type { FastifyInstance } from 'fastify';
import { listServices, getServiceByKey } from '../repos/services.js';
import { listDependencies } from '../repos/dependencies.js';
import { insertCheckResult, latestStatuses } from '../repos/checkResults.js';
import { computeStatus } from '../status/propagate.js';
import type { Status } from '../checks/classify.js';

const STATUSES: Status[] = ['operational', 'degraded', 'down'];

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  // Propagation always runs over the whole graph, because a system's services
  // can depend on services in other systems. ?systemId only filters the output.
  app.get('/status', async (req) => {
    const { systemId } = req.query as { systemId?: string };
    const [services, edges, direct, inSystem] = await Promise.all([
      listServices(),
      listDependencies(),
      latestStatuses(),
      systemId ? listServices(systemId) : Promise.resolve(null),
    ]);

    let results = computeStatus(services, edges, direct);
    let shownEdges = edges;
    if (inSystem) {
      const ids = new Set(inSystem.map((s) => s.id));
      results = results.filter((r) => ids.has(r.serviceId));
      shownEdges = edges.filter((e) => ids.has(e.serviceId) || ids.has(e.dependsOnId));
    }

    return {
      computedAt: new Date().toISOString(),
      services: results,
      edges: shownEdges,
    };
  });

  // Push-based signal for a service (e.g. a webhook from an existing monitor).
  app.post('/ingest', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.serviceKey !== 'string' || !STATUSES.includes(body.status as Status)) {
      return reply
        .code(400)
        .send({ error: 'serviceKey and status (operational | degraded | down) are required' });
    }
    if (body.latencyMs !== undefined && !Number.isInteger(body.latencyMs)) {
      return reply.code(400).send({ error: 'latencyMs must be an integer' });
    }
    if (body.detail !== undefined && (typeof body.detail !== 'object' || body.detail === null || Array.isArray(body.detail))) {
      return reply.code(400).send({ error: 'detail must be an object' });
    }
    const service = await getServiceByKey(body.serviceKey);
    if (!service) return reply.code(404).send({ error: `unknown service ${body.serviceKey}` });

    await insertCheckResult({
      serviceId: service.id,
      source: 'push',
      status: body.status as Status,
      latencyMs: (body.latencyMs as number | undefined) ?? null,
      detail: (body.detail as Record<string, unknown> | undefined) ?? {},
    });
    return reply.code(202).send();
  });
}

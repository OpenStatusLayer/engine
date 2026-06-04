import Fastify from 'fastify';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';

export function build() {
  const app = Fastify({ logger: { level: config.logLevel } });
  app.register(healthRoutes);
  return app;
}

// Only listen when run directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = build();
  app.listen({ port: config.port, host: config.host }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}

import Fastify from 'fastify';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { systemRoutes } from './routes/systems.js';
import { serviceRoutes } from './routes/services.js';
import { dependencyRoutes } from './routes/dependencies.js';
import { registerErrorHandler } from './errors.js';

export function build() {
  const app = Fastify({ logger: { level: config.logLevel } });
  registerErrorHandler(app);
  app.register(healthRoutes);
  app.register(systemRoutes);
  app.register(serviceRoutes);
  app.register(dependencyRoutes);
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

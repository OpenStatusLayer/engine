# OpenStatusLayer — Engine

The backend of **OpenStatusLayer**: an open-source, enterprise-grade **service-status
intelligence platform**. Unlike a flat status page, OpenStatusLayer models the
**dependency graph** between services and computes **dependency-aware status** — when a
downstream dependency degrades, the engine derives the *blast radius* of impacted upstream
services.

This repo is the engine: data model, health-check workers, status-computation +
dependency-propagation logic, and the HTTP API. The UI lives in
[`OpenStatusLayer/web`](https://github.com/OpenStatusLayer/web).

## The contract

The canonical API contract is [`openapi/openstatuslayer.yaml`](openapi/openstatuslayer.yaml)
(OpenAPI 3.1). It is the source of truth for the engine↔web boundary; `web` generates its
TypeScript types directly from it. Change the API here first.

## Stack

- Node 20 + TypeScript, [Fastify](https://fastify.dev/)
- PostgreSQL (dependency graph stored as adjacency)
- Vitest for tests

## Quickstart

```bash
cp .env.example .env
docker compose up -d db        # Postgres on :5432
npm install
npm run migrate                # apply db/migrations
npm run dev                    # engine on :8080
curl localhost:8080/health
```

## License

Apache-2.0. See [LICENSE](LICENSE).

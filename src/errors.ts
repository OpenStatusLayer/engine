import type { FastifyError, FastifyInstance } from 'fastify';

export interface HttpError {
  statusCode: number;
  error: string;
}

// Postgres SQLSTATE codes we translate into client errors.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_INVALID_TEXT_REPRESENTATION = '22P02'; // e.g. malformed uuid
const PG_NOT_NULL_VIOLATION = '23502';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';

interface PgErrorLike {
  code?: unknown;
  constraint?: unknown;
  column?: unknown;
  detail?: unknown;
}

// Postgres puts the offending column(s) in detail, e.g.
//   Key (key)=(web) already exists.
//   Key (depends_on_id)=(…) is not present in table "services".
function keyColumns(detail: unknown): string | null {
  if (typeof detail !== 'string') return null;
  const m = /^Key \(([^)]+)\)=/.exec(detail);
  return m ? m[1] : null;
}

/**
 * Pure mapping from a database error to an HTTP error. Returns null for
 * anything that is not a recognised client-caused database error, which the
 * caller should treat as a 500.
 */
export function mapDbError(err: unknown): HttpError | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as PgErrorLike;
  if (typeof e.code !== 'string') return null;
  const cols = keyColumns(e.detail);

  switch (e.code) {
    case PG_INVALID_TEXT_REPRESENTATION:
      return { statusCode: 400, error: 'invalid identifier or value' };
    case PG_NOT_NULL_VIOLATION:
      return {
        statusCode: 400,
        error: typeof e.column === 'string' ? `${e.column} is required` : 'missing required field',
      };
    case PG_CHECK_VIOLATION:
      return {
        statusCode: 400,
        error: typeof e.constraint === 'string' ? `violates ${e.constraint}` : 'invalid value',
      };
    case PG_FOREIGN_KEY_VIOLATION:
      return {
        statusCode: 404,
        error: cols ? `referenced ${cols} does not exist` : 'referenced resource does not exist',
      };
    case PG_UNIQUE_VIOLATION:
      return {
        statusCode: 409,
        error: cols ? `${cols} already exists` : 'resource already exists',
      };
    default:
      return null;
  }
}

/** Installs the app-wide error handler. Response body is always `{ error }`. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const mapped = mapDbError(err);
    if (mapped) {
      req.log.info({ code: (err as PgErrorLike).code }, mapped.error);
      return reply.code(mapped.statusCode).send({ error: mapped.error });
    }
    // Fastify's own client errors (bad JSON, payload too large, …) carry a 4xx.
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'internal server error' });
  });
}

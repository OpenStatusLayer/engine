// Seeds a small but realistic demo topology so the UI and status engine have
// something to chew on. Idempotent: safe to run repeatedly (upserts by key).
import { pool } from '../src/db/index.js';

async function upsertSystem(key: string, name: string, isPublic: boolean): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO systems(key, name, is_public) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, is_public = EXCLUDED.is_public
     RETURNING id`,
    [key, name, isPublic],
  );
  return rows[0].id;
}

async function upsertService(
  systemId: string,
  key: string,
  name: string,
  checkType: string,
  checkUrl: string | null,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO services(system_id, key, name, check_type, check_url) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, system_id = EXCLUDED.system_id,
       check_type = EXCLUDED.check_type, check_url = EXCLUDED.check_url
     RETURNING id`,
    [systemId, key, name, checkType, checkUrl],
  );
  return rows[0].id;
}

async function link(serviceId: string, dependsOnId: string, kind: 'hard' | 'soft'): Promise<void> {
  await pool.query(
    `INSERT INTO dependencies(service_id, depends_on_id, kind) VALUES ($1, $2, $3)
     ON CONFLICT (service_id, depends_on_id) DO UPDATE SET kind = EXCLUDED.kind`,
    [serviceId, dependsOnId, kind],
  );
}

async function main() {
  const systemId = await upsertSystem('payments', 'Payments Platform', true);

  const web = await upsertService(systemId, 'web', 'Web', 'http', 'https://example.com');
  const api = await upsertService(systemId, 'api', 'API', 'http', 'https://example.com/api/health');
  const db = await upsertService(systemId, 'db', 'Postgres', 'tcp', null);
  const cache = await upsertService(systemId, 'cache', 'Redis', 'tcp', null);
  const auth = await upsertService(systemId, 'auth', 'Auth', 'http', 'https://example.com/auth/health');

  // Web depends on API (hard). API depends on db and auth (hard);
  // cache is a soft dependency (degrades, doesn't take API down).
  await link(web, api, 'hard');
  await link(api, db, 'hard');
  await link(api, auth, 'hard');
  await link(api, cache, 'soft');

  console.log('seeded demo topology: payments (web -> api -> {db, auth, cache})');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

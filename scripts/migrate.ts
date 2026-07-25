// Minimal forward-only migration runner: applies db/migrations/*.sql in order.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { config } from '../src/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'db', 'migrations');

async function main() {
  const client = new pg.Client({ connectionString: config.databaseUrl });
  await client.connect();
  await client.query(
    'CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
  );
  const applied = new Set(
    (await client.query('SELECT name FROM _migrations')).rows.map((r) => r.name)
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    process.stdout.write(`applying ${file}... `);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO _migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log('ok');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }
  await client.end();
  console.log('migrations up to date');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

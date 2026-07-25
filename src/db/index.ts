import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export async function ping(): Promise<boolean> {
  const res = await pool.query('SELECT 1 AS ok');
  return res.rows[0]?.ok === 1;
}

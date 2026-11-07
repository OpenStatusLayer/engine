import { pool } from '../db/index.js';

export interface System {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isPublic: boolean;
}

interface SystemRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_public: boolean;
}

function map(r: SystemRow): System {
  return { id: r.id, key: r.key, name: r.name, description: r.description, isPublic: r.is_public };
}

export async function listSystems(): Promise<System[]> {
  const { rows } = await pool.query<SystemRow>('SELECT * FROM systems ORDER BY created_at');
  return rows.map(map);
}

export async function createSystem(input: {
  key: string;
  name: string;
  description?: string;
  isPublic?: boolean;
}): Promise<System> {
  const { rows } = await pool.query<SystemRow>(
    'INSERT INTO systems(key, name, description, is_public) VALUES ($1, $2, $3, $4) RETURNING *',
    [input.key, input.name, input.description ?? null, input.isPublic ?? false],
  );
  return map(rows[0]);
}

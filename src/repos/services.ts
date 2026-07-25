import { pool } from '../db/index.js';

export type CheckType = 'http' | 'tcp' | 'push';

export interface Service {
  id: string;
  systemId: string | null;
  key: string;
  name: string;
  description: string | null;
  checkUrl: string | null;
  checkType: CheckType;
}

interface ServiceRow {
  id: string;
  system_id: string | null;
  key: string;
  name: string;
  description: string | null;
  check_url: string | null;
  check_type: CheckType;
}

function map(r: ServiceRow): Service {
  return {
    id: r.id,
    systemId: r.system_id,
    key: r.key,
    name: r.name,
    description: r.description,
    checkUrl: r.check_url,
    checkType: r.check_type,
  };
}

export async function listServices(systemId?: string): Promise<Service[]> {
  const { rows } = systemId
    ? await pool.query<ServiceRow>('SELECT * FROM services WHERE system_id = $1 ORDER BY created_at', [systemId])
    : await pool.query<ServiceRow>('SELECT * FROM services ORDER BY created_at');
  return rows.map(map);
}

export async function getService(id: string): Promise<Service | null> {
  const { rows } = await pool.query<ServiceRow>('SELECT * FROM services WHERE id = $1', [id]);
  return rows[0] ? map(rows[0]) : null;
}

export async function createService(input: {
  systemId?: string;
  key: string;
  name: string;
  description?: string;
  checkUrl?: string;
  checkType?: CheckType;
}): Promise<Service> {
  const { rows } = await pool.query<ServiceRow>(
    `INSERT INTO services(system_id, key, name, description, check_url, check_type)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      input.systemId ?? null,
      input.key,
      input.name,
      input.description ?? null,
      input.checkUrl ?? null,
      input.checkType ?? 'http',
    ],
  );
  return map(rows[0]);
}

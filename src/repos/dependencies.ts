import { pool } from '../db/index.js';

export type DependencyKind = 'hard' | 'soft';

export interface Dependency {
  id: string;
  serviceId: string;
  dependsOnId: string;
  kind: DependencyKind;
}

interface DependencyRow {
  id: string;
  service_id: string;
  depends_on_id: string;
  kind: DependencyKind;
}

function map(r: DependencyRow): Dependency {
  return { id: r.id, serviceId: r.service_id, dependsOnId: r.depends_on_id, kind: r.kind };
}

export async function listDependencies(): Promise<Dependency[]> {
  const { rows } = await pool.query<DependencyRow>('SELECT * FROM dependencies ORDER BY created_at');
  return rows.map(map);
}

export async function createDependency(input: {
  serviceId: string;
  dependsOnId: string;
  kind?: DependencyKind;
}): Promise<Dependency> {
  const { rows } = await pool.query<DependencyRow>(
    'INSERT INTO dependencies(service_id, depends_on_id, kind) VALUES ($1, $2, $3) RETURNING *',
    [input.serviceId, input.dependsOnId, input.kind ?? 'hard'],
  );
  return map(rows[0]);
}

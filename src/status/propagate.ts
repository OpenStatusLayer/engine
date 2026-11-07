// Pure dependency-aware status computation — no I/O, fully unit-testable.
//
// Rules (per dependency edge, using the dependency's *derived* status):
//   hard dependency down      -> dependent is down
//   hard dependency degraded  -> dependent is degraded
//   soft dependency down      -> dependent is degraded
//   soft dependency degraded  -> dependent is degraded
// A service's derived status is the worst of its own (direct) status and
// everything its dependencies push onto it. Propagation is transitive.
//
// The graph may contain cycles (the schema only forbids self-edges), so this is
// computed as a least fixed point: start every service at its direct status and
// only ever worsen. With three ordered states that converges in at most
// 2 * |services| passes, and a healthy cycle stays healthy.
import type { Status } from '../checks/classify.js';

export type DependencyKind = 'hard' | 'soft';

export interface GraphService {
  id: string;
  name: string;
}

export interface GraphEdge {
  serviceId: string; // the dependent
  dependsOnId: string; // what it depends on
  kind: DependencyKind;
}

export interface ServiceStatusResult {
  serviceId: string;
  directStatus: Status;
  derivedStatus: Status;
  reason: string | null;
  blastRadius: string[];
}

const RANK: Record<Status, number> = { operational: 0, degraded: 1, down: 2 };

export function worst(a: Status, b: Status): Status {
  return RANK[a] >= RANK[b] ? a : b;
}

/** What a dependency in `depStatus` imposes on its dependent over a `kind` edge. */
export function impact(kind: DependencyKind, depStatus: Status): Status {
  if (depStatus === 'operational') return 'operational';
  if (kind === 'soft') return 'degraded';
  return depStatus;
}

/** Edges grouped by dependent, ignoring edges to unknown services. */
function outgoing(services: GraphService[], edges: GraphEdge[]): Map<string, GraphEdge[]> {
  const known = new Set(services.map((s) => s.id));
  const out = new Map<string, GraphEdge[]>();
  for (const s of services) out.set(s.id, []);
  for (const e of edges) {
    if (!known.has(e.serviceId) || !known.has(e.dependsOnId) || e.serviceId === e.dependsOnId) continue;
    out.get(e.serviceId)!.push(e);
  }
  return out;
}

/** Least fixed point of the propagation rules from the given seed statuses. */
function fixedPoint(
  ids: string[],
  out: Map<string, GraphEdge[]>,
  seed: (id: string) => Status,
): Map<string, Status> {
  const derived = new Map<string, Status>();
  for (const id of ids) derived.set(id, seed(id));

  for (let pass = 0, changed = true; changed && pass <= 2 * ids.length; pass += 1) {
    changed = false;
    for (const id of ids) {
      let next = derived.get(id)!;
      for (const e of out.get(id)!) next = worst(next, impact(e.kind, derived.get(e.dependsOnId)!));
      if (next !== derived.get(id)) {
        derived.set(id, next);
        changed = true;
      }
    }
  }
  return derived;
}

/**
 * Computes direct status, derived status, a human-readable reason, and the
 * blast radius for every service.
 *
 * `direct` holds each service's own latest status; services missing from it
 * are treated as operational.
 *
 * Blast radius of an unhealthy service X = the other services that would be
 * impaired if X were in its current (derived) state and everything else were
 * healthy — i.e. what X alone takes out. Empty for healthy services.
 */
export function computeStatus(
  services: GraphService[],
  edges: GraphEdge[],
  direct: Map<string, Status>,
): ServiceStatusResult[] {
  const ids = services.map((s) => s.id);
  const names = new Map(services.map((s) => [s.id, s.name]));
  const out = outgoing(services, edges);
  const directOf = (id: string): Status => direct.get(id) ?? 'operational';

  const derived = fixedPoint(ids, out, directOf);

  return services.map((svc) => {
    const own = directOf(svc.id);
    const status = derived.get(svc.id)!;

    let blastRadius: string[] = [];
    if (status !== 'operational') {
      const isolated = fixedPoint(ids, out, (id) => (id === svc.id ? status : 'operational'));
      blastRadius = ids.filter((id) => id !== svc.id && isolated.get(id) !== 'operational');
    }

    return {
      serviceId: svc.id,
      directStatus: own,
      derivedStatus: status,
      reason: explain(own, status, out.get(svc.id)!, derived, names),
      blastRadius,
    };
  });
}

function explain(
  own: Status,
  status: Status,
  deps: GraphEdge[],
  derived: Map<string, Status>,
  names: Map<string, string>,
): string | null {
  if (status === 'operational') return null;
  const parts: string[] = [];
  if (own !== 'operational') parts.push(`own check is ${own}`);
  for (const e of deps) {
    const depStatus = derived.get(e.dependsOnId)!;
    if (impact(e.kind, depStatus) === 'operational') continue;
    parts.push(`${e.kind} dependency ${names.get(e.dependsOnId)} is ${depStatus}`);
  }
  return parts.join('; ');
}

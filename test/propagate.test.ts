import { describe, it, expect } from 'vitest';
import { computeStatus, impact, type GraphEdge, type GraphService } from '../src/status/propagate.js';
import type { Status } from '../src/checks/classify.js';

// The demo topology from scripts/seed.ts:
//   web -hard-> api -hard-> db
//                   -hard-> auth
//                   -soft-> cache
const services: GraphService[] = ['web', 'api', 'db', 'auth', 'cache'].map((id) => ({
  id,
  name: id.toUpperCase(),
}));
const edges: GraphEdge[] = [
  { serviceId: 'web', dependsOnId: 'api', kind: 'hard' },
  { serviceId: 'api', dependsOnId: 'db', kind: 'hard' },
  { serviceId: 'api', dependsOnId: 'auth', kind: 'hard' },
  { serviceId: 'api', dependsOnId: 'cache', kind: 'soft' },
];

function run(direct: Record<string, Status>, svcs = services, es = edges) {
  const results = computeStatus(svcs, es, new Map(Object.entries(direct)));
  return Object.fromEntries(results.map((r) => [r.serviceId, r]));
}

describe('impact', () => {
  it('passes hard-dependency status through and caps soft at degraded', () => {
    expect(impact('hard', 'down')).toBe('down');
    expect(impact('hard', 'degraded')).toBe('degraded');
    expect(impact('soft', 'down')).toBe('degraded');
    expect(impact('soft', 'degraded')).toBe('degraded');
    expect(impact('hard', 'operational')).toBe('operational');
    expect(impact('soft', 'operational')).toBe('operational');
  });
});

describe('computeStatus', () => {
  it('everything healthy: all operational, no reasons, no blast radius', () => {
    const r = run({});
    for (const s of Object.values(r)) {
      expect(s.directStatus).toBe('operational');
      expect(s.derivedStatus).toBe('operational');
      expect(s.reason).toBeNull();
      expect(s.blastRadius).toEqual([]);
    }
  });

  it('a hard dependency going down takes out everything upstream of it', () => {
    const r = run({ db: 'down' });
    expect(r.db.derivedStatus).toBe('down');
    expect(r.api.directStatus).toBe('operational');
    expect(r.api.derivedStatus).toBe('down');
    expect(r.web.derivedStatus).toBe('down');
    expect(r.auth.derivedStatus).toBe('operational');
    expect(r.cache.derivedStatus).toBe('operational');
  });

  it('reports the blast radius of the failing service and of what it impairs', () => {
    const r = run({ db: 'down' });
    expect(r.db.blastRadius.sort()).toEqual(['api', 'web']);
    expect(r.api.blastRadius).toEqual(['web']);
    expect(r.web.blastRadius).toEqual([]);
    expect(r.auth.blastRadius).toEqual([]);
  });

  it('a soft dependency going down only degrades, and that carries upstream', () => {
    const r = run({ cache: 'down' });
    expect(r.cache.derivedStatus).toBe('down');
    expect(r.api.derivedStatus).toBe('degraded');
    expect(r.web.derivedStatus).toBe('degraded');
    expect(r.cache.blastRadius.sort()).toEqual(['api', 'web']);
  });

  it('a degraded hard dependency degrades, not downs', () => {
    const r = run({ auth: 'degraded' });
    expect(r.api.derivedStatus).toBe('degraded');
    expect(r.web.derivedStatus).toBe('degraded');
  });

  it('takes the worst of own status and dependency impact', () => {
    const r = run({ api: 'degraded', db: 'down' });
    expect(r.api.directStatus).toBe('degraded');
    expect(r.api.derivedStatus).toBe('down');
    // An own failure is never hidden by healthy dependencies.
    const r2 = run({ web: 'down' });
    expect(r2.web.derivedStatus).toBe('down');
    expect(r2.api.derivedStatus).toBe('operational');
    expect(r2.web.blastRadius).toEqual([]);
  });

  it('explains why a service is impaired', () => {
    const r = run({ api: 'degraded', db: 'down', cache: 'degraded' });
    expect(r.api.reason).toBe(
      'own check is degraded; hard dependency DB is down; soft dependency CACHE is degraded',
    );
    expect(r.web.reason).toBe('hard dependency API is down');
    expect(r.db.reason).toBe('own check is down');
    expect(r.auth.reason).toBeNull();
  });

  it('blast radius is what a service takes out on its own, not overlapping failures', () => {
    // auth is degraded and db is down; api ends up down because of db.
    const r = run({ auth: 'degraded', db: 'down' });
    expect(r.auth.blastRadius.sort()).toEqual(['api', 'web']);
    expect(r.db.blastRadius.sort()).toEqual(['api', 'web']);
  });

  it('handles cycles: a healthy cycle stays healthy, a failure spreads around it', () => {
    const svcs: GraphService[] = ['a', 'b', 'c'].map((id) => ({ id, name: id }));
    const cycle: GraphEdge[] = [
      { serviceId: 'a', dependsOnId: 'b', kind: 'hard' },
      { serviceId: 'b', dependsOnId: 'c', kind: 'hard' },
      { serviceId: 'c', dependsOnId: 'a', kind: 'hard' },
    ];
    const healthy = run({}, svcs, cycle);
    expect(Object.values(healthy).map((s) => s.derivedStatus)).toEqual([
      'operational',
      'operational',
      'operational',
    ]);
    const broken = run({ c: 'down' }, svcs, cycle);
    expect(Object.values(broken).map((s) => s.derivedStatus)).toEqual(['down', 'down', 'down']);
    expect(broken.c.blastRadius.sort()).toEqual(['a', 'b']);
  });

  it('ignores edges to unknown services and self-edges', () => {
    const r = run({ db: 'down' }, services, [
      ...edges,
      { serviceId: 'web', dependsOnId: 'ghost', kind: 'hard' },
      { serviceId: 'auth', dependsOnId: 'auth', kind: 'hard' },
    ]);
    expect(r.web.derivedStatus).toBe('down');
    expect(r.auth.derivedStatus).toBe('operational');
  });

  it('handles a diamond without double counting', () => {
    //   top -> left -> base, top -> right(soft) -> base
    const svcs: GraphService[] = ['top', 'left', 'right', 'base'].map((id) => ({ id, name: id }));
    const es: GraphEdge[] = [
      { serviceId: 'top', dependsOnId: 'left', kind: 'hard' },
      { serviceId: 'top', dependsOnId: 'right', kind: 'soft' },
      { serviceId: 'left', dependsOnId: 'base', kind: 'hard' },
      { serviceId: 'right', dependsOnId: 'base', kind: 'hard' },
    ];
    const r = run({ base: 'down' }, svcs, es);
    expect(r.top.derivedStatus).toBe('down');
    expect(r.base.blastRadius.sort()).toEqual(['left', 'right', 'top']);
  });
});

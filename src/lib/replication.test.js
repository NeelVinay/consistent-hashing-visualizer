import { describe, it, expect } from 'vitest';
import { buildRing, assignReplicas, lookupReplicas, assignConsistent } from './ring.js';
import { assignNaiveReplicas } from './naive.js';
import { countStoredPerServer, diffReplicaSets, copiesGainedBy, keysWithoutSurvivingCopy } from './simulation.js';
import { makeKeys } from './keys.js';

const servers = (n) => Array.from({ length: n }, (_, i) => `server-${i + 1}`);
const keys = makeKeys(1000);

describe('lookupReplicas', () => {
  it('returns distinct physical servers, never the same one twice', () => {
    // 150 vnodes each means the walk hits the same server repeatedly; it has to
    // skip past those, or "3 copies" would mean 3 copies on one machine.
    const points = buildRing(servers(4), 150);
    for (const key of makeKeys(500)) {
      const replicas = lookupReplicas(points, Math.abs(key.length * 7919) % 4294967296, 3);
      expect(new Set(replicas).size).toBe(replicas.length);
    }
  });

  it('puts the primary owner first', () => {
    const points = buildRing(servers(4), 150);
    const primaries = assignConsistent(keys, points);
    const replicated = assignReplicas(keys, points, 3);
    for (const key of keys) {
      expect(replicated.get(key)[0]).toBe(primaries.get(key));
    }
  });

  it('caps at the number of servers that exist', () => {
    const points = buildRing(servers(2), 50);
    for (const replicas of assignReplicas(keys, points, 5).values()) {
      expect(replicas).toHaveLength(2);
    }
  });

  it('collapses to plain assignment at replication factor 1', () => {
    const points = buildRing(servers(4), 150);
    const plain = assignConsistent(keys, points);
    for (const [key, replicas] of assignReplicas(keys, points, 1)) {
      expect(replicas).toEqual([plain.get(key)]);
    }
  });
});

describe('countStoredPerServer', () => {
  it('counts every copy, so the cluster total is keys x replication factor', () => {
    const ids = servers(4);
    const counts = countStoredPerServer(assignReplicas(keys, buildRing(ids, 150), 3), ids);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(keys.length * 3);
  });

  it('still spreads evenly across servers', () => {
    const ids = servers(4);
    const counts = countStoredPerServer(assignReplicas(keys, buildRing(ids, 150), 3), ids);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(600); // even share is 750
      expect(count).toBeLessThan(900);
    }
  });
});

describe('diffReplicaSets', () => {
  it('matches the unreplicated numbers at replication factor 1', () => {
    const before = assignReplicas(keys, buildRing(servers(3), 150), 1);
    const after = assignReplicas(keys, buildRing(['server-1', 'server-2'], 150), 1);
    const d = diffReplicaSets(before, after);
    // With one copy, "routed somewhere new" and "needs a new copy" are the same
    // event, so the two figures must agree exactly.
    expect(d.newCopies).toBe(d.changedCount);
    expect(d.primaryChangedCount).toBe(d.changedCount);
  });

  it('reroutes far fewer keys than it re-copies', () => {
    // Two different costs, and they are not the same size. A key needs a new
    // copy if the dead server held ANY of its replicas; it needs rerouting only
    // if the dead server was its PRIMARY. With 6 servers at RF=3 the first is
    // about half the keys and the second about a sixth.
    const before = assignReplicas(keys, buildRing(servers(6), 150), 3);
    const after = assignReplicas(keys, buildRing(servers(5), 150), 3);
    const d = diffReplicaSets(before, after);
    expect(d.primaryChangedCount).toBeGreaterThan(0);
    expect(d.primaryChangedCount).toBeLessThan(d.changedCount / 2);
  });

  it('promotes a server that already held the data -- never a cold one', () => {
    // This is the property that makes replicated failover instant. When the
    // primary dies, the ring walk lands on whoever was next in line, and that
    // server was already replica 2. No fetch, no downtime, just a promotion.
    const before = assignReplicas(keys, buildRing(servers(6), 150), 3);
    const after = assignReplicas(keys, buildRing(servers(5), 150), 3);
    let promotions = 0;
    for (const key of keys) {
      const was = before.get(key);
      const now = after.get(key);
      if (now[0] === was[0]) continue;
      expect(was).toContain(now[0]); // the new primary already had a copy
      promotions++;
    }
    expect(promotions).toBeGreaterThan(0);
  });

  it('loses no key entirely when a server fails at replication factor 3', () => {
    const before = assignReplicas(keys, buildRing(servers(4), 150), 3);
    const after = assignReplicas(keys, buildRing(['server-1', 'server-2', 'server-3'], 150), 3);
    for (const key of keys) {
      // every key still has a surviving holder that already had the data
      const survivors = new Set(after.get(key));
      const overlap = before.get(key).filter((s) => survivors.has(s) && s !== 'server-4');
      expect(overlap.length).toBeGreaterThan(0);
    }
  });
});

describe('copiesGainedBy', () => {
  it('spreads new copies across survivors with many virtual nodes', () => {
    const before = assignReplicas(keys, buildRing(servers(4), 150), 3);
    const after = assignReplicas(keys, buildRing(['server-1', 'server-2', 'server-3'], 150), 3);
    expect(copiesGainedBy(before, after)).toHaveLength(3);
  });

  it('reports no new copies when nothing changed', () => {
    const points = buildRing(servers(3), 100);
    const a = assignReplicas(keys, points, 2);
    expect(copiesGainedBy(a, a)).toEqual([]);
  });
});

describe('assignNaiveReplicas', () => {
  it('places distinct copies and collapses to plain modulo at factor 1', () => {
    for (const replicas of assignNaiveReplicas(keys, servers(4), 3).values()) {
      expect(new Set(replicas).size).toBe(3);
    }
    for (const replicas of assignNaiveReplicas(keys, servers(4), 1).values()) {
      expect(replicas).toHaveLength(1);
    }
  });
});

describe('keysWithoutSurvivingCopy', () => {
  const ring = (ids, vnodes = 150) => buildRing(ids, vnodes);

  it('loses every one of the dead server\'s keys at replication factor 1', () => {
    const before = assignReplicas(keys, ring(servers(4)), 1);
    const orphaned = keysWithoutSurvivingCopy(before, ['server-1', 'server-2', 'server-3']);
    // exactly the keys server-4 was primary for -- nobody else had them
    expect(orphaned.length).toBeGreaterThan(0);
    for (const key of orphaned) expect(before.get(key)).toEqual(['server-4']);
  });

  it('loses nothing at replication factor 2 or more', () => {
    for (const rf of [2, 3]) {
      const before = assignReplicas(keys, ring(servers(4)), rf);
      expect(keysWithoutSurvivingCopy(before, ['server-1', 'server-2', 'server-3'])).toEqual([]);
    }
  });

  it('survives two simultaneous failures only at replication factor 3', () => {
    const rf2 = assignReplicas(keys, ring(servers(5)), 2);
    const rf3 = assignReplicas(keys, ring(servers(5)), 3);
    const survivors = ['server-1', 'server-2', 'server-3'];
    expect(keysWithoutSurvivingCopy(rf2, survivors).length).toBeGreaterThan(0);
    expect(keysWithoutSurvivingCopy(rf3, survivors)).toEqual([]);
  });
});

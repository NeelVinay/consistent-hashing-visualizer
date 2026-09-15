import { describe, it, expect } from 'vitest';
import { buildRing, lookup, assignConsistent } from './ring.js';
import { assignNaive } from './naive.js';
import { countPerServer, diffAssignments } from './simulation.js';
import { fnv1a, RING_SIZE } from './hash.js';
import { makeKeys } from './keys.js';

const servers = (n) => Array.from({ length: n }, (_, i) => `server-${i + 1}`);

/** Which servers absorbed the moved keys, and how many each took. */
function absorbedBy(movedKeys, after) {
  const counts = new Map();
  for (const key of movedKeys) {
    const owner = after.get(key);
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return counts;
}

describe('buildRing', () => {
  it('creates one point per virtual node per server', () => {
    expect(buildRing(servers(3), 150)).toHaveLength(450);
    expect(buildRing(servers(3), 1)).toHaveLength(3);
  });

  it('returns points sorted by position', () => {
    const points = buildRing(servers(4), 100);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].position).toBeGreaterThanOrEqual(points[i - 1].position);
    }
  });

  it('keeps every point inside the ring space and owned by a real server', () => {
    const ids = servers(4);
    for (const point of buildRing(ids, 50)) {
      expect(point.position).toBeGreaterThanOrEqual(0);
      expect(point.position).toBeLessThan(RING_SIZE);
      expect(ids).toContain(point.serverId);
    }
  });

  it('is deterministic -- rebuilding gives identical placement', () => {
    expect(buildRing(servers(3), 100)).toEqual(buildRing(servers(3), 100));
  });

  it('places a server identically regardless of the order servers were added', () => {
    // Unlike naive modulo, ring position depends only on the server's own name.
    const forwards = buildRing(['server-1', 'server-2', 'server-3'], 50);
    const backwards = buildRing(['server-3', 'server-2', 'server-1'], 50);
    expect(forwards).toEqual(backwards);
  });
});

describe('lookup', () => {
  it('returns the point at the exact position when one sits there', () => {
    const points = buildRing(servers(3), 10);
    const target = points[5];
    expect(lookup(points, target.position).label).toBe(target.label);
  });

  it('returns the next point clockwise', () => {
    const points = buildRing(servers(3), 10);
    const found = lookup(points, points[3].position + 1);
    expect(found.label).toBe(points[4].label);
  });

  // PRD Section 5, Test 5.
  it('wraps a position past the highest point back to the first', () => {
    const points = buildRing(servers(4), 20);
    const highest = points[points.length - 1].position;
    expect(lookup(points, highest + 1).label).toBe(points[0].label);
    expect(lookup(points, RING_SIZE - 1).label).toBe(points[0].label);
  });

  it('assigns every key, including ones past the last point', () => {
    const points = buildRing(servers(4), 150);
    for (const key of makeKeys(2000)) {
      expect(lookup(points, fnv1a(key))).not.toBeNull();
    }
  });

  it('returns null for an empty ring rather than throwing', () => {
    expect(lookup([], 12345)).toBeNull();
  });
});

describe('assignConsistent', () => {
  it('assigns every key to a real server', () => {
    const ids = servers(4);
    const assignment = assignConsistent(makeKeys(1000), buildRing(ids, 150));
    expect(assignment.size).toBe(1000);
    for (const serverId of assignment.values()) expect(ids).toContain(serverId);
  });

  it('balances load across servers when virtual nodes are plentiful', () => {
    const ids = servers(4);
    const counts = countPerServer(assignConsistent(makeKeys(2000), buildRing(ids, 150)), ids);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(350); // even share is 500
      expect(count).toBeLessThan(650);
    }
  });
});

// PRD Section 5, Test 2 -- and specifically its mechanism check, not just the
// aggregate percentage.
describe('adding a server (consistent hashing)', () => {
  const keys = makeKeys(1000);
  const before = assignConsistent(keys, buildRing(servers(4), 150));
  const after = assignConsistent(keys, buildRing(servers(5), 150));
  const { movedKeys, movedPct } = diffAssignments(before, after);

  it('moves only a small slice of keys', () => {
    // Fair share for the newcomer is 1/5 = 20%.
    expect(movedPct).toBeGreaterThan(5);
    expect(movedPct).toBeLessThan(35);
  });

  it('moves keys ONLY onto the new server -- never between two existing ones', () => {
    // This is the mechanism. Under naive modulo, keys shuffle between servers
    // that did not change at all; here a key can only ever move to the newcomer.
    for (const key of movedKeys) expect(after.get(key)).toBe('server-5');
  });

  it('moves exactly the keys now claimed by the new server, no more and no less', () => {
    const claimed = keys.filter((key) => after.get(key) === 'server-5');
    expect(new Set(movedKeys)).toEqual(new Set(claimed));
  });

  it('leaves every other key exactly where it was', () => {
    for (const key of keys) {
      if (after.get(key) !== 'server-5') expect(after.get(key)).toBe(before.get(key));
    }
  });

  // The headline comparison: same scenario, both strategies.
  it('moves far fewer keys than naive modulo does', () => {
    const naive = diffAssignments(
      assignNaive(keys, servers(4)),
      assignNaive(keys, servers(5)),
    );
    expect(naive.movedPct).toBeGreaterThan(70);
    expect(movedPct).toBeLessThan(naive.movedPct / 2);
  });
});

describe('removing a server (consistent hashing)', () => {
  const keys = makeKeys(1000);

  it('moves only the dead server\'s keys, and leaves all others untouched', () => {
    const before = assignConsistent(keys, buildRing(servers(3), 150));
    const after = assignConsistent(keys, buildRing(['server-1', 'server-2'], 150));
    for (const key of diffAssignments(before, after).movedKeys) {
      expect(before.get(key)).toBe('server-3');
    }
  });

  // PRD Section 5, Test 3: the single-point failure problem.
  it('dumps the entire load onto exactly ONE neighbour with 1 virtual node', () => {
    const before = assignConsistent(keys, buildRing(servers(3), 1));
    const after = assignConsistent(keys, buildRing(['server-1', 'server-2'], 1));
    const { movedKeys } = diffAssignments(before, after);
    const absorbed = absorbedBy(movedKeys, after);

    expect(movedKeys.length).toBeGreaterThan(0);
    expect(absorbed.size).toBe(1); // not split -- one neighbour takes all of it
    expect([...absorbed.values()][0]).toBe(movedKeys.length);
  });

  // PRD Section 5, Test 4: the virtual-nodes fix.
  it('splits the load across ALL remaining servers with many virtual nodes', () => {
    const before = assignConsistent(keys, buildRing(servers(3), 150));
    const after = assignConsistent(keys, buildRing(['server-1', 'server-2'], 150));
    const { movedKeys } = diffAssignments(before, after);
    const absorbed = absorbedBy(movedKeys, after);

    expect(absorbed.size).toBe(2); // every survivor takes a share
    const largestShare = Math.max(...absorbed.values()) / movedKeys.length;
    expect(largestShare).toBeLessThan(0.7); // roughly even, not exactly
  });

  // The other half of the virtual-node argument, easy to overlook: vnodes fix
  // the imbalance that exists before anything fails at all.
  it('also fixes the imbalance present before any failure', () => {
    const ids = servers(3);
    const spread = (vnodeCount) => {
      const counts = [...countPerServer(assignConsistent(keys, buildRing(ids, vnodeCount)), ids).values()];
      return Math.max(...counts) / Math.min(...counts);
    };
    expect(spread(1)).toBeGreaterThan(3); // wildly lopsided
    expect(spread(150)).toBeLessThan(1.5); // near even
  });
});

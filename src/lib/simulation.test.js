import { describe, it, expect } from 'vitest';
import { absorbedBy, imbalanceRatio, countPerServer, diffAssignments } from './simulation.js';
import { buildRing, assignConsistent } from './ring.js';
import { makeKeys } from './keys.js';

const servers = (n) => Array.from({ length: n }, (_, i) => `server-${i + 1}`);

describe('absorbedBy', () => {
  it('reports shares sorted heaviest first', () => {
    const after = new Map([['a', 's1'], ['b', 's2'], ['c', 's1']]);
    expect(absorbedBy(['a', 'b', 'c'], after)).toEqual([
      { serverId: 's1', count: 2, share: 2 / 3 },
      { serverId: 's2', count: 1, share: 1 / 3 },
    ]);
  });

  it('handles nothing having moved', () => {
    expect(absorbedBy([], new Map())).toEqual([]);
  });

  it('names a single absorber when one virtual node per server fails', () => {
    const keys = makeKeys(1000);
    const before = assignConsistent(keys, buildRing(servers(3), 1));
    const after = assignConsistent(keys, buildRing(['server-1', 'server-2'], 1));
    const absorbed = absorbedBy(diffAssignments(before, after).movedKeys, after);
    expect(absorbed).toHaveLength(1);
    expect(absorbed[0].share).toBe(1);
  });
});

describe('imbalanceRatio', () => {
  it('is 1 for a perfectly even split', () => {
    expect(imbalanceRatio(new Map([['a', 10], ['b', 10]]))).toBe(1);
  });

  it('is Infinity when a server holds nothing', () => {
    expect(imbalanceRatio(new Map([['a', 10], ['b', 0]]))).toBe(Infinity);
  });

  it('exposes the imbalance that one virtual node per server creates', () => {
    const ids = servers(3);
    const keys = makeKeys(1000);
    const lopsided = imbalanceRatio(countPerServer(assignConsistent(keys, buildRing(ids, 1)), ids));
    const even = imbalanceRatio(countPerServer(assignConsistent(keys, buildRing(ids, 150)), ids));
    expect(lopsided).toBeGreaterThan(3);
    expect(even).toBeLessThan(1.5);
  });
});

import { describe, it, expect } from 'vitest';
import { assignNaive } from './naive.js';
import { countPerServer, diffAssignments } from './simulation.js';
import { makeKeys } from './keys.js';

const servers = (n) => Array.from({ length: n }, (_, i) => `server-${i + 1}`);

describe('assignNaive', () => {
  it('is deterministic', () => {
    const keys = makeKeys(200);
    expect([...assignNaive(keys, servers(4))]).toEqual([...assignNaive(keys, servers(4))]);
  });

  it('assigns every key to a real server', () => {
    const ids = servers(4);
    const assignment = assignNaive(makeKeys(500), ids);
    expect(assignment.size).toBe(500);
    for (const serverId of assignment.values()) expect(ids).toContain(serverId);
  });

  it('splits load roughly evenly', () => {
    const ids = servers(4);
    const counts = countPerServer(assignNaive(makeKeys(1000), ids), ids);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(200); // even share is 250
      expect(count).toBeLessThan(300);
    }
  });

  it('returns an empty map for zero servers instead of dividing by zero', () => {
    expect(assignNaive(makeKeys(10), []).size).toBe(0);
  });

  // PRD Section 5, Test 1: the problem this whole project exists to show.
  it('remaps nearly every key when a 5th server is added', () => {
    const keys = makeKeys(1000);
    const { movedPct } = diffAssignments(
      assignNaive(keys, servers(4)),
      assignNaive(keys, servers(5)),
    );
    expect(movedPct).toBeGreaterThan(70);
  });
});

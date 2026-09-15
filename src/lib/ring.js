import { fnv1a } from './hash.js';

/**
 * Place servers on the ring.
 *
 * Each real server gets `vnodeCount` positions, found by hashing "serverId#i".
 * Every one of those points is owned by the same real server. This is the whole
 * trick: one server owning many small scattered arcs instead of one large arc
 * means that when it disappears, its arcs fall to many different neighbours
 * rather than all to one.
 *
 * Returns points sorted by position ascending. Two names can hash to the same
 * integer, so ties break on label to keep ordering stable across rebuilds.
 */
export function buildRing(serverIds, vnodeCount) {
  const points = [];
  for (const serverId of serverIds) {
    for (let i = 0; i < vnodeCount; i++) {
      const label = `${serverId}#${i}`;
      points.push({ position: fnv1a(label), serverId, label, vnodeIndex: i });
    }
  }
  points.sort((a, b) => a.position - b.position || (a.label < b.label ? -1 : 1));
  return points;
}

/**
 * The first ring point at or clockwise of `position`.
 *
 * Binary search for the leftmost point whose position is >= the target. Falling
 * off the end means the target sits past the highest point, so it wraps to the
 * lowest one -- that single fallback is the entire wraparound rule.
 *
 * Returns the point itself (not just the server id) so callers can show which
 * virtual node claimed a key.
 */
export function lookup(points, position) {
  if (points.length === 0) return null;
  let low = 0;
  let high = points.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (points[mid].position < position) low = mid + 1;
    else high = mid;
  }
  return low === points.length ? points[0] : points[low];
}

/**
 * Consistent-hashing assignment: each key goes to the server owning the next
 * ring point clockwise. Returns Map<key, serverId>.
 */
export function assignConsistent(keys, points) {
  const assignment = new Map();
  if (points.length === 0) return assignment;
  for (const key of keys) {
    assignment.set(key, lookup(points, fnv1a(key)).serverId);
  }
  return assignment;
}

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
export function lookupIndex(points, position) {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (points[mid].position < position) low = mid + 1;
    else high = mid;
  }
  // Running off the end means the position sits past the highest point, so it
  // wraps to the lowest. That single fallback is the entire wraparound rule.
  return low === points.length ? 0 : low;
}

export function lookup(points, position) {
  if (points.length === 0) return null;
  return points[lookupIndex(points, position)];
}

/**
 * The first `replicationFactor` DISTINCT physical servers clockwise of a
 * position -- how a real Dynamo-style store picks where to keep copies.
 *
 * "Distinct" is the whole subtlety. Walking the ring hits many points belonging
 * to the same server (that is what virtual nodes are), and storing three copies
 * on one machine defends against nothing. So we keep walking past repeats.
 *
 * Asking for more replicas than there are servers yields every server, which is
 * the honest answer rather than an error: the cluster simply cannot hold more
 * copies than it has machines.
 */
export function lookupReplicas(points, position, replicationFactor) {
  if (points.length === 0) return [];
  const start = lookupIndex(points, position);
  const replicas = [];
  const seen = new Set();
  for (let step = 0; step < points.length && replicas.length < replicationFactor; step++) {
    const { serverId } = points[(start + step) % points.length];
    if (seen.has(serverId)) continue;
    seen.add(serverId);
    replicas.push(serverId);
  }
  return replicas;
}

/**
 * Consistent-hashing assignment: each key goes to the server owning the next
 * ring point clockwise. Returns Map<key, serverId> -- the primary owner only.
 */
export function assignConsistent(keys, points) {
  const assignment = new Map();
  if (points.length === 0) return assignment;
  for (const key of keys) {
    assignment.set(key, lookup(points, fnv1a(key)).serverId);
  }
  return assignment;
}

/**
 * Full replica placement: Map<key, serverId[]>, primary first.
 * At replicationFactor 1 this is assignConsistent wrapped in single-element
 * arrays, so the unreplicated behaviour is a special case of this one.
 */
export function assignReplicas(keys, points, replicationFactor = 1) {
  const assignment = new Map();
  if (points.length === 0) return assignment;
  for (const key of keys) {
    assignment.set(key, lookupReplicas(points, fnv1a(key), replicationFactor));
  }
  return assignment;
}

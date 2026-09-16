import { fnv1a } from './hash.js';

/**
 * Naive modulo assignment: hash(key) % numberOfServers.
 *
 * The result depends on the *order* of serverIds, not just its contents -- which
 * is precisely why this scheme reshuffles almost everything when the server count
 * changes. Callers keep serverIds in a stable order.
 *
 * Returns Map<key, serverId>. An empty server list yields an empty map rather
 * than dividing by zero.
 */
export function assignNaive(keys, serverIds) {
  const assignment = new Map();
  if (serverIds.length === 0) return assignment;
  for (const key of keys) {
    assignment.set(key, serverIds[fnv1a(key) % serverIds.length]);
  }
  return assignment;
}

/**
 * Naive modulo with replication: the primary is hash % N, and further copies go
 * on the next servers by index, wrapping. Same idea as the ring's "next
 * distinct server clockwise", except the ordering is the server list rather
 * than a hash space -- which is exactly why changing N ruins it.
 */
export function assignNaiveReplicas(keys, serverIds, replicationFactor = 1) {
  const assignment = new Map();
  if (serverIds.length === 0) return assignment;
  const copies = Math.min(replicationFactor, serverIds.length);
  for (const key of keys) {
    const primary = fnv1a(key) % serverIds.length;
    assignment.set(
      key,
      Array.from({ length: copies }, (_, i) => serverIds[(primary + i) % serverIds.length]),
    );
  }
  return assignment;
}

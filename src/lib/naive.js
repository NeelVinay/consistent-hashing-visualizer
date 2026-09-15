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

/** How many keys each server currently holds. Servers with no keys report 0. */
export function countPerServer(assignment, serverIds) {
  const counts = new Map(serverIds.map((id) => [id, 0]));
  for (const serverId of assignment.values()) {
    counts.set(serverId, (counts.get(serverId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Which keys changed server between two assignments. This is the headline
 * number the whole demo turns on: near 100% for naive modulo, small for
 * consistent hashing.
 */
export function diffAssignments(before, after) {
  const movedKeys = [];
  for (const [key, serverId] of before) {
    if (after.get(key) !== serverId) movedKeys.push(key);
  }
  return {
    movedKeys,
    movedCount: movedKeys.length,
    movedPct: before.size === 0 ? 0 : (movedKeys.length / before.size) * 100,
  };
}

/**
 * Which servers picked up the moved keys, and how many each took.
 *
 * This is the number the virtual-node demonstration turns on: remove a server
 * with one ring point and a single neighbour absorbs 100% of its keys; remove
 * one with many virtual nodes and every survivor takes a share.
 * Returned sorted heaviest-first.
 */
export function absorbedBy(movedKeys, after) {
  const counts = new Map();
  for (const key of movedKeys) {
    const owner = after.get(key);
    if (owner === undefined) continue;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([serverId, count]) => ({
      serverId,
      count,
      share: movedKeys.length === 0 ? 0 : count / movedKeys.length,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * How lopsided the load is: the busiest server's key count divided by the
 * quietest's. 1.0 is perfectly even. Servers holding nothing make this Infinity,
 * which is itself the honest answer.
 */
export function imbalanceRatio(counts) {
  const values = [...counts.values()];
  if (values.length === 0) return 1;
  const min = Math.min(...values);
  return min === 0 ? Infinity : Math.max(...values) / min;
}

/**
 * How many keys each server physically stores, counting every replica it holds
 * rather than only the ones it is primary for. At replication factor 3 the
 * totals across the cluster sum to 3x the key count, because that is genuinely
 * how much data exists.
 */
export function countStoredPerServer(replicaAssignment, serverIds) {
  const counts = new Map(serverIds.map((id) => [id, 0]));
  for (const replicas of replicaAssignment.values()) {
    for (const serverId of replicas) {
      counts.set(serverId, (counts.get(serverId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * What a membership change actually costs once data is replicated.
 *
 * Replication splits one number into two that behave very differently:
 *
 *   primaryChangedCount -- keys now ROUTED somewhere new. Cheap: the new owner
 *                          usually already held a copy, so this is a promotion,
 *                          not a data transfer.
 *   newCopies           -- (key, server) placements that did not exist before.
 *                          This is the only figure that costs real network.
 *
 * At replication factor 1 the two collapse into the same number, which is why
 * the unreplicated view of this app never had to distinguish them.
 */
export function diffReplicaSets(before, after) {
  const changedKeys = [];
  let newCopies = 0;
  let primaryChangedCount = 0;

  for (const [key, was] of before) {
    const now = after.get(key) ?? [];
    const wasSet = new Set(was);
    const added = now.filter((serverId) => !wasSet.has(serverId));

    newCopies += added.length;
    if (now[0] !== was[0]) primaryChangedCount++;

    const nowSet = new Set(now);
    const setChanged =
      added.length > 0 || was.some((serverId) => !nowSet.has(serverId));
    if (setChanged) changedKeys.push(key);
  }

  return {
    changedKeys,
    changedCount: changedKeys.length,
    changedPct: before.size === 0 ? 0 : (changedKeys.length / before.size) * 100,
    newCopies,
    primaryChangedCount,
  };
}

/** Which servers receive newly-placed copies, heaviest first. */
export function copiesGainedBy(before, after) {
  const counts = new Map();
  let total = 0;
  for (const [key, was] of before) {
    const wasSet = new Set(was);
    for (const serverId of after.get(key) ?? []) {
      if (wasSet.has(serverId)) continue;
      counts.set(serverId, (counts.get(serverId) ?? 0) + 1);
      total++;
    }
  }
  return [...counts.entries()]
    .map(([serverId, count]) => ({ serverId, count, share: total === 0 ? 0 : count / total }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Keys that no longer have a single surviving holder.
 *
 * Worth measuring because it exposes a euphemism. At replication factor 1,
 * "these keys moved to a new server" is not quite true -- the new server has
 * never seen them. For a cache that means a miss and a refetch; for a store it
 * means the data is gone. At replication factor 2 or more this is zero, which
 * is the entire reason real systems replicate.
 */
export function keysWithoutSurvivingCopy(before, survivingServerIds) {
  const alive = new Set(survivingServerIds);
  const orphaned = [];
  for (const [key, replicas] of before) {
    if (!replicas.some((serverId) => alive.has(serverId))) orphaned.push(key);
  }
  return orphaned;
}

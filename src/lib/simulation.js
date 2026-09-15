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

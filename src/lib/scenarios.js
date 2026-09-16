import { buildRing, assignReplicas } from './ring.js';
import { assignNaiveReplicas } from './naive.js';
import { diffReplicaSets, keysWithoutSurvivingCopy, copiesGainedBy } from './simulation.js';

const s = (n) => Array.from({ length: n }, (_, i) => `server-${i + 1}`);

/**
 * The guided argument, in order. Each scenario is a complete configuration plus
 * the one action that makes its point, so running one is a single click rather
 * than a sequence of toggles the visitor has to work out for themselves.
 */
export const SCENARIOS = [
  {
    id: 'naive',
    title: 'The naive problem',
    question: 'What does hash(key) % N cost when the cluster grows?',
    config: { mode: 'naive', vnodeCount: 150, replicationFactor: 1 },
    before: s(4),
    after: s(5),
    action: 'add',
  },
  {
    id: 'single',
    title: 'One point per server',
    question: 'The ring fixes that. So why is this still broken?',
    config: { mode: 'consistent', vnodeCount: 1, replicationFactor: 1 },
    before: s(3),
    after: s(2),
    action: 'remove',
  },
  {
    id: 'vnodes',
    title: 'The virtual nodes fix',
    question: 'Same failure, 150 points per server instead of one.',
    config: { mode: 'consistent', vnodeCount: 150, replicationFactor: 1 },
    before: s(3),
    after: s(2),
    action: 'remove',
  },
  {
    id: 'replication',
    title: 'What replication changes',
    question: 'Real systems keep 3 copies. What does that actually buy?',
    config: { mode: 'consistent', vnodeCount: 150, replicationFactor: 3 },
    // Six servers rather than four: at four, losing one leaves three holding
    // three copies each, so every survivor ends up with every key and the
    // spread has nothing left to show.
    before: s(6),
    after: s(5),
    action: 'remove',
  },
];

/** Placement for one side of a scenario. */
export function placeKeys(keys, { mode, vnodeCount, replicationFactor }, serverIds) {
  return mode === 'consistent'
    ? assignReplicas(keys, buildRing(serverIds, vnodeCount), replicationFactor)
    : assignNaiveReplicas(keys, serverIds, replicationFactor);
}

/**
 * The headline each scenario card advertises, computed rather than written down
 * so a card can never promise a number the simulation no longer produces.
 */
export function scenarioOutcome(scenario, keys) {
  const before = placeKeys(keys, scenario.config, scenario.before);
  const after = placeKeys(keys, scenario.config, scenario.after);
  const diff = diffReplicaSets(before, after);
  const pct = (n) => `${((n / keys.length) * 100).toFixed(0)}%`;

  if (scenario.id === 'naive') return `${pct(diff.changedCount)} of keys move`;
  if (scenario.id === 'replication') {
    const lost = keysWithoutSurvivingCopy(before, scenario.after).length;
    return `${lost} keys lost, ${diff.newCopies} copies to remake`;
  }

  const gained = copiesGainedBy(before, after);
  const heaviest = gained.length ? `${(gained[0].share * 100).toFixed(0)}%` : '0%';
  return gained.length === 1
    ? `${pct(diff.changedCount)} move, all onto one server`
    : `${pct(diff.changedCount)} move, ${heaviest} largest share`;
}

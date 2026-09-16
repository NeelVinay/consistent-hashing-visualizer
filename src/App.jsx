import { useMemo, useRef, useState } from 'react';
import RingScope from './components/RingScope.jsx';
import Scenarios from './components/Scenarios.jsx';
import Controls from './components/Controls.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import Explainer from './components/Explainer.jsx';
import { buildRing } from './lib/ring.js';
import {
  countStoredPerServer, diffReplicaSets, copiesGainedBy,
  keysWithoutSurvivingCopy, imbalanceRatio,
} from './lib/simulation.js';
import { SCENARIOS, placeKeys, scenarioOutcome } from './lib/scenarios.js';
import { fnv1a } from './lib/hash.js';
import { makeKeys } from './lib/keys.js';

const KEY_COUNT = 500;
const KEYS = makeKeys(KEY_COUNT);
// Key positions never change -- only the servers under them do.
const KEY_POSITIONS = new Map(KEYS.map((key) => [key, fnv1a(key)]));

// Scenario headlines are deterministic, so compute them once rather than
// hard-coding numbers that could drift away from what the simulation does.
const OUTCOMES = Object.fromEntries(
  SCENARIOS.map((scenario) => [scenario.id, scenarioOutcome(scenario, KEYS)]),
);

const INITIAL = {
  mode: 'consistent',
  serverIds: ['server-1', 'server-2', 'server-3', 'server-4'],
  vnodeCount: 150,
  replicationFactor: 1,
  previous: null,
  activePreset: null,
};

const nextServerName = (serverIds) =>
  `server-${Math.max(0, ...serverIds.map((id) => Number(id.split('-')[1]))) + 1}`;

function simulate({ mode, serverIds, vnodeCount, replicationFactor }) {
  return {
    points: mode === 'consistent' ? buildRing(serverIds, vnodeCount) : [],
    assignment: placeKeys(KEYS, { mode, vnodeCount, replicationFactor }, serverIds),
  };
}

function Verdict({ mode, serverIds, vnodeCount, replicationFactor, diff, gained, lastAction, orphanedCount }) {
  if (!diff) {
    return (
      <p className="verdict">
        <b>Run step 1</b> on the left, then 2, 3 and 4 in order &mdash; they build an argument.
        Each one sets up the cluster and performs the action for you.
      </p>
    );
  }

  const asPct = `${diff.changedPct.toFixed(1)}%`;

  if (mode === 'naive') {
    const n = serverIds.length;
    return (
      <p className="verdict bad">
        <span className="num">{asPct}</span> of keys changed server. Under <b>hash(key) % N</b> a
        key only stays put when <b>hash % {n - 1}</b> and <b>hash % {n}</b> agree, which happens for
        exactly <span className="num">1 in {n}</span> of all hash values &mdash; so{' '}
        <span className="num">{((1 - 1 / n) * 100).toFixed(0)}%</span> moving is not bad luck, it is
        the arithmetic. Every one of those keys is a cache miss.
      </p>
    );
  }

  if (replicationFactor > 1) {
    return (
      <p className="verdict good">
        <span className="num">{orphanedCount}</span> keys were lost &mdash; with{' '}
        <b>{replicationFactor} copies of everything</b>, every key the dead server held still lives
        on another machine. <span className="num">{diff.primaryChangedCount}</span> keys need a new
        primary, and each one is a <b>promotion of a server that already had the data</b>, not a
        fetch: reads never stop. The real cost is the{' '}
        <span className="num">{diff.newCopies}</span> copies the cluster must remake in the
        background to get back to {replicationFactor}.
      </p>
    );
  }

  if (lastAction === 'add') {
    return (
      <p className="verdict good">
        Only <span className="num">{asPct}</span> of keys moved, and every single one moved{' '}
        <b>onto the new server</b> &mdash; no key was shuffled between two servers that did not
        change. That is the whole point of the ring: a new server claims the stretch in front of
        each of its points and nothing else is disturbed.
      </p>
    );
  }

  if (gained?.length === 1) {
    return (
      <p className="verdict bad">
        The failed server's <span className="num">{diff.changedCount}</span> keys landed{' '}
        <b>entirely on {gained[0].serverId}</b> &mdash; <span className="num">100%</span> onto one
        machine. With <b>{vnodeCount} ring point{vnodeCount === 1 ? '' : 's'} per server</b>, a
        server owns one large unbroken arc, so exactly one neighbour inherits all of it. In
        production that neighbour is now the next thing to fall over.
      </p>
    );
  }

  return (
    <p className="verdict good">
      The failed server's <span className="num">{diff.changedCount}</span> keys were absorbed by{' '}
      <b>all {gained.length} surviving servers</b>, the largest share being{' '}
      <span className="num">{(gained[0].share * 100).toFixed(1)}%</span>. With{' '}
      <b>{vnodeCount} ring points each</b>, the dead server owned {vnodeCount} scattered slivers
      rather than one arc &mdash; so its load had {gained.length} different neighbours to fall to.
    </p>
  );
}

export default function App() {
  const [scope, setScope] = useState(INITIAL);
  const [lastAction, setLastAction] = useState(null);
  const scopeRef = useRef(null);

  const { points, assignment } = useMemo(() => simulate(scope), [scope]);

  const countsAfter = useMemo(
    () => countStoredPerServer(assignment, scope.serverIds),
    [assignment, scope.serverIds],
  );
  const countsBefore = useMemo(
    () => (scope.previous
      ? countStoredPerServer(scope.previous.assignment, scope.previous.serverIds)
      : null),
    [scope.previous],
  );
  const diff = useMemo(
    () => (scope.previous ? diffReplicaSets(scope.previous.assignment, assignment) : null),
    [scope.previous, assignment],
  );
  const gained = useMemo(
    () => (scope.previous ? copiesGainedBy(scope.previous.assignment, assignment) : null),
    [scope.previous, assignment],
  );
  const orphanedCount = useMemo(
    () => (scope.previous
      ? keysWithoutSurvivingCopy(scope.previous.assignment, scope.serverIds).length
      : 0),
    [scope.previous, scope.serverIds],
  );
  const movedKeys = useMemo(() => new Set(diff?.changedKeys ?? []), [diff]);

  const placements = useMemo(
    () => KEYS.map((key) => ({
      key,
      position: KEY_POSITIONS.get(key),
      serverId: assignment.get(key)?.[0], // the ring colours by primary owner
    })),
    [assignment],
  );

  function act(kind, updater) {
    setLastAction(kind);
    setScope((current) => ({
      ...current,
      ...updater(current),
      previous: { assignment: simulate(current).assignment, serverIds: current.serverIds },
      activePreset: null,
    }));
  }

  /** Changing the strategy, vnode count or replication invalidates any before/after. */
  function reconfigure(patch) {
    setLastAction(null);
    setScope((current) => ({ ...current, ...patch, previous: null, activePreset: null }));
  }

  function runPreset(id) {
    const scenario = SCENARIOS.find((s) => s.id === id);
    setLastAction(scenario.action);
    // Stacked layout puts the controls below the scope, so running a scenario
    // from down there would otherwise leave the result off-screen above.
    if (window.matchMedia('(max-width: 1180px)').matches) {
      scopeRef.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    }
    setScope({
      ...scenario.config,
      serverIds: scenario.after,
      previous: {
        assignment: placeKeys(KEYS, scenario.config, scenario.before),
        serverIds: scenario.before,
      },
      activePreset: id,
    });
  }

  const imbalance = imbalanceRatio(countsAfter);

  return (
    <div className="shell">
      <header className="masthead">
        <h1>Consistent Hashing <em>Scope</em></h1>
        <p>{KEY_COUNT} keys on a 32-bit ring. Add or fail a server and watch how much has to move.</p>
        <span className="spacer" />
        <a href="https://github.com/NeelVinay/consistent-hashing-visualizer" target="_blank" rel="noreferrer">
          source &amp; write-up &rarr;
        </a>
      </header>

      <div className="deck">
        <div className="stack">
          <Scenarios activePreset={scope.activePreset} onPreset={runPreset} outcomes={OUTCOMES} />
          <Controls
            mode={scope.mode}
            onMode={(mode) => reconfigure({ mode })}
            serverIds={scope.serverIds}
            onAddServer={() => act('add', (c) => ({ serverIds: [...c.serverIds, nextServerName(c.serverIds)] }))}
            onRemoveServer={(id) => act('remove', (c) => ({ serverIds: c.serverIds.filter((s) => s !== id) }))}
            vnodeCount={scope.vnodeCount}
            onVnodeCount={(vnodeCount) => reconfigure({ vnodeCount })}
            replicationFactor={scope.replicationFactor}
            onReplicationFactor={(replicationFactor) => reconfigure({ replicationFactor })}
            onReset={() => { setLastAction(null); setScope(INITIAL); }}
          />
        </div>

        <div className="stack" ref={scopeRef}>
          <RingScope
            points={points}
            keyPlacements={placements}
            movedKeys={movedKeys}
            mode={scope.mode}
            centerReadout={
              diff
                ? { value: `${diff.changedPct.toFixed(1)}%`, caption: 'OF KEYS AFFECTED' }
                : { value: String(KEY_COUNT), caption: `KEYS / ${scope.serverIds.length} SERVERS` }
            }
          />
          <Verdict
            mode={scope.mode}
            serverIds={scope.serverIds}
            vnodeCount={scope.vnodeCount}
            replicationFactor={scope.replicationFactor}
            diff={diff}
            gained={gained}
            lastAction={lastAction}
            orphanedCount={orphanedCount}
          />
          <Explainer />
        </div>

        <StatsPanel
          mode={scope.mode}
          serverIds={scope.serverIds}
          vnodeCount={scope.vnodeCount}
          replicationFactor={scope.replicationFactor}
          keyCount={KEY_COUNT}
          countsBefore={countsBefore}
          countsAfter={countsAfter}
          diff={diff}
          gained={gained}
          imbalance={imbalance}
          lastAction={lastAction}
          orphanedCount={orphanedCount}
        />
      </div>

      <p className="footnote">
        FNV-1a + MurmurHash3 finalizer &middot; ring 0x00000000&ndash;0xFFFFFFFF &middot; all
        simulation runs in your browser
      </p>
    </div>
  );
}
